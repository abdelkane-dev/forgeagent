import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { AgentDraft } from '@shared/types'
import { architect } from '../../agents/architect'
import { builder } from '../../agents/builder'
import { orchestrator } from '../../agents/orchestrator'
import { security } from '../../agents/security'
import { supervisor } from '../../agents/supervisor'
import { tester } from '../../agents/tester'
import { config } from '../config'
import { asAgent, scoped, schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { newId, sha256, signCapability, verifyCapability } from '../lib/crypto'
import { logger } from '../lib/logger'
import { costOf, llm } from '../llm'
import { queue } from '../queue'
import { agentIds } from '../runtime/jobs'
import { createAgent, setSystemStatus } from '../services/agents'
import { notifyMembers } from '../services/settings'
import { recordUsage } from '../services/usage'
import { capabilitiesFor } from './capabilities'
import type { Ceiling } from './plan'
import type { TeamAgent, TeamContext, TeamRole } from './types'

/**
 * The internal team. Agents never call each other: the orchestrator publishes tasks on
 * per-role queues, specialists consume them, results land in team_tasks, and every hop is
 * recorded in team_events and in the target agent's audit, so a request can be replayed.
 *
 * Every request works on exactly ONE agent. Each task carries a signed capability token for
 * that agent; all reads and writes happen in that agent's database context (RLS), and the
 * tokens spent are imputed to that agent.
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

/** The supervisor answers with the small model, and escalates when it works on an anomaly. */
const modelFor = (role: TeamRole, input: Record<string, unknown>) =>
  role === 'supervisor' && input.mode === 'sweep' ? config.MODEL_SUPERVISOR_ESCALATION : MODEL_FOR[role]()

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
export const teamChannel = (agentId: string) => `agent:${agentId}:team`

class LimitError extends Error {}

/* ---------- Events (team_events + the agent's audit) ---------- */

async function event(tx: Tx, agentId: string, requestId: string, fromRole: string, type: string, opts: { taskId?: string; toRole?: string; payload?: Record<string, unknown> } = {}) {
  await tx.insert(s.teamEvents).values({ agentId, requestId, fromRole, type, taskId: opts.taskId ?? null, toRole: opts.toRole ?? null, payload: opts.payload ?? null })
  await audit(tx, agentId, {
    actor: fromRole,
    actorType: fromRole === 'user' ? 'user' : 'team',
    action: `team.${type}`,
    target: requestId,
    result: type.endsWith('failed') || type.endsWith('vetoed') || type.endsWith('stopped') ? 'refused' : 'ok',
    meta: { taskId: opts.taskId, toRole: opts.toRole, ...(opts.payload ?? {}) },
  })
  bus.publish(teamChannel(agentId), { requestId, type, fromRole, toRole: opts.toRole, at: new Date().toISOString() })
}

/* ---------- Requests ---------- */

export const CreateAgentInput = z.object({
  brief: z.string().min(10).max(4000),
  projectId: z.string(),
  maxActions: z.array(z.string()),
  autonomyCeiling: z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple']),
})
export type CreateAgentInput = z.infer<typeof CreateAgentInput>

/** The agent exists from the first second, in "starting", so the whole build happens inside its walls. */
function shellDraft(input: CreateAgentInput): AgentDraft {
  return {
    name: 'Nouvel agent',
    mission: input.brief.slice(0, 500),
    role: 'En construction',
    type: 'conversational',
    subcategory: '',
    autonomy: 'suggest_only',
    model: 'claude-sonnet-5-5',
    tone: 'professionnel',
    language: 'fr',
    persona: '',
    projectIds: [input.projectId],
    triggers: [],
    tools: [],
    capabilities: [],
    skillIds: [],
    integrations: [],
    permissions: { allowedActions: [] },
    guardrails: { promptInjection: true, piiMasking: true, humanApproval: true, forbiddenActions: [], rateLimitPerMin: 30 },
    costCapPerDay: 5,
    monthlyBudget: 100,
    allowedOrigins: [],
    memory: { longTerm: false, shortTermTurns: 10, retentionDays: 30 },
  }
}

/** A user asks the team to forge an agent. The requester becomes its owner. */
export async function startCreateRequest(input: CreateAgentInput, user: { id: string; name: string }) {
  const { agentId, requestId } = await scoped({ mode: 'user', userId: user.id }, async (tx) => {
    const agent = await createAgent(tx, shellDraft(input), user, { status: 'starting' })
    const requestId = newId('req')
    await tx.insert(s.teamRequests).values({ id: requestId, agentId: agent.id, kind: 'create_agent', input, createdBy: user.id })
    await event(tx, agent.id, requestId, 'user', 'request.created', { toRole: 'orchestrator', payload: { kind: 'create_agent' } })
    return { agentId: agent.id, requestId }
  })
  await queue.add(Q('orchestrator'), 'step', { agentId, requestId, reason: 'start' })
  return { agentId, requestId }
}

/** Supervision of one existing agent (periodic sweep or after creation). */
export async function startSuperviseRequest(agentId: string, createdBy: string | null) {
  const requestId = newId('req')
  await asAgent(agentId, async (tx) => {
    await tx.insert(s.teamRequests).values({ id: requestId, agentId, kind: 'supervise', input: { mode: 'sweep' }, createdBy })
    await event(tx, agentId, requestId, createdBy ? 'user' : 'system', 'request.created', { toRole: 'orchestrator', payload: { kind: 'supervise' } })
  })
  await queue.add(Q('orchestrator'), 'step', { agentId, requestId, reason: 'start' })
  return requestId
}

async function finish(tx: Tx, agentId: string, requestId: string, status: (typeof TERMINAL)[number] | 'awaiting_approval', patch: { result?: Record<string, unknown>; error?: string } = {}) {
  await tx
    .update(s.teamRequests)
    .set({ status, ...patch, finishedAt: status === 'awaiting_approval' ? null : new Date().toISOString() })
    .where(and(eq(s.teamRequests.id, requestId), eq(s.teamRequests.agentId, agentId)))
  await event(tx, agentId, requestId, 'orchestrator', `request.${status}`, { payload: patch.error ? { error: patch.error } : patch.result })
  const [req] = await tx.select({ kind: s.teamRequests.kind }).from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
  // A forge that did not complete leaves the agent visibly broken, never half-active.
  if (req?.kind === 'create_agent' && (status === 'failed' || status === 'vetoed' || status === 'stopped')) await setSystemStatus(tx, agentId, 'error', patch.error ?? status)
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
  if (req.kind === 'supervise') return { mode: 'sweep' }
  const input = req.input as CreateAgentInput
  const ceiling: Ceiling = { maxActions: input.maxActions ?? [], autonomyCeiling: input.autonomyCeiling ?? 'act_after_approval' }
  const sec = lastDone(tasks, 'security')?.output as { plan?: unknown; reasons?: string[]; verdict?: string } | undefined
  switch (role) {
    case 'architect':
      return { brief: input.brief, projectId: input.projectId, ceiling, instructions: sec?.verdict === 'revise' ? `Révision demandée : ${(sec.reasons ?? []).join(' ; ')}` : instructions }
    case 'security':
      return { plan: lastDone(tasks, 'architect')!.output, ceiling }
    case 'builder':
      return { plan: sec!.plan, ceiling }
    case 'tester':
      return { mission: (sec!.plan as { mission: string }).mission }
    case 'supervisor':
      return { mode: 'register' }
    default:
      return {}
  }
}

/** Limits per request + loop detection. Throws LimitError, which stops the request. */
async function assertLimits(tx: Tx, requestId: string, role: TeamRole, inputHash: string) {
  const [req] = await tx.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
  if (req.steps >= config.TEAM_MAX_STEPS) throw new LimitError(`limite d’étapes atteinte (${config.TEAM_MAX_STEPS})`)
  if (role !== 'orchestrator' && req.agentCalls >= config.TEAM_MAX_AGENT_CALLS) throw new LimitError(`limite d’appels entre agents atteinte (${config.TEAM_MAX_AGENT_CALLS})`)
  if (req.tokens >= config.TEAM_MAX_TOKENS) throw new LimitError(`budget de tokens épuisé (${config.TEAM_MAX_TOKENS})`)
  const [rep] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.teamTasks)
    .where(and(eq(s.teamTasks.requestId, requestId), eq(s.teamTasks.role, role), eq(s.teamTasks.inputHash, inputHash)))
  if (role !== 'orchestrator' && rep.n >= config.TEAM_MAX_REPEATS) throw new LimitError(`boucle détectée : « ${role} » a déjà reçu ${rep.n} fois la même tâche`)
}

