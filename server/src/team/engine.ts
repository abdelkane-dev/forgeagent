import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { architect } from '../../agents/architect'
import { builder } from '../../agents/builder'
import { orchestrator } from '../../agents/orchestrator'
import { security } from '../../agents/security'
import { supervisor } from '../../agents/supervisor'
import { tester } from '../../agents/tester'
import { config } from '../config'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { newId, sha256 } from '../lib/crypto'
import { logger } from '../lib/logger'
import { costOf, llm } from '../llm'
import { queue } from '../queue'
import { notify } from '../services/settings'
import { capabilitiesFor } from './capabilities'
import type { Ceiling } from './plan'
import type { TeamAgent, TeamContext, TeamRole } from './types'

/**
 * The internal team. Agents never call each other: the orchestrator publishes tasks on
 * per-role queues, specialists consume them, results land in team_tasks, and every hop is
 * recorded in team_events so a request can be replayed step by step.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TEAM: Record<TeamRole, TeamAgent<any, any, any>> = { orchestrator, architect, builder, security, tester, supervisor }

export const MODEL_FOR: Record<TeamRole, () => string> = {
  orchestrator: () => config.MODEL_ORCHESTRATOR,
  architect: () => config.MODEL_ARCHITECT,
  builder: () => config.MODEL_BUILDER,
  security: () => config.MODEL_SECURITY,
  tester: () => config.MODEL_TESTER,
  supervisor: () => config.MODEL_SUPERVISOR,
}

const here = path.dirname(fileURLToPath(import.meta.url))
const promptCache = new Map<TeamRole, string>()
export function promptOf(role: TeamRole) {
  let p = promptCache.get(role)
  if (!p) {
    const candidates = [path.resolve(process.cwd(), 'agents', role, 'prompt.md'), path.resolve(here, '../../agents', role, 'prompt.md'), path.resolve(here, '../agents', role, 'prompt.md')]
    const file = candidates.find((f) => {
      try {
        readFileSync(f)
        return true
      } catch {
        return false
      }
    })
    if (!file) throw new Error(`prompt.md introuvable pour ${role}`)
    p = readFileSync(file, 'utf8')
    promptCache.set(role, p)
  }
  return p
}

const Q = (role: TeamRole) => `team.${role}`
const TERMINAL = ['done', 'failed', 'vetoed', 'stopped'] as const

class LimitError extends Error {}

/* ---------- Events ---------- */

async function event(requestId: string, fromRole: string, type: string, opts: { taskId?: string; toRole?: string; payload?: Record<string, unknown> } = {}) {
  await db.insert(s.teamEvents).values({ requestId, fromRole, type, taskId: opts.taskId ?? null, toRole: opts.toRole ?? null, payload: opts.payload ?? null })
  bus.publish('team', { requestId, type, fromRole, toRole: opts.toRole, at: new Date().toISOString() })
}

/* ---------- Requests ---------- */

export const CreateAgentInput = z.object({
  brief: z.string(),
  projectId: z.string(),
  maxActions: z.array(z.string()),
  autonomyCeiling: z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple']),
})

export async function startRequest(kind: 'create_agent' | 'supervise', input: Record<string, unknown>, createdBy: string | null) {
  const id = newId('req')
  await db.insert(s.teamRequests).values({ id, kind, input, createdBy })
  await event(id, 'user', 'request.created', { toRole: 'orchestrator', payload: { kind } })
  await audit(createdBy ?? 'Système', createdBy ? 'user' : 'system', 'a soumis une demande à l’équipe interne', kind, { requestId: id })
  await queue.add(Q('orchestrator'), 'step', { requestId: id, reason: 'start' })
  return id
}

