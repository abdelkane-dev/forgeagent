import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Agent, AgentDraft, AgentMetrics, Role } from '@shared/types'
import { db, schema as s } from '../db/client'
import { isKnownAction, isSensitive } from '../domain/actions'
import { audit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { badRequest, forbidden, notFound } from '../lib/errors'
import { can } from '../http/permissions'

type AgentRow = typeof s.agents.$inferSelect

const EMPTY: AgentMetrics = { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 0, tokens24h: 0 }

/** Metrics over the last 24 hours, computed from runs. */
async function metricsFor(ids: string[]) {
  if (!ids.length) return new Map<string, AgentMetrics>()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rows = await db
    .select({
      agentId: s.runs.agentId,
      runs: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${s.runs.status} = 'ok')::int`,
      cost: sql<number>`coalesce(sum(${s.runs.cost}), 0)::float8`,
      tokens: sql<number>`coalesce(sum(${s.runs.tokensIn} + ${s.runs.tokensOut}), 0)::int`,
      p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${s.runs.durationMs}), 0)::int`,
    })
    .from(s.runs)
    .where(and(inArray(s.runs.agentId, ids), gte(s.runs.startedAt, since), eq(s.runs.sandbox, false)))
    .groupBy(s.runs.agentId)
  return new Map(
    rows.map((r) => [
      r.agentId,
      { runs24h: r.runs, successRate: r.runs ? Math.round((r.ok / r.runs) * 1000) / 10 : 100, costToday: Math.round(r.cost * 100) / 100, p50LatencyMs: r.p50, tokens24h: r.tokens },
    ]),
  )
}

/** Assembles front-end `Agent` objects from the normalized tables, in a fixed number of queries. */
export async function hydrate(rows: AgentRow[]): Promise<Agent[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [projectLinks, skillLinks, versions, sites, metrics] = await Promise.all([
    db.select().from(s.agentProjects).where(inArray(s.agentProjects.agentId, ids)),
    db.select().from(s.agentSkills).where(inArray(s.agentSkills.agentId, ids)),
    db.select({ agentId: s.agentVersions.agentId, version: s.agentVersions.version, note: s.agentVersions.note, author: s.agentVersions.author, createdAt: s.agentVersions.createdAt }).from(s.agentVersions).where(inArray(s.agentVersions.agentId, ids)),
    db.select().from(s.integrations).where(inArray(s.integrations.agentId, ids)),
    metricsFor(ids),
  ])
  return rows.map((r) => {
    const site = sites.find((x) => x.agentId === r.id)
    const { createdBy: _c, ...rest } = r
    return {
      ...rest,
      projectIds: projectLinks.filter((l) => l.agentId === r.id).map((l) => l.projectId),
      skillIds: skillLinks.filter((l) => l.agentId === r.id).map((l) => l.skillId),
      versions: versions
        .filter((v) => v.agentId === r.id)
        .sort((a, b) => b.version - a.version)
        .map(({ agentId: _a, ...v }) => v),
      externalSite: site ? { url: site.url, status: site.status, lastPingAt: site.lastPingAt, latencyMs: site.latencyMs, allowedOrigins: site.allowedOrigins } : null,
      metrics: metrics.get(r.id) ?? EMPTY,
    }
  })
}

export async function listAgents() {
  return hydrate(await db.select().from(s.agents).orderBy(sql`${s.agents.updatedAt} desc`))
}

export async function getAgentRow(id: string) {
  const [row] = await db.select().from(s.agents).where(eq(s.agents.id, id))
  if (!row) throw notFound('Agent')
  return row
}

export async function getAgent(id: string) {
  return (await hydrate([await getAgentRow(id)]))[0]
}

/**
 * Permission ceiling, enforced in code: only catalogue actions, never a forbidden one,
 * and only admins may grant sensitive actions. An agent can never hold more than this.
 */
export function assertGrantable(actions: string[], forbiddenList: string[], role: Role) {
  for (const a of actions) {
    if (!isKnownAction(a)) throw badRequest(`Action inconnue : ${a}`)
    if (forbiddenList.includes(a)) throw badRequest(`Action à la fois autorisée et interdite : ${a}`)
    if (isSensitive(a) && !can(role, 'sensitive.grant')) throw forbidden(`Seul un administrateur peut accorder l’action sensible « ${a} »`)
  }
}

async function assertRefs(projectIds: string[] | undefined, skillIds: string[] | undefined, connectorIds: string[] | undefined) {
  if (projectIds?.length) {
    const found = await db.select({ id: s.projects.id }).from(s.projects).where(inArray(s.projects.id, projectIds))
    if (found.length !== new Set(projectIds).size) throw badRequest('Projet inconnu')
  }
  if (skillIds?.length) {
    const found = await db.select({ id: s.skills.id }).from(s.skills).where(inArray(s.skills.id, skillIds))
    if (found.length !== new Set(skillIds).size) throw badRequest('Skill inconnue')
  }
  if (connectorIds?.length) {
    const found = await db.select({ id: s.connectors.id }).from(s.connectors).where(inArray(s.connectors.id, connectorIds))
    if (found.length !== new Set(connectorIds).size) throw badRequest('Connecteur inconnu')
  }
}

const snapshotOf = (a: Agent) => {
  const { metrics: _m, versions: _v, externalSite: _e, ...rest } = a
  return rest as unknown as Record<string, unknown>
}