/** Creates the task and its capability token. Specialists are queued; the orchestrator runs inline. */
async function dispatch(tx: Tx, agentId: string, requestId: string, role: TeamRole, input: Record<string, unknown>, parentId: string | null) {
  const inputHash = sha256(JSON.stringify(input))
  await assertLimits(tx, requestId, role, inputHash)
  const id = newId('tsk')
  await tx.insert(s.teamTasks).values({ id, agentId, requestId, parentId, role, input, inputHash, model: modelFor(role, input) })
  await tx
    .update(s.teamRequests)
    .set({ steps: sql`${s.teamRequests.steps} + 1`, agentCalls: role === 'orchestrator' ? sql`${s.teamRequests.agentCalls}` : sql`${s.teamRequests.agentCalls} + 1` })
    .where(eq(s.teamRequests.id, requestId))
  const cap = signCapability({ agentId, taskId: id, role, exp: Date.now() + config.CAPABILITY_TTL_SEC * 1000 })
  if (role !== 'orchestrator') await event(tx, agentId, requestId, 'orchestrator', 'task.dispatched', { taskId: id, toRole: role, payload: { inputHash } })
  return { id, cap }
}

/* ---------- Running one task (any role) ---------- */

function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('réponse sans JSON')
  return JSON.parse(text.slice(start, end + 1))
}

