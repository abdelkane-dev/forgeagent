import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Agent, AgentDraft, AgentMetrics, AgentRole, AgentStatus } from '@shared/types'
import { schema as s, type Tx, serial } from '../db/client'
import { isKnownAction, isSensitive } from '../domain/actions'
import { audit, type ActorType } from '../lib/audit'
import { newId } from '../lib/crypto'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors'
import { generateDoc } from './docs'

type AgentRow = typeof s.agents.$inferSelect
export interface Actor {
  id: string
  name: string
  /** Role on this agent (owner for a creator). */
  role: AgentRole
  type?: ActorType
}

const EMPTY: AgentMetrics = { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 0, tokens24h: 0 }
const RANK: Record<AgentRole, number> = { viewer: 0, editor: 1, owner: 2 }
export const atLeast = (role: AgentRole | null | undefined, min: AgentRole) => !!role && RANK[role] >= RANK[min]

/** The caller's role on an agent, read inside its isolated context (null = not a member). */
export async function memberRole(tx: Tx, agentId: string, userId: string): Promise<AgentRole | null> {
  const [m] = await tx.select({ role: s.agentMembers.role }).from(s.agentMembers).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, userId)))
  return m?.role ?? null
}

async function metricsFor(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, AgentMetrics>()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rows = await tx
    .select({
      agentId: s.runs.agentId,
      runs: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${s.runs.status} = 'ok')::int`,
      cost: sql<number>`coalesce(sum(${s.runs.cost}), 0)::float8`,
      tokens: sql<number>`coalesce(sum(${s.runs.tokensIn} + ${s.runs.tokensOut}), 0)::int`,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${s.runs.durationMs}), 0)::int`,
    })
    .from(s.runs)
    .where(and(inArray(s.runs.agentId, ids), gte(s.runs.startedAt, since), eq(s.runs.environment, 'production')))
    .groupBy(s.runs.agentId)
  return new Map(
    rows.map((r) => [
      r.agentId,
      { runs24h: r.runs, successRate: r.runs ? Math.round((r.ok / r.runs) * 1000) / 10 : 100, costToday: Math.round(r.cost * 100) / 100, p50LatencyMs: r.p50, tokens24h: r.tokens },
    ]),
  )
}

/** Assembles front-end `Agent` objects. Every query runs in the caller's context: RLS filters it. */
export async function hydrate(tx: Tx, rows: AgentRow[], userId?: string): Promise<Agent[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [projectLinks, skillLinks, versions, metrics, mine] = await serial([
    () => tx.select().from(s.agentProjects).where(inArray(s.agentProjects.agentId, ids)),
    () => tx.select().from(s.agentSkills).where(inArray(s.agentSkills.agentId, ids)),
    () => tx
      .select({ agentId: s.agentVersions.agentId, version: s.agentVersions.version, note: s.agentVersions.note, author: s.agentVersions.author, createdAt: s.agentVersions.createdAt, regressionScore: s.agentVersions.regressionScore })
      .from(s.agentVersions)
      .where(inArray(s.agentVersions.agentId, ids)),
    () => metricsFor(tx, ids),
    () => userId ? tx.select().from(s.agentMembers).where(and(inArray(s.agentMembers.agentId, ids), eq(s.agentMembers.userId, userId))) : Promise.resolve([])])
  return rows.map((r) => {
    const { createdBy: _c, allowedActions, ...rest } = r
    return {
      ...rest,
      permissions: { allowedActions },
      projectIds: projectLinks.filter((l) => l.agentId === r.id).map((l) => l.projectId),
      skillIds: skillLinks.filter((l) => l.agentId === r.id).map((l) => l.skillId),
      versions: versions
        .filter((v) => v.agentId === r.id)
        .sort((a, b) => b.version - a.version)
        .map(({ agentId: _a, ...v }) => v),
      metrics: metrics.get(r.id) ?? EMPTY,
      myRole: mine.find((m) => m.agentId === r.id)?.role ?? 'viewer',
    }
  })
}

/** Agents of the caller. RLS returns only the agents they are a member of. */
export async function listAgents(tx: Tx, userId: string) {
  return hydrate(tx, await tx.select().from(s.agents).orderBy(desc(s.agents.updatedAt)), userId)
}

export async function getAgentRow(tx: Tx, id: string) {
  const [row] = await tx.select().from(s.agents).where(eq(s.agents.id, id))
  if (!row) throw notFound('Agent')
  return row
}

export async function getAgent(tx: Tx, id: string, userId?: string) {
  return (await hydrate(tx, [await getAgentRow(tx, id)], userId))[0]
}

/**
 * Grant ceiling, enforced in code (on top of RLS): catalogue actions only, never a forbidden one,
 * and only an agent owner may grant a sensitive action.
 */
