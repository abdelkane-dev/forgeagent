import { and, desc, eq } from 'drizzle-orm'
import type { Workflow, WorkflowRun } from '@shared/types'
import { asAgent, schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { badRequest, conflict, notFound } from '../lib/errors'
import { logger } from '../lib/logger'
import { queue } from '../queue'
import { executeConnector, toolPrefix } from '../runtime/connectors'
import { runAgent } from '../runtime/run-agent'
import { notifyMembers, writeLog } from './settings'
import { emitWebhook } from './webhooks'

/**
 * Workflows of ONE agent: definitions, published versions, executions with per-step results,
 * retry on error and pause on human approval. A workflow can only use its own agent's tools,
 * model and data: there is no step that reaches another agent.
 */

const toWorkflow = (w: typeof s.workflows.$inferSelect): Workflow => ({ ...w })

export async function listWorkflows(tx: Tx, agentId: string) {
  return (await tx.select().from(s.workflows).where(eq(s.workflows.agentId, agentId)).orderBy(desc(s.workflows.updatedAt))).map(toWorkflow)
}

export async function saveWorkflow(tx: Tx, agentId: string, input: Omit<Workflow, 'agentId' | 'version' | 'updatedAt'> & { id?: string }, actor: string) {
  if (input.nodes[0]?.kind !== 'trigger') throw badRequest('La première étape doit être un déclencheur')
  const id = input.id ?? newId('wf')
  const [existing] = await tx.select().from(s.workflows).where(and(eq(s.workflows.id, id), eq(s.workflows.agentId, agentId)))
  const version = existing ? (input.published ? existing.version + 1 : existing.version) : 1
  const values = { id, agentId, name: input.name, trigger: input.trigger, nodes: input.nodes, published: input.published, version, updatedAt: new Date().toISOString() }
  if (existing) await tx.update(s.workflows).set(values).where(eq(s.workflows.id, id))
  else await tx.insert(s.workflows).values(values)
  if (input.published) {
    await tx
      .insert(s.workflowVersions)
      .values({ agentId, workflowId: id, version, definition: { trigger: input.trigger, nodes: input.nodes } })
      .onConflictDoNothing()
  }
  await audit(tx, agentId, { actor, actorType: 'user', action: input.published ? `a publié le workflow (v${version})` : 'a enregistré le workflow', target: input.name })
  return toWorkflow((await tx.select().from(s.workflows).where(eq(s.workflows.id, id)))[0])
}

export async function deleteWorkflow(tx: Tx, agentId: string, id: string, actor: string) {
  const [w] = await tx.delete(s.workflows).where(and(eq(s.workflows.id, id), eq(s.workflows.agentId, agentId))).returning()
  if (!w) throw notFound('Workflow')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a supprimé le workflow', target: w.name })
}

export async function listWorkflowRuns(tx: Tx, agentId: string, workflowId?: string): Promise<WorkflowRun[]> {
  const rows = await tx
    .select()
    .from(s.workflowRuns)
    .where(and(eq(s.workflowRuns.agentId, agentId), workflowId ? eq(s.workflowRuns.workflowId, workflowId) : undefined))
    .orderBy(desc(s.workflowRuns.startedAt))
    .limit(30)
  return rows.map(({ input: _i, cursor: _c, ...r }) => r)
}

/** Starts an execution. Drafts may only run in test mode; cron/webhook triggers need a published version. */
export async function startWorkflow(agentId: string, workflowId: string, trigger: 'manual' | 'cron' | 'webhook', input: string, opts: { test: boolean; actor: string }) {
  const runId = await asAgent(agentId, async (tx) => {
    const [w] = await tx.select().from(s.workflows).where(and(eq(s.workflows.id, workflowId), eq(s.workflows.agentId, agentId)))
    if (!w) throw notFound('Workflow')
    if (!w.published && !opts.test) throw conflict('Publiez le workflow avant de l’exécuter en production')
    const id = newId('wfr')
    await tx.insert(s.workflowRuns).values({ id, agentId, workflowId, version: w.version, trigger: `${trigger}${opts.test ? ' (test)' : ''}`, input: input.slice(0, 4000) })
    await audit(tx, agentId, { actor: opts.actor, actorType: trigger === 'manual' ? 'user' : 'system', action: 'a lancé le workflow', target: `${w.name} (${trigger})` })
    return id
  })
  await queue.add('workflows.run', 'advance', { agentId, runId, test: opts.test }, { jobId: `agent:${agentId}:wfr:${runId}:0` })
  return runId
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Executes steps from the run's cursor until the end, an error or an approval pause. */
export async function advance(agentId: string, runId: string, test: boolean) {
  const { run, wf, agent } = await asAgent(agentId, async (tx) => {
    const [run] = await tx.select().from(s.workflowRuns).where(eq(s.workflowRuns.id, runId))
    if (!run) return { run: null, wf: null, agent: null }
    const [wf] = await tx.select().from(s.workflows).where(eq(s.workflows.id, run.workflowId))
    const [agent] = await tx.select().from(s.agents).where(eq(s.agents.id, agentId))
    return { run, wf, agent }
  })
  if (!run || !wf || !agent || run.status === 'ok' || run.status === 'error') return
  const t0 = Date.now() - run.durationMs
  const steps = [...run.steps]
  let output = steps.at(-1)?.output || run.input
  let status: WorkflowRun['status'] = 'running'

  for (let i = run.cursor; i < wf.nodes.length; i++) {
    const node = wf.nodes[i]
    let attempts = 0
    let result: { status: 'ok' | 'error' | 'skipped' | 'waiting'; output: string } | null = null
    while (!result || (result.status === 'error' && node.retry && attempts < 3)) {
      if (attempts) await sleep(200 * 2 ** (attempts - 1))
      attempts++
      try {
        result = await executeNode(node, output)
      } catch (e) {
        result = { status: 'error', output: (e as Error).message }
      }
    }
    steps.push({ nodeId: node.id, label: node.label, status: result.status, attempts, output: result.output.slice(0, 500) })
    if (result.status === 'error') {
      status = 'error'
      break
    }
    if (result.status === 'waiting') {
      status = 'waiting_approval'
      await asAgent(agentId, (tx) => tx.update(s.workflowRuns).set({ cursor: i + 1, steps, status, durationMs: Date.now() - t0 }).where(eq(s.workflowRuns.id, runId)))
      return
    }
    if (result.status === 'skipped') {
      for (const rest of wf.nodes.slice(i + 1)) steps.push({ nodeId: rest.id, label: rest.label, status: 'skipped', attempts: 0, output: 'condition non remplie' })
      break
    }
    output = result.output
  }
  if (status === 'running') status = 'ok'
  await asAgent(agentId, async (tx) => {
    await tx.update(s.workflowRuns).set({ cursor: wf.nodes.length, steps, status, durationMs: Date.now() - t0 }).where(eq(s.workflowRuns.id, runId))
    await writeLog(tx, agentId, status === 'ok' ? 'info' : 'error', `workflow « ${wf.name} » ${status === 'ok' ? 'terminé' : 'en erreur'}`, { environment: test ? 'test' : 'production' })
    if (status === 'error') await notifyMembers(tx, agentId, `Workflow en erreur : ${wf.name}`, steps.at(-1)?.output ?? '', `/app/agents/${agentId}?tab=workflows`)
  })
  if (status === 'ok' && !test) void emitWebhook(agentId, 'workflow.completed', { workflowId: wf.id, runId, output: output.slice(0, 2000) })

  async function executeNode(node: (typeof wf.nodes)[number], previous: string): Promise<{ status: 'ok' | 'error' | 'skipped' | 'waiting'; output: string }> {
    switch (node.kind) {
      case 'trigger':
        return { status: 'ok', output: previous }
      case 'model': {
        const r = await runAgent(agentId, `${node.config || node.label}\n\nDonnées :\n${previous}`, { source: 'workflow', sandbox: test })
        return { status: r.status === 'ok' ? 'ok' : 'error', output: r.message.content }
      }
      case 'condition': {
        const words = (node.config || node.label).toLowerCase().split(',').map((w) => w.trim()).filter(Boolean)
        return words.some((w) => previous.toLowerCase().includes(w)) ? { status: 'ok', output: previous } : { status: 'skipped', output: 'condition non remplie' }
      }
      case 'approval': {
        if (test) return { status: 'ok', output: `[test] validation « ${node.label} » considérée accordée` }
        await asAgent(agentId, async (tx) => {
          await tx.insert(s.approvals).values({ id: newId('apr'), agentId, source: 'workflow', workflowRunId: runId, action: node.label, reason: `Workflow « ${wf!.name} »`, risk: 'medium', payload: { runId, nodeId: node.id } })
          await notifyMembers(tx, agentId, 'Validation de workflow requise', node.label, `/app/agents/${agentId}?tab=workflows`)
        })
        return { status: 'waiting', output: 'en attente de validation humaine' }
      }
      case 'tool': {
        const tool = node.config || node.label
        const grant = agent!.tools.find((t) => t.enabled && tool.startsWith(`${toolPrefix(t.connectorId)}_`))
        if (!grant) return { status: 'error', output: `Outil non accordé à cet agent : ${tool}` }
        if (tool.endsWith('_write') && grant.access !== 'read_write') return { status: 'error', output: 'Accès en lecture seule' }
        return { status: 'ok', output: executeConnector(tool, { query: previous.slice(0, 200), content: previous.slice(0, 500) }) }
      }
      case 'output': {
        const message = (node.config || '{{output}}').replace('{{output}}', previous).slice(0, 2000)
        await asAgent(agentId, (tx) => writeLog(tx, agentId, 'info', `workflow → ${message.slice(0, 200)}`, { environment: test ? 'test' : 'production' }))
        return { status: 'ok', output: message }
      }
    }
  }
}

/** Approval of a workflow step: resumes (approve) or ends in error (reject). */
export async function resumeWorkflow(agentId: string, workflowRunId: string, approved: boolean) {
  if (approved) {
    await asAgent(agentId, (tx) => tx.update(s.workflowRuns).set({ status: 'running' }).where(eq(s.workflowRuns.id, workflowRunId)))
    await queue.add('workflows.run', 'advance', { agentId, runId: workflowRunId, test: false }, { jobId: `agent:${agentId}:wfr:${workflowRunId}:${Date.now()}` })
  } else {
    await asAgent(agentId, (tx) => tx.update(s.workflowRuns).set({ status: 'error' }).where(eq(s.workflowRuns.id, workflowRunId)))
  }
}

export function startWorkflowWorker() {
  queue.process(
    'workflows.run',
    async (d) => {
      await advance(String(d.agentId), String(d.runId), !!d.test).catch((e) => logger.error({ err: e, runId: d.runId }, 'workflow failed'))
    },
    4,
  )
}