/** Runs one task. Its token must name this agent and this task; the task is read in the agent's context. */
async function execute(agentId: string, taskId: string, cap: string) {
  const grant = verifyCapability(cap, { agentId, taskId })
  const loaded = await asAgent(agentId, async (tx) => {
    const [task] = await tx.select().from(s.teamTasks).where(and(eq(s.teamTasks.id, taskId), eq(s.teamTasks.agentId, agentId)))
    if (!task || task.status !== 'queued' || task.role !== grant.role) return null
    const [req] = await tx.select().from(s.teamRequests).where(eq(s.teamRequests.id, task.requestId))
    if (TERMINAL.includes(req.status as (typeof TERMINAL)[number])) {
      await tx.update(s.teamTasks).set({ status: 'cancelled' }).where(eq(s.teamTasks.id, taskId))
      return null
    }
    await tx.update(s.teamTasks).set({ status: 'running', startedAt: new Date().toISOString() }).where(eq(s.teamTasks.id, taskId))
    if (task.role !== 'orchestrator') await event(tx, agentId, task.requestId, task.role, 'task.started', { taskId })
    return { task, req }
  })
  if (!loaded) return null
  const { task, req } = loaded
  const role = task.role
  const agent = TEAM[role]
  const model = task.model ?? MODEL_FOR[role]()
  const t0 = Date.now()
  const used = { input: 0, output: 0 }
  const tokens = () => used.input + used.output

  const ctx: TeamContext = {
    requestId: task.requestId,
    taskId,
    agentId,
    role,
    caps: capabilitiesFor(role, agentId, task.requestId, cap) as TeamContext['caps'],
    event: (type, payload) => asAgent(agentId, (tx) => event(tx, agentId, task.requestId, role, type, { taskId, payload })),
    async think(user, schema, opts) {
      let feedback = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        if (req.tokens + tokens() >= config.TEAM_MAX_TOKENS) throw new LimitError(`budget de tokens épuisé (${config.TEAM_MAX_TOKENS})`)
        const res = await llm.complete({
          caller: role,
          model,
          system: promptOf(role),
          // Outputs of other roles reach this one as data inside the user message, never as instructions.
          messages: [{ role: 'user', content: JSON.stringify(user) + feedback }],
          maxTokens: opts?.maxTokens ?? 1000,
        })
        used.input += res.usage.input
        used.output += res.usage.output
        try {
          const parsed = schema.safeParse(extractJson(res.text))
          if (parsed.success) return parsed.data
          feedback = `\n\nTa réponse précédente était invalide (${parsed.error.issues[0]?.message}). Réponds uniquement avec le JSON demandé.`
        } catch (e) {
          feedback = `\n\nTa réponse précédente n’était pas du JSON valide (${(e as Error).message}).`
        }
      }
      throw new Error(`${role} : sortie invalide après 2 essais`)
    },
  }

  /** Tokens are imputed to the target agent's usage, whatever the outcome. */
  const settle = (tx: Tx, patch: Partial<TaskRow>) => {
    const cost = costOf(model, used)
    return Promise.all([
      tx.update(s.teamTasks).set({ ...patch, tokens: tokens(), cost, durationMs: Date.now() - t0, finishedAt: new Date().toISOString() }).where(eq(s.teamTasks.id, taskId)),
      tx.update(s.teamRequests).set({ tokens: sql`${s.teamRequests.tokens} + ${tokens()}`, cost: sql`${s.teamRequests.cost} + ${cost}` }).where(eq(s.teamRequests.id, task.requestId)),
      tokens() ? recordUsage(tx, agentId, { source: 'team', model, tokensIn: used.input, tokensOut: used.output, environment: 'test', refId: taskId, cost }) : null,
    ])
  }

  try {
    const input = agent.input.parse(task.input)
    const output = agent.output.parse(await agent.run(ctx, input)) as Record<string, unknown>
    await asAgent(agentId, async (tx) => {
      await settle(tx, { status: role === 'security' && output.verdict === 'veto' ? 'vetoed' : 'done', output })
      if (role !== 'orchestrator') await event(tx, agentId, task.requestId, role, 'task.completed', { taskId, toRole: 'orchestrator', payload: { tokens: tokens(), durationMs: Date.now() - t0 } })
    })
    return output
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await asAgent(agentId, async (tx) => {
      await settle(tx, { status: 'failed', error: msg })
      await event(tx, agentId, task.requestId, role, 'task.failed', { taskId, toRole: 'orchestrator', payload: { error: msg } })
    })
    if (e instanceof LimitError) throw e
    return null
  }
}