async function finish(requestId: string, status: (typeof TERMINAL)[number] | 'awaiting_approval', patch: { result?: Record<string, unknown>; error?: string } = {}) {
  await db
    .update(s.teamRequests)
    .set({ status, ...patch, finishedAt: status === 'awaiting_approval' ? null : new Date().toISOString() })
    .where(eq(s.teamRequests.id, requestId))
  await event(requestId, 'orchestrator', `request.${status}`, { payload: patch.error ? { error: patch.error } : patch.result })
  if (status !== 'awaiting_approval') await audit('Orchestrateur', 'team', `a terminé la demande (${status})`, requestId, patch.error ? { error: patch.error } : undefined)
}

/* ---------- Flow (enforced in code) ---------- */

type TaskRow = typeof s.teamTasks.$inferSelect

const lastDone = (tasks: TaskRow[], role: TeamRole) => [...tasks].reverse().find((t) => t.role === role && t.status === 'done')

/** Allowed next roles given what has happened. The orchestrator can only pick from this list. */
function allowedNext(kind: string, tasks: TaskRow[], approved: boolean): TeamRole[] | 'done' {
  const specialists = tasks.filter((t) => t.role !== 'orchestrator')
  const last = specialists[specialists.length - 1]
  if (kind === 'supervise') return last ? 'done' : ['supervisor']
  if (!last) return ['architect']
  const out = last.output as Record<string, unknown> | null
  switch (last.role) {
    case 'architect':
      return ['security']
    case 'security': {
      const v = out?.verdict
      if (v === 'revise') return ['architect']
      if (v === 'veto') return 'done'
      if (v === 'needs_human' && !approved) return 'done'
      return ['builder']
    }
    case 'builder':
      return ['tester']
    case 'tester':
      return ['supervisor']
    default:
      return 'done'
  }
}

function inputFor(role: TeamRole, req: typeof s.teamRequests.$inferSelect, tasks: TaskRow[], instructions: string) {
  const input = req.input as z.infer<typeof CreateAgentInput>
  const ceiling: Ceiling = { maxActions: input.maxActions ?? [], autonomyCeiling: input.autonomyCeiling ?? 'act_after_approval' }
  const sec = lastDone(tasks, 'security')?.output as { plan?: unknown; reasons?: string[]; verdict?: string } | undefined
  switch (role) {
    case 'architect':
      return { brief: input.brief, projectId: input.projectId, ceiling, instructions: sec?.verdict === 'revise' ? `Révision demandée : ${(sec.reasons ?? []).join(' ; ')}` : instructions }
    case 'security':
      return { plan: lastDone(tasks, 'architect')!.output, ceiling }
    case 'builder':
      return { plan: sec!.plan, ceiling }
    case 'tester': {
      const b = lastDone(tasks, 'builder')!.output as { agentId: string }
      return { agentId: b.agentId, mission: (sec!.plan as { mission: string }).mission }
    }
    case 'supervisor': {
      const b = lastDone(tasks, 'builder')?.output as { agentId?: string } | undefined
      return b?.agentId ? { mode: 'register', agentId: b.agentId } : { mode: 'sweep' }
    }
    default:
      return {}
  }
}

/** Limits per request + loop detection. Throws LimitError, which stops the request. */
async function assertLimits(requestId: string, role: TeamRole, inputHash: string) {
  const [req] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
  if (req.steps >= config.TEAM_MAX_STEPS) throw new LimitError(`limite d’étapes atteinte (${config.TEAM_MAX_STEPS})`)
  if (role !== 'orchestrator' && req.agentCalls >= config.TEAM_MAX_AGENT_CALLS) throw new LimitError(`limite d’appels entre agents atteinte (${config.TEAM_MAX_AGENT_CALLS})`)
  if (req.tokens >= config.TEAM_MAX_TOKENS) throw new LimitError(`budget de tokens épuisé (${config.TEAM_MAX_TOKENS})`)
  const [rep] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.teamTasks)
    .where(and(eq(s.teamTasks.requestId, requestId), eq(s.teamTasks.role, role), eq(s.teamTasks.inputHash, inputHash)))
  if (role !== 'orchestrator' && rep.n >= config.TEAM_MAX_REPEATS) throw new LimitError(`boucle détectée : « ${role} » a déjà reçu ${rep.n} fois la même tâche`)
}