export async function createAgent(draft: AgentDraft, actor: { id: string; name: string; role: Role }, opts: { actorType?: 'user' | 'team' } = {}) {
  assertGrantable(draft.permissions.allowedActions, draft.guardrails.forbiddenActions, actor.role)
  await assertRefs(draft.projectIds, draft.skillIds, draft.tools.map((t) => t.connectorId))
  const id = newId('agt')
  const { projectIds, skillIds, ...row } = draft
  await db.transaction(async (tx) => {
    await tx.insert(s.agents).values({ ...row, id, status: 'active', version: 1, createdBy: opts.actorType === 'team' ? null : actor.id })
    if (projectIds.length) await tx.insert(s.agentProjects).values([...new Set(projectIds)].map((projectId) => ({ agentId: id, projectId })))
    if (skillIds.length) await tx.insert(s.agentSkills).values([...new Set(skillIds)].map((skillId) => ({ agentId: id, skillId })))
    await tx.insert(s.agentVersions).values({ agentId: id, version: 1, note: 'Création', author: actor.name, snapshot: { ...row, projectIds, skillIds } })
  })
  await audit(actor.name, opts.actorType ?? 'user', 'a créé l’agent', draft.name, { agentId: id })
  return getAgent(id)
}

type Patch = Partial<AgentDraft> & { status?: Agent['status']; versionNote?: string }

export async function updateAgent(id: string, patch: Patch, actor: { id: string; name: string; role: Role }) {
  const current = await getAgent(id)
  const { versionNote, projectIds, skillIds, ...fields } = patch
  if (fields.permissions || fields.guardrails) {
    // Only newly added actions are checked against the actor's role: keeping an existing grant is fine.
    const added = (fields.permissions?.allowedActions ?? []).filter((a) => !current.permissions.allowedActions.includes(a))
    assertGrantable(added, (fields.guardrails ?? current.guardrails).forbiddenActions, actor.role)
    const all = fields.permissions?.allowedActions ?? current.permissions.allowedActions
    const forbiddenList = (fields.guardrails ?? current.guardrails).forbiddenActions
    if (all.some((a) => forbiddenList.includes(a))) throw badRequest('Une action ne peut pas être à la fois autorisée et interdite')
  }
  await assertRefs(projectIds, skillIds, fields.tools?.map((t) => t.connectorId))
  const bump = versionNote !== undefined
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length || bump)
      await tx
        .update(s.agents)
        .set({ ...fields, updatedAt: new Date().toISOString(), ...(bump ? { version: current.version + 1 } : {}) })
        .where(eq(s.agents.id, id))
    if (projectIds) {
      await tx.delete(s.agentProjects).where(eq(s.agentProjects.agentId, id))
      if (projectIds.length) await tx.insert(s.agentProjects).values([...new Set(projectIds)].map((projectId) => ({ agentId: id, projectId })))
    }
    if (skillIds) {
      await tx.delete(s.agentSkills).where(eq(s.agentSkills.agentId, id))
      if (skillIds.length) await tx.insert(s.agentSkills).values([...new Set(skillIds)].map((skillId) => ({ agentId: id, skillId })))
    }
  })
  const next = await getAgent(id)
  if (bump) {
    await db.insert(s.agentVersions).values({ agentId: id, version: next.version, note: versionNote || 'Mise à jour', author: actor.name, snapshot: snapshotOf(next) })
    await audit(actor.name, 'user', `a publié la v${next.version}`, next.name)
    return getAgent(id)
  }
  if (fields.status && fields.status !== current.status) await audit(actor.name, 'user', fields.status === 'active' ? 'a activé' : 'a mis en pause', next.name)
  return next
}

export async function removeAgent(id: string, actor: { name: string }) {
  const a = await getAgentRow(id)
  await db.delete(s.agents).where(eq(s.agents.id, id))
  await audit(actor.name, 'user', 'a supprimé l’agent', a.name, { agentId: id })
}

/** Restoring creates a new version with the old snapshot: nothing is ever lost. */
export async function restoreVersion(id: string, version: number, actor: { id: string; name: string; role: Role }) {
  const [v] = await db.select().from(s.agentVersions).where(and(eq(s.agentVersions.agentId, id), eq(s.agentVersions.version, version)))
  if (!v) throw notFound('Version')
  const snap = v.snapshot as Partial<Agent>
  const keys = ['name', 'mission', 'role', 'type', 'subcategory', 'autonomy', 'model', 'tone', 'language', 'persona', 'triggers', 'tools', 'capabilities', 'integrations', 'permissions', 'guardrails', 'costCapPerDay', 'memory', 'projectIds', 'skillIds'] as const
  const patch: Patch = {}
  for (const k of keys) if (snap[k] !== undefined) (patch as Record<string, unknown>)[k] = snap[k]
  // Restoring re-checks the grant: an editor cannot restore a version an admin had widened.
  return updateAgent(id, { ...patch, versionNote: `Restauration de la v${version}` }, actor)
}

export async function duplicateAgent(id: string, projectId: string, actor: { id: string; name: string; role: Role }) {
  const src = await getAgent(id)
  const { id: _i, status: _s, version: _v, versions: _vs, metrics: _m, externalSite: _e, createdAt: _c, updatedAt: _u, ...draft } = src
  const copy = await createAgent({ ...draft, name: `${src.name} (copie)`.slice(0, 80), projectIds: [projectId] }, actor)
  await db.update(s.agents).set({ status: 'paused' }).where(eq(s.agents.id, copy.id))
  return getAgent(copy.id)
}