/* ---------- Orchestrator step ---------- */

type Step =
  | { kind: 'idle' }
  | { kind: 'decide'; orch: { id: string; cap: string }; allowed: TeamRole[]; req: typeof s.teamRequests.$inferSelect; tasks: TaskRow[] }

async function orchestrate(agentId: string, requestId: string, reason: string) {
  try {
    const step = await asAgent(agentId, async (tx): Promise<Step> => {
      const [req] = await tx.select().from(s.teamRequests).where(and(eq(s.teamRequests.id, requestId), eq(s.teamRequests.agentId, agentId)))
      if (!req || TERMINAL.includes(req.status as (typeof TERMINAL)[number])) return { kind: 'idle' }
      if (req.status === 'awaiting_approval' && reason !== 'approved') return { kind: 'idle' }
      const tasks = await tx.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, requestId)).orderBy(asc(s.teamTasks.createdAt))
      const specialists = tasks.filter((t) => t.role !== 'orchestrator')
      const last = specialists[specialists.length - 1]

      if (last?.status === 'queued' || last?.status === 'running') return { kind: 'idle' }
      if (last?.status === 'failed') {
        await finish(tx, agentId, requestId, 'failed', { error: `${last.role} : ${last.error}` })
        return { kind: 'idle' }
      }
      if (last?.status === 'vetoed') {
        const error = ((last.output?.reasons as string[]) ?? []).join(' ; ') || 'Veto sécurité'
        await notifyMembers(tx, agentId, 'La Forge : veto de la Sentinelle', error, `/app/agents/${agentId}?tab=audit`)
        await finish(tx, agentId, requestId, 'vetoed', { error })
        return { kind: 'idle' }
      }
      const approved = reason === 'approved' || (await tx.select().from(s.approvals).where(and(eq(s.approvals.requestId, requestId), eq(s.approvals.status, 'approved')))).length > 0

      // Security asked for a human: park the request until a member of this agent decides.
      if (last?.role === 'security' && last.output?.verdict === 'needs_human' && !approved) {
        const pending = await tx.select().from(s.approvals).where(and(eq(s.approvals.requestId, requestId), eq(s.approvals.status, 'pending')))
        if (!pending.length) {
          const plan = last.output.plan as { name: string; allowedActions: string[] }
          await tx.insert(s.approvals).values({
            id: newId('apr'),
            agentId,
            source: 'team',
            requestId,
            action: `Forger l’agent « ${plan.name} »`,
            reason: ((last.output.findings as string[]) ?? []).join(' · ') || 'Validation demandée par la Sentinelle',
            risk: 'high',
            payload: { allowedActions: plan.allowedActions },
          })
          await notifyMembers(tx, agentId, 'La Forge : validation requise', `Forger « ${plan.name} »`, `/app/agents/${agentId}?tab=overview`, ['owner'])
          await event(tx, agentId, requestId, 'security', 'approval.requested', { toRole: 'user' })
        }
        await finish(tx, agentId, requestId, 'awaiting_approval')
        return { kind: 'idle' }
      }

      const allowed = allowedNext(req.kind, tasks, approved)
      if (allowed === 'done') {
        const t = lastDone(tasks, 'tester')?.output as { passed?: boolean } | undefined
        const sup = lastDone(tasks, 'supervisor')?.output as { anomalies?: unknown[] } | undefined
        if (req.kind === 'create_agent') await notifyMembers(tx, agentId, 'La Forge : agent forgé', `Tests ${t?.passed ? 'réussis' : 'à revoir'}`, `/app/agents/${agentId}`)
        await finish(tx, agentId, requestId, 'done', { result: { agentId, testsPassed: t?.passed ?? null, anomalies: sup?.anomalies?.length ?? 0 } })
        return { kind: 'idle' }
      }
      // The orchestrator proposes; the code disposes. History is truncated, untrusted data.
      const history = specialists.map((t) => ({ role: t.role, status: t.status, summary: JSON.stringify(t.output ?? {}).slice(0, 300) }))
      const orch = await dispatch(tx, agentId, requestId, 'orchestrator', { kind: req.kind, history, allowedNext: allowed }, last?.id ?? null)
      return { kind: 'decide', orch, allowed, req, tasks }
    })
    if (step.kind === 'idle') return

    const decision = (await execute(agentId, step.orch.id, step.orch.cap)) as { next: string; instructions: string } | null
    const next = await asAgent(agentId, async (tx) => {
      if (!decision) {
        await finish(tx, agentId, requestId, 'failed', { error: 'Orchestrateur indisponible' })
        return null
      }
      await event(tx, agentId, requestId, 'orchestrator', 'orchestrator.decided', { taskId: step.orch.id, payload: { next: decision.next, instructions: decision.instructions } })
      let role = decision.next as TeamRole
      if (!step.allowed.includes(role)) {
        await event(tx, agentId, requestId, 'orchestrator', 'orchestrator.corrected', { payload: { proposed: decision.next, enforced: step.allowed[0] } })
        role = step.allowed[0]
      }
      return { role, ...(await dispatch(tx, agentId, requestId, role, inputFor(role, step.req, step.tasks, decision.instructions), step.orch.id)) }
    })
    if (next) await queue.add(Q(next.role), 'run', { agentId, taskId: next.id, cap: next.cap }, { jobId: `agent:${agentId}:team:${next.id}` })
  } catch (e) {
    if (!(e instanceof LimitError)) throw e
    await asAgent(agentId, (tx) => finish(tx, agentId, requestId, 'stopped', { error: e.message }))
  }
}