export function assertGrantable(actions: string[], forbiddenList: string[], role: AgentRole) {
  for (const a of actions) {
    if (!isKnownAction(a)) throw badRequest(`Action inconnue : ${a}`)
    if (forbiddenList.includes(a)) throw badRequest(`Action à la fois autorisée et interdite : ${a}`)
    if (isSensitive(a) && role !== 'owner') throw forbidden(`Seul le propriétaire de l’agent peut accorder l’action sensible « ${a} »`)
  }
}

async function assertRefs(tx: Tx, projectIds?: string[], skillIds?: string[], connectorIds?: string[]) {
  if (projectIds?.length) {
    const found = await tx.select({ id: s.projects.id }).from(s.projects).where(inArray(s.projects.id, projectIds))
    if (found.length !== new Set(projectIds).size) throw badRequest('Projet inconnu')
  }
  if (skillIds?.length) {
    const found = await tx.select({ id: s.skills.id }).from(s.skills).where(inArray(s.skills.id, skillIds))
    if (found.length !== new Set(skillIds).size) throw badRequest('Skill inconnue')
  }
  if (connectorIds?.length) {
    const found = await tx.select({ id: s.connectors.id }).from(s.connectors).where(inArray(s.connectors.id, connectorIds))
    if (found.length !== new Set(connectorIds).size) throw badRequest('Connecteur inconnu')
  }
}

const CONFIG_KEYS = ['name', 'mission', 'role', 'type', 'subcategory', 'autonomy', 'model', 'tone', 'language', 'persona', 'triggers', 'tools', 'capabilities', 'integrations', 'guardrails', 'costCapPerDay', 'monthlyBudget', 'allowedOrigins', 'memory'] as const

export function snapshotOf(a: Agent) {
  const snap: Record<string, unknown> = { allowedActions: a.permissions.allowedActions, projectIds: a.projectIds, skillIds: a.skillIds }
  for (const k of CONFIG_KEYS) snap[k] = a[k]
  return snap
}