async function dispatch(requestId: string, role: TeamRole, input: Record<string, unknown>, parentId: string | null) {
  const inputHash = sha256(JSON.stringify(input))
  await assertLimits(requestId, role, inputHash)
  const id = newId('tsk')
  await db.insert(s.teamTasks).values({ id, requestId, parentId, role, input, inputHash, model: MODEL_FOR[role]() })
  await db
    .update(s.teamRequests)
    .set({ steps: sql`${s.teamRequests.steps} + 1`, agentCalls: role === 'orchestrator' ? sql`${s.teamRequests.agentCalls}` : sql`${s.teamRequests.agentCalls} + 1` })
    .where(eq(s.teamRequests.id, requestId))
  await event(requestId, 'orchestrator', 'task.dispatched', { taskId: id, toRole: role, payload: { inputHash } })
  if (role !== 'orchestrator') await queue.add(Q(role), 'run', { taskId: id })
  return id
}

/* ---------- Running one task (any role) ---------- */

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('réponse sans JSON')
  return JSON.parse(text.slice(start, end + 1))
}

async function execute(taskId: string) {
  const [task] = await db.select().from(s.teamTasks).where(eq(s.teamTasks.id, taskId))
  if (!task || task.status !== 'queued') return null
  const [req] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, task.requestId))
  if (TERMINAL.includes(req.status as (typeof TERMINAL)[number])) {
    await db.update(s.teamTasks).set({ status: 'cancelled' }).where(eq(s.teamTasks.id, taskId))
    return null
  }
  const role = task.role
  const agent = TEAM[role]
  const t0 = Date.now()
  let tokens = 0
  let cost = 0
  await db.update(s.teamTasks).set({ status: 'running', startedAt: new Date().toISOString() }).where(eq(s.teamTasks.id, taskId))
  await event(task.requestId, role, 'task.started', { taskId })

  const ctx: TeamContext = {
    requestId: task.requestId,
    taskId,
    role,
    caps: capabilitiesFor(role, task.requestId) as TeamContext['caps'],
    event: (type, payload) => event(task.requestId, role, type, { taskId, payload }),
    async think(user, schema, opts) {
      const model = MODEL_FOR[role]()
      let feedback = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        if (req.tokens + tokens >= config.TEAM_MAX_TOKENS) throw new LimitError(`budget de tokens épuisé (${config.TEAM_MAX_TOKENS})`)
        const res = await llm.complete({
          caller: role,
          model,
          system: promptOf(role),
          messages: [{ role: 'user', content: JSON.stringify(user) + feedback }],
          maxTokens: opts?.maxTokens ?? 1000,
        })
        tokens += res.usage.input + res.usage.output
        cost += costOf(model, res.usage)
        try {
          const parsed = schema.safeParse(extractJson(res.text))
          if (parsed.success) return parsed.data
          feedback = `\n\nTa réponse précédente était invalide (${parsed.error.issues[0]?.message}). Réponds uniquement avec le JSON demandé.`
        } catch (e) {
          feedback = `\n\nTa réponse précédente n’était pas du JSON valide (${(e as Error).message}).`
        }
      }
      throw new Error(`${agent.label} : sortie invalide après 2 essais`)
    },
  }

  try {
    const input = agent.input.parse(task.input)
    const output = agent.output.parse(await agent.run(ctx, input)) as Record<string, unknown>
    await db
      .update(s.teamTasks)
      .set({ status: role === 'security' && output.verdict === 'veto' ? 'vetoed' : 'done', output, tokens, cost, durationMs: Date.now() - t0, finishedAt: new Date().toISOString() })
      .where(eq(s.teamTasks.id, taskId))
    await db.update(s.teamRequests).set({ tokens: sql`${s.teamRequests.tokens} + ${tokens}`, cost: sql`${s.teamRequests.cost} + ${cost}` }).where(eq(s.teamRequests.id, task.requestId))
    await event(task.requestId, role, 'task.completed', { taskId, toRole: 'orchestrator', payload: { tokens, durationMs: Date.now() - t0 } })
    await audit(agent.label, 'team', 'a terminé une tâche', task.requestId, { taskId, tokens })
    return output
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.update(s.teamTasks).set({ status: 'failed', error: msg, tokens, cost, durationMs: Date.now() - t0, finishedAt: new Date().toISOString() }).where(eq(s.teamTasks.id, taskId))
    await db.update(s.teamRequests).set({ tokens: sql`${s.teamRequests.tokens} + ${tokens}`, cost: sql`${s.teamRequests.cost} + ${cost}` }).where(eq(s.teamRequests.id, task.requestId))
    await event(task.requestId, role, 'task.failed', { taskId, toRole: 'orchestrator', payload: { error: msg } })
    if (e instanceof LimitError) throw e
    return null
  }
}