/** Called by the approvals route when a member of this agent decides on a team approval. */
export async function resumeAfterApproval(agentId: string, requestId: string, approved: boolean, by: string) {
  await asAgent(agentId, async (tx) => {
    if (!approved) return finish(tx, agentId, requestId, 'vetoed', { error: `Refusé par ${by}` })
    await tx.update(s.teamRequests).set({ status: 'running' }).where(and(eq(s.teamRequests.id, requestId), eq(s.teamRequests.agentId, agentId)))
    await event(tx, agentId, requestId, 'user', 'approval.granted', { toRole: 'orchestrator', payload: { by } })
  })
  if (approved) await queue.add(Q('orchestrator'), 'step', { agentId, requestId, reason: 'approved' })
}

/* ---------- Periodic supervision, one agent at a time ---------- */

const lastSignature = new Map<string, string>()
export const supervisorState = { lastSweepAt: null as string | null, watching: 0 }

export async function sweep() {
  const ids = await agentIds(['active', 'validated', 'error'])
  const started: string[] = []
  for (const agentId of ids) {
    // A short-lived token for a read-only health check of this agent only.
    const cap = signCapability({ agentId, taskId: 'sweep', role: 'supervisor', exp: Date.now() + 60_000 })
    const h = await capabilitiesFor('supervisor', agentId, 'sweep', cap).readAgentHealth()
    const flagged = h.status === 'error' || (h.runs >= 5 && h.errors / h.runs > 0.1) || (h.cap > 0 && h.cost >= h.cap * 0.8) || (h.budget > 0 && h.month >= h.budget * 0.8)
    const signature = flagged ? `${h.status}:${h.errors}` : ''
    if (flagged && signature !== lastSignature.get(agentId)) started.push(await startSuperviseRequest(agentId, null))
    lastSignature.set(agentId, signature)
  }
  supervisorState.lastSweepAt = new Date().toISOString()
  supervisorState.watching = ids.length
  return started
}