/** Creates an agent and makes the creator its owner, in one transaction (RLS: the creator claims it). */
export async function createAgent(tx: Tx, draft: AgentDraft, actor: { id: string; name: string }, opts: { status?: AgentStatus } = {}) {
  assertGrantable(draft.permissions.allowedActions, draft.guardrails.forbiddenActions, 'owner')
  await assertRefs(tx, draft.projectIds, draft.skillIds, draft.tools.map((t) => t.connectorId))
  const id = newId('agt')
  const { projectIds, skillIds, permissions, members, ...row } = draft
  // No RETURNING: the row only becomes visible once the owner membership exists.
  await tx.insert(s.agents).values({ ...row, id, allowedActions: permissions.allowedActions, status: opts.status ?? 'validated', version: 1, createdBy: actor.id })
  await tx.insert(s.agentMembers).values({ agentId: id, userId: actor.id, role: 'owner' })
  for (const m of members ?? []) {
    const [u] = await tx.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${m.email.toLowerCase()}`)
    if (u && u.id !== actor.id) await tx.insert(s.agentMembers).values({ agentId: id, userId: u.id, role: m.role === 'owner' ? 'editor' : m.role }).onConflictDoNothing()
  }
  if (projectIds.length) await tx.insert(s.agentProjects).values([...new Set(projectIds)].map((projectId) => ({ agentId: id, projectId })))
  if (skillIds.length) await tx.insert(s.agentSkills).values([...new Set(skillIds)].map((skillId) => ({ agentId: id, skillId })))
  const agent = await getAgent(tx, id, actor.id)
  await tx.insert(s.agentVersions).values({ agentId: id, version: 1, note: 'Création', author: actor.name, snapshot: snapshotOf(agent) })
  await generateDoc(tx, id)
  await audit(tx, id, { actor: actor.name, actorType: 'user', action: 'a créé l’agent', target: draft.name })
  return getAgent(tx, id, actor.id)
}

export type Patch = Partial<AgentDraft> & { versionNote?: string; regressionScore?: number | null }

export async function updateAgent(tx: Tx, id: string, patch: Patch, actor: Actor) {
  const current = await getAgent(tx, id, actor.id)
  const { versionNote, regressionScore, projectIds, skillIds, permissions, members: _m, ...fields } = patch
  const forbiddenList = (fields.guardrails ?? current.guardrails).forbiddenActions
  if (permissions) {
    // Only newly granted actions are checked against the actor's role: keeping an existing grant is fine.
    const added = permissions.allowedActions.filter((a) => !current.permissions.allowedActions.includes(a))
    assertGrantable(added, forbiddenList, actor.role)
  }
  const all = permissions?.allowedActions ?? current.permissions.allowedActions
  if (all.some((a) => forbiddenList.includes(a))) throw badRequest('Une action ne peut pas être à la fois autorisée et interdite')
  await assertRefs(tx, projectIds, skillIds, fields.tools?.map((t) => t.connectorId))
  const bump = versionNote !== undefined
  await tx
    .update(s.agents)
    .set({ ...fields, ...(permissions ? { allowedActions: permissions.allowedActions } : {}), updatedAt: new Date().toISOString(), ...(bump ? { version: current.version + 1 } : {}) })
    .where(eq(s.agents.id, id))
  if (projectIds) {
    await tx.delete(s.agentProjects).where(eq(s.agentProjects.agentId, id))
    if (projectIds.length) await tx.insert(s.agentProjects).values([...new Set(projectIds)].map((projectId) => ({ agentId: id, projectId })))
  }
  if (skillIds) {
    await tx.delete(s.agentSkills).where(eq(s.agentSkills.agentId, id))
    if (skillIds.length) await tx.insert(s.agentSkills).values([...new Set(skillIds)].map((skillId) => ({ agentId: id, skillId })))
  }
  const next = await getAgent(tx, id, actor.id)
  if (bump) {
    await tx.insert(s.agentVersions).values({ agentId: id, version: next.version, note: versionNote || 'Mise à jour', author: actor.name, snapshot: snapshotOf(next), regressionScore: regressionScore ?? null })
    await generateDoc(tx, id)
    await audit(tx, id, { actor: actor.name, actorType: actor.type ?? 'user', action: `a publié la v${next.version}`, target: next.name, meta: regressionScore != null ? { regressionScore } : undefined })
    return getAgent(tx, id, actor.id)
  }
  await audit(tx, id, { actor: actor.name, actorType: actor.type ?? 'user', action: 'a modifié la configuration', target: Object.keys(fields).join(', ') || 'liens' })
  return next
}

/** Allowed user transitions. starting/validated/error are set by tests and the runtime. */
const USER_TRANSITIONS: Partial<Record<AgentStatus, AgentStatus[]>> = {
  active: ['validated', 'inactive', 'active'],
  inactive: ['validated', 'active', 'error', 'inactive', 'starting'],
}

export async function setStatus(tx: Tx, id: string, status: AgentStatus, actor: Actor) {
  const a = await getAgentRow(tx, id)
  if (!USER_TRANSITIONS[status]?.includes(a.status)) throw conflict(a.status === 'error' ? 'Agent en erreur : relancez les tests pour le valider avant de l’activer' : `Transition impossible : ${a.status} → ${status}`)
  await tx.update(s.agents).set({ status, updatedAt: new Date().toISOString() }).where(eq(s.agents.id, id))
  await audit(tx, id, { actor: actor.name, actorType: 'user', action: status === 'active' ? 'a activé l’agent' : 'a mis l’agent en pause', target: a.name })
  return getAgent(tx, id, actor.id)
}

/** Status changes decided by the platform itself (tests passed, run failed…). */
export async function setSystemStatus(tx: Tx, id: string, status: AgentStatus, reason: string) {
  await tx.update(s.agents).set({ status, updatedAt: new Date().toISOString() }).where(eq(s.agents.id, id))
  await audit(tx, id, { actor: 'ForgeAgent', actorType: 'system', action: `statut → ${status}`, target: reason })
}

/** Restoring creates a new version with the old snapshot: nothing is ever lost. */
export async function restoreVersion(tx: Tx, id: string, version: number, actor: Actor) {
  const [v] = await tx.select().from(s.agentVersions).where(and(eq(s.agentVersions.agentId, id), eq(s.agentVersions.version, version)))
  if (!v) throw notFound('Version')
  const snap = v.snapshot as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of [...CONFIG_KEYS, 'projectIds', 'skillIds']) if (snap[k] !== undefined) patch[k] = snap[k]
  if (snap.allowedActions) patch.permissions = { allowedActions: snap.allowedActions }
  return updateAgent(tx, id, { ...(patch as Patch), versionNote: `Restauration de la v${version}` }, actor)
}

/** Copies the configuration only: knowledge, memory, secrets, keys and logs stay with the source agent. */
export async function duplicateAgent(tx: Tx, id: string, actor: Actor) {
  const src = await getAgent(tx, id, actor.id)
  const draft: AgentDraft = {
    name: `${src.name} (copie)`.slice(0, 80),
    mission: src.mission,
    role: src.role,
    type: src.type,
    subcategory: src.subcategory,
    autonomy: src.autonomy,
    model: src.model,
    tone: src.tone,
    language: src.language,
    persona: src.persona,
    projectIds: src.projectIds,
    triggers: src.triggers,
    tools: src.tools,
    capabilities: src.capabilities,
    skillIds: src.skillIds,
    integrations: src.integrations,
    permissions: { allowedActions: actor.role === 'owner' ? src.permissions.allowedActions : src.permissions.allowedActions.filter((a) => !isSensitive(a)) },
    guardrails: src.guardrails,
    costCapPerDay: src.costCapPerDay,
    monthlyBudget: src.monthlyBudget,
    allowedOrigins: [],
    memory: src.memory,
  }
  return createAgent(tx, draft, actor, { status: 'inactive' })
}
