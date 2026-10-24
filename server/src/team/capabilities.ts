import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Role } from '@shared/types'
import { db, schema as s } from '../db/client'
import { ACTIONS } from '../domain/actions'
import { runChecks } from '../runtime/checks'
import { runAgent } from '../runtime/run-agent'
import { createAgent } from '../services/agents'
import { notify } from '../services/settings'
import type { AgentPlan, Ceiling } from './plan'
import { ROLE_CAPABILITIES, type TeamRole } from './types'

/**
 * Every side effect an internal agent can have. A role only ever receives the subset
 * listed in ROLE_CAPABILITIES; the object it gets literally does not contain the rest.
 */
export interface Capabilities {
  readRequest(): Promise<{ id: string; kind: string; input: Record<string, unknown>; status: string }>
  readCatalog(): Promise<{
    actions: { name: string; sensitive: boolean; risk: string }[]
    skills: { id: string; name: string; description: string }[]
    connectors: { id: string; name: string; description: string; enabled: boolean }[]
  }>
  readProject(projectId: string): Promise<{ id: string; name: string; description: string; stack: string[] } | null>
  createAgentFromPlan(plan: AgentPlan, ceiling: Ceiling, persona: string): Promise<{ agentId: string }>
  runChecks(agentId: string): ReturnType<typeof runChecks>
  runSandbox(agentId: string, input: string): Promise<{ status: string; content: string; tokens: number }>
  readAgentHealth(): Promise<{ id: string; name: string; status: string; runs: number; errors: number; cost: number; cap: number }[]>
  readRecentErrors(agentId: string): Promise<string[]>
  notify(title: string, body: string, href: string): Promise<void>
}

export function capabilitiesFor<R extends TeamRole>(role: R, requestId: string) {
  const all: Capabilities = {
    async readRequest() {
      const [r] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
      return { id: r.id, kind: r.kind, input: r.input, status: r.status }
    },
    async readCatalog() {
      const [skills, connectors] = await Promise.all([db.select().from(s.skills), db.select().from(s.connectors)])
      return {
        actions: Object.entries(ACTIONS).map(([name, a]) => ({ name, ...a })),
        skills: skills.map((k) => ({ id: k.id, name: k.name, description: k.description })),
        connectors: connectors.map((c) => ({ id: c.id, name: c.name, description: c.description, enabled: c.enabled })),
      }
    },
    async readProject(projectId) {
      const [p] = await db.select().from(s.projects).where(eq(s.projects.id, projectId))
      return p ? { id: p.id, name: p.name, description: p.description, stack: p.stack } : null
    },
    async createAgentFromPlan(plan, ceiling, persona) {
      const [req] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
      const projectId = String(req.input.projectId)
      // The agent gets the requesting user's grant rights, never more.
      const [user] = req.createdBy ? await db.select().from(s.users).where(eq(s.users.id, req.createdBy)) : []
      const actorRole: Role = user?.role ?? 'viewer'
      const allowed = plan.allowedActions.filter((a) => ceiling.maxActions.includes(a))
      const agent = await createAgent(
        {
          name: plan.name,
          role: plan.role,
          mission: plan.mission,
          type: plan.type,
          subcategory: plan.subcategory,
          autonomy: plan.autonomy,
          model: plan.model,
          tone: 'Professionnel',
          language: 'Français',
          persona: persona.slice(0, 4000),
          projectIds: [projectId],
          triggers: plan.triggers.map((k, i) => ({ id: `trg_${i + 1}`, kind: k, label: k, config: k === 'cron' ? '*/15 * * * *' : '', enabled: true })),
          tools: plan.tools.map((t) => ({ ...t, enabled: true })),
          capabilities: [],
          skillIds: plan.skillIds,
          integrations: plan.integrations,
          permissions: { allowedActions: allowed, roles: ['admin', 'editor'], people: [] },
          guardrails: { promptInjection: true, piiMasking: true, humanApproval: true, forbiddenActions: plan.forbiddenActions, rateLimitPerMin: 30 },
          costCapPerDay: plan.costCapPerDay,
          memory: { longTerm: false, sharedWithProject: false, retentionDays: 90 },
        },
        { id: user?.id ?? 'team', name: 'Constructeur (équipe interne)', role: actorRole },
        { actorType: 'team' },
      )
      return { agentId: agent.id }
    },
    runChecks: (agentId) => runChecks(agentId),
    async runSandbox(agentId, input) {
      const r = await runAgent(agentId, input, { source: 'team', sandbox: true })
      return { status: r.status, content: r.message.content, tokens: r.message.meta?.tokens ?? 0 }
    },
    async readAgentHealth() {
      const since = new Date(Date.now() - 86_400_000).toISOString()
      const agents = await db.select().from(s.agents).where(inArray(s.agents.status, ['active', 'error']))
      if (!agents.length) return []
      const stats = await db
        .select({
          agentId: s.runs.agentId,
          runs: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${s.runs.status} = 'error')::int`,
          cost: sql<number>`coalesce(sum(${s.runs.cost}),0)::float8`,
        })
        .from(s.runs)
        .where(and(gte(s.runs.startedAt, since), eq(s.runs.sandbox, false)))
        .groupBy(s.runs.agentId)
      return agents.map((a) => {
        const st = stats.find((x) => x.agentId === a.id)
        return { id: a.id, name: a.name, status: a.status, runs: st?.runs ?? 0, errors: st?.errors ?? 0, cost: st?.cost ?? 0, cap: a.costCapPerDay }
      })
    },
    async readRecentErrors(agentId) {
      const rows = await db
        .select({ message: s.logs.message })
        .from(s.logs)
        .where(and(eq(s.logs.agentId, agentId), inArray(s.logs.level, ['error', 'warn'])))
        .orderBy(desc(s.logs.at))
        .limit(15)
      return rows.map((r) => r.message)
    },
    notify: (title, body, href) => notify(title, body, href),
  }
  const allowed = ROLE_CAPABILITIES[role] as readonly (keyof Capabilities)[]
  return Object.fromEntries(allowed.map((k) => [k, all[k]])) as Pick<Capabilities, (typeof ROLE_CAPABILITIES)[R][number]>
}