/* ---------- Orchestrator step ---------- */

async function orchestrate(requestId: string, reason: string) {
  const [req] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
  if (!req || TERMINAL.includes(req.status as (typeof TERMINAL)[number])) return
  if (req.status === 'awaiting_approval' && reason !== 'approved') return
  const tasks = await db.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, requestId)).orderBy(asc(s.teamTasks.createdAt))
  const specialists = tasks.filter((t) => t.role !== 'orchestrator')
  const last = specialists[specialists.length - 1]

  try {
    if (last?.status === 'queued' || last?.status === 'running') return
    if (last?.status === 'failed') return finish(requestId, 'failed', { error: `${TEAM[last.role].label} : ${last.error}` })
    if (last?.status === 'vetoed') {
      await notify('Veto du Contrôleur sécurité', `Demande ${requestId} refusée.`, `/app/internal-team?request=${requestId}`)
      return finish(requestId, 'vetoed', { error: ((last.output?.reasons as string[]) ?? []).join(' ; ') || 'Veto sécurité' })
    }
    const approved = reason === 'approved' || (await db.select().from(s.approvals).where(and(eq(s.approvals.requestId, requestId), eq(s.approvals.status, 'approved')))).length > 0

    // Security asked for a human: park the request until someone decides in the console.
    if (last?.role === 'security' && last.output?.verdict === 'needs_human' && !approved) {
      const pending = await db.select().from(s.approvals).where(and(eq(s.approvals.requestId, requestId), eq(s.approvals.status, 'pending')))
      if (!pending.length) {
        const plan = last.output.plan as { name: string; allowedActions: string[] }
        await db.insert(s.approvals).values({
          id: newId('apr'),
          source: 'team',
          requestId,
          action: `Créer l’agent « ${plan.name} »`,
          reason: ((last.output.findings as string[]) ?? []).join(' · ') || 'Validation demandée par le Contrôleur sécurité',
          risk: 'high',
          payload: { allowedActions: plan.allowedActions },
        })
        await notify('Équipe interne : validation requise', `Créer « ${plan.name} »`, '/app/internal-team')
        await event(requestId, 'security', 'approval.requested', { toRole: 'user' })
      }
      return finish(requestId, 'awaiting_approval')
    }

    const allowed = allowedNext(req.kind, tasks, approved)
    if (allowed === 'done') {
      const b = lastDone(tasks, 'builder')?.output as { agentId?: string } | undefined
      const t = lastDone(tasks, 'tester')?.output as { passed?: boolean } | undefined
      const sup = lastDone(tasks, 'supervisor')?.output as { anomalies?: unknown[] } | undefined
      if (b?.agentId) await notify('Agent créé par l’équipe interne', `Tests ${t?.passed ? 'réussis' : 'à revoir'}`, `/app/agents/${b.agentId}`)
      return finish(requestId, 'done', { result: { agentId: b?.agentId ?? null, testsPassed: t?.passed ?? null, anomalies: sup?.anomalies?.length ?? 0 } })
    }

    // The orchestrator proposes; the code disposes.
    const history = specialists.map((t) => ({ role: t.role, status: t.status, summary: JSON.stringify(t.output ?? {}).slice(0, 300) }))
    const orchInput = { kind: req.kind, history, allowedNext: allowed }
    const orchTaskId = await dispatch(requestId, 'orchestrator', orchInput, last?.id ?? null)
    const decision = (await execute(orchTaskId)) as { next: string; instructions: string } | null
    if (!decision) return finish(requestId, 'failed', { error: 'Orchestrateur indisponible' })
    let next = decision.next as TeamRole
    if (!allowed.includes(next)) {
      await event(requestId, 'orchestrator', 'orchestrator.corrected', { payload: { proposed: decision.next, enforced: allowed[0] } })
      next = allowed[0]
    }
    await dispatch(requestId, next, inputFor(next, req, tasks, decision.instructions), orchTaskId)
  } catch (e) {
    if (e instanceof LimitError) {
      await audit('Orchestrateur', 'team', 'a arrêté une demande', requestId, { reason: e.message })
      return finish(requestId, 'stopped', { error: e.message })
    }
    throw e
  }
}

