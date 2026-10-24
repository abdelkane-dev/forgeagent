import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { asAgent, schema as s } from '../db/client'
import { ACTIONS } from '../domain/actions'
import { verifyCapability } from '../lib/crypto'
import { runChecks } from '../runtime/checks'
import { runAgent } from '../runtime/run-agent'
import { getAgent, setSystemStatus, updateAgent } from '../services/agents'
import { createSuite, runSuite } from '../services/evals'
import { notifyMembers } from '../services/settings'
import { spent } from '../services/usage'
import type { AgentPlan, Ceiling } from './plan'
import { ROLE_CAPABILITIES, type TeamRole } from './types'

/**
 * Every side effect an internal agent can have, each one bound to the task's target agent.
 * The capability token is verified before anything runs; every database access then happens
 * in that agent's context (RLS mode "task"): a task cannot read or write another agent.
 */
export interface Capabilities {
  readRequest(): Promise<{ id: string; kind: string; input: Record<string, unknown>; status: string }>
  readCatalog(): Promise<{
    actions: { name: string; sensitive: boolean; risk: string }[]
    skills: { id: string; name: string; description: string }[]
    connectors: { id: string; name: string; description: string; enabled: boolean }[]
  }>
  readProject(projectId: string): Promise<{ id: string; name: string; description: string; stack: string[] } | null>
  configureAgentFromPlan(plan: AgentPlan, ceiling: Ceiling, persona: string): Promise<{ agentId: string }>
  runChecks(): ReturnType<typeof runChecks>
  runSandbox(input: string): Promise<{ status: string; content: string; tokens: number }>
  runEvaluation(cases: { input: string; expect: string }[]): Promise<{ score: number; passed: number; total: number }>
  readAgentHealth(): Promise<{ id: string; name: string; status: string; runs: number; errors: number; cost: number; cap: number; month: number; budget: number }>
  readRecentErrors(): Promise<string[]>
  notify(title: string, body: string): Promise<void>
}

export function capabilitiesFor<R extends TeamRole>(role: R, agentId: string, requestId: string, token: string) {
  const guard = () => verifyCapability(token, { agentId })
  const as = <T,>(fn: Parameters<typeof asAgent<T>>[1]) => {
    guard()
    return asAgent(agentId, fn)
  }
  const all: Capabilities = {
    readRequest: () =>
      as(async (tx) => {
        const [r] = await tx.select().from(s.teamRequests).where(and(eq(s.teamRequests.id, requestId), eq(s.teamRequests.agentId, agentId)))
        return { id: r.id, kind: r.kind, input: r.input, status: r.status }
      }),
    // Platform catalogues: shared definitions, no agent data.
    readCatalog: () =>
      as(async (tx) => {
        const [skills, connectors] = await Promise.all([tx.select().from(s.skills), tx.select().from(s.connectors)])
        return {
          actions: Object.entries(ACTIONS).map(([name, a]) => ({ name, ...a })),
          skills: skills.map((k) => ({ id: k.id, name: k.name, description: k.description })),
          connectors: connectors.map((c) => ({ id: c.id, name: c.name, description: c.description, enabled: c.enabled })),
        }
      }),
    readProject: (projectId) =>
      as(async (tx) => {
        // Only a project the target agent is attached to.
        const [link] = await tx.select().from(s.agentProjects).where(and(eq(s.agentProjects.agentId, agentId), eq(s.agentProjects.projectId, projectId)))
        if (!link) return null
        const [p] = await tx.select().from(s.projects).where(eq(s.projects.id, projectId))
        return p ? { id: p.id, name: p.name, description: p.description, stack: p.stack } : null
      }),
    configureAgentFromPlan: (plan, ceiling, persona) =>
      as(async (tx) => {
        // Grants are re-clamped here to the user's ceiling, whatever the plan says.
        const allowed = plan.allowedActions.filter((a) => ceiling.maxActions.includes(a))
        await updateAgent(
          tx,
          agentId,
          {
            name: plan.name,
            role: plan.role,
            mission: plan.mission,
            type: plan.type,
            subcategory: plan.subcategory,
            autonomy: plan.autonomy,
            model: plan.model,
            persona: persona.slice(0, 4000),
            triggers: plan.triggers.map((k, i) => ({ id: `trg_${i + 1}`, kind: k, label: k, config: k === 'cron' ? '*/15 * * * *' : '', enabled: true })),
            tools: plan.tools.map((t) => ({ ...t, enabled: true })),
            skillIds: plan.skillIds,
            integrations: plan.integrations,
            permissions: { allowedActions: allowed },
            guardrails: { promptInjection: true, piiMasking: true, humanApproval: true, forbiddenActions: plan.forbiddenActions, rateLimitPerMin: 30 },
            costCapPerDay: plan.costCapPerDay,
            versionNote: 'Construit par l’équipe interne',
          },
          // The ceiling was checked against the requester when the request was created.
          { id: 'builder', name: 'builder', role: 'owner', type: 'team' },
        )
        return { agentId }
      }),
    runChecks: () => {
      guard()
      return runChecks(agentId)
    },
    runSandbox: async (input) => {
      guard()
      const r = await runAgent(agentId, input, { source: 'team', sandbox: true })
      return { status: r.status, content: r.message.content, tokens: r.message.meta?.tokens ?? 0 }
    },
    runEvaluation: async (cases) => {
      guard()
      const suiteId = await asAgent(agentId, (tx) => createSuite(tx, agentId, { name: 'Recette initiale', regression: true, cases }, 'tester'))
      const run = await runSuite(agentId, suiteId, 'team', { actor: 'tester' })
      await asAgent(agentId, (tx) => setSystemStatus(tx, agentId, run.score >= 50 ? 'validated' : 'error', `évaluation initiale : ${run.score} %`))
      return { score: run.score, passed: run.passed, total: run.total }
    },
    readAgentHealth: () =>
      as(async (tx) => {
        const since = new Date(Date.now() - 86_400_000).toISOString()
        const a = await getAgent(tx, agentId)
        const [st] = await tx
          .select({ runs: sql<number>`count(*)::int`, errors: sql<number>`count(*) filter (where ${s.runs.status} = 'error')::int` })
          .from(s.runs)
          .where(and(eq(s.runs.agentId, agentId), gte(s.runs.startedAt, since), eq(s.runs.environment, 'production')))
        const money = await spent(tx, agentId)
        return { id: a.id, name: a.name, status: a.status, runs: st.runs, errors: st.errors, cost: money.today, cap: a.costCapPerDay, month: money.month, budget: a.monthlyBudget }
      }),
    readRecentErrors: () =>
      as(async (tx) =>
        (
          await tx
            .select({ message: s.logs.message })
            .from(s.logs)
            .where(and(eq(s.logs.agentId, agentId), inArray(s.logs.level, ['error', 'warn'])))
            .orderBy(desc(s.logs.at))
            .limit(15)
        ).map((r) => r.message),
      ),
    notify: (title, body) => as((tx) => notifyMembers(tx, agentId, title, body, `/app/agents/${agentId}?tab=overview`)),
  }
  const allowed = ROLE_CAPABILITIES[role] as readonly (keyof Capabilities)[]
  return Object.fromEntries(allowed.map((k) => [k, all[k]])) as Pick<Capabilities, (typeof ROLE_CAPABILITIES)[R][number]>
}