/* ---------- Workers ---------- */

let started = false
export function startTeamWorkers() {
  if (started) return
  started = true
  queue.process(Q('orchestrator'), async (d) => orchestrate(String(d.agentId), String(d.requestId), String(d.reason ?? '')), 4)
  for (const role of ['architect', 'builder', 'security', 'tester', 'supervisor'] as const) {
    queue.process(
      Q(role),
      async (d) => {
        const agentId = String(d.agentId)
        const taskId = String(d.taskId)
        const requestId = await asAgent(agentId, async (tx) => (await tx.select({ r: s.teamTasks.requestId }).from(s.teamTasks).where(and(eq(s.teamTasks.id, taskId), eq(s.teamTasks.agentId, agentId))))[0]?.r)
        if (!requestId) return
        try {
          await execute(agentId, taskId, String(d.cap))
        } catch (e) {
          if (!(e instanceof LimitError)) throw e
          await asAgent(agentId, (tx) => finish(tx, agentId, requestId, 'stopped', { error: e.message }))
          return
        }
        await queue.add(Q('orchestrator'), 'step', { agentId, requestId, reason: 'task_done' })
      },
      2,
    )
  }
  if (config.SUPERVISOR_INTERVAL_SEC > 0) void queue.every('team.sweep', 'sweep', config.SUPERVISOR_INTERVAL_SEC * 1000)
  queue.process('team.sweep', async () => void (await sweep()), 1)
  logger.info('team workers started')
}