/** Called by the approvals route when a human decides on a team approval. */
export async function resumeAfterApproval(requestId: string, approved: boolean) {
  if (!approved) return finish(requestId, 'vetoed', { error: 'Refusé par un humain' })
  await db.update(s.teamRequests).set({ status: 'running' }).where(eq(s.teamRequests.id, requestId))
  await event(requestId, 'user', 'approval.granted', { toRole: 'orchestrator' })
  await queue.add(Q('orchestrator'), 'step', { requestId, reason: 'approved' })
}

/* ---------- Periodic supervision ---------- */

let lastSignature = ''
export async function sweep() {
  const caps = capabilitiesFor('supervisor', 'sweep')
  const health = await caps.readAgentHealth()
  const flagged = health.filter((h) => h.status === 'error' || (h.runs >= 5 && h.errors / h.runs > 0.1) || (h.cap > 0 && h.cost >= h.cap * 0.8))
  const signature = flagged.map((h) => `${h.id}:${h.status}`).sort().join('|')
  supervisorState.lastSweepAt = new Date().toISOString()
  supervisorState.watching = health.length
  if (!flagged.length || signature === lastSignature) return null
  lastSignature = signature
  return startRequest('supervise', { mode: 'sweep' }, null)
}
export const supervisorState = { lastSweepAt: null as string | null, watching: 0 }

/* ---------- Workers ---------- */

let started = false
export function startTeamWorkers() {
  if (started) return
  started = true
  queue.process(Q('orchestrator'), async (data) => orchestrate(String(data.requestId), String(data.reason ?? '')), 4)
  for (const role of ['architect', 'builder', 'security', 'tester', 'supervisor'] as const) {
    queue.process(
      Q(role),
      async (data) => {
        const taskId = String(data.taskId)
        const [task] = await db.select().from(s.teamTasks).where(eq(s.teamTasks.id, taskId))
        if (!task) return
        try {
          await execute(taskId)
        } catch (e) {
          if (!(e instanceof LimitError)) throw e
          await finish(task.requestId, 'stopped', { error: e.message })
          return
        }
        await queue.add(Q('orchestrator'), 'step', { requestId: task.requestId, reason: 'task_done' })
      },
      2,
    )
  }
  if (config.SUPERVISOR_INTERVAL_SEC > 0) void queue.every('team.sweep', 'sweep', config.SUPERVISOR_INTERVAL_SEC * 1000)
  queue.process('team.sweep', async () => void (await sweep()), 1)
  logger.info('team workers started')
}
