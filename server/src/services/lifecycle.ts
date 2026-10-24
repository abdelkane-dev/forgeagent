import { eq, sql } from 'drizzle-orm'
import { scoped, schema as s, type Ctx } from '../db/client'
import { platformAudit } from '../lib/audit'
import { notFound } from '../lib/errors'
import { AgentStorage } from '../lib/storage'

/**
 * Export then purge of ONE agent. The export holds everything that belongs to the agent except
 * secret values and key hashes (never exported). The purge removes the database rows (cascade,
 * including vectors and the agent's audit), its stored files and its secrets.
 */
const EXPORTED = [
  ['members', s.agentMembers],
  ['projects', s.agentProjects],
  ['versions', s.agentVersions],
  ['skills', s.agentSkills],
  ['docs', s.agentDocs],
  ['integrations', s.integrations],
  ['knowledge', s.knowledgeDocs],
  ['memories', s.memories],
  ['runs', s.runs],
  ['logs', s.logs],
  ['approvals', s.approvals],
  ['audit', s.auditLog],
  ['usage', s.usageCosts],
  ['evalSuites', s.evalSuites],
  ['evalCases', s.evalCases],
  ['evalRuns', s.evalRuns],
  ['workflows', s.workflows],
  ['workflowRuns', s.workflowRuns],
  ['teamRequests', s.teamRequests],
  ['teamTasks', s.teamTasks],
] as const

export async function exportAgent(ctx: Ctx, agentId: string) {
  const data = await scoped(ctx, async (tx) => {
    const [agent] = await tx.select().from(s.agents).where(eq(s.agents.id, agentId))
    if (!agent) throw notFound('Agent')
    const out: Record<string, unknown> = { agent }
    for (const [name, table] of EXPORTED) out[name] = await tx.select().from(table).where(eq(table.agentId, agentId))
    out.secrets = (await tx.select({ name: s.agentSecrets.name, createdAt: s.agentSecrets.createdAt }).from(s.agentSecrets).where(eq(s.agentSecrets.agentId, agentId))).map((x) => ({ ...x, value: '[non exporté]' }))
    out.apiKeys = (await tx.select({ name: s.apiKeys.name, prefix: s.apiKeys.prefix, scope: s.apiKeys.scope }).from(s.apiKeys).where(eq(s.apiKeys.agentId, agentId))).map((k) => ({ ...k, secret: '[non exporté]' }))
    return out
  })
  const files = await new AgentStorage(agentId).list()
  return { exportedAt: new Date().toISOString(), format: 'forgeagent.agent-export.v1', ...data, files }
}

/** Owner only (enforced by RLS: forge_is_owner on agents). */
export async function purgeAgent(ctx: Ctx, agentId: string, actor: string) {
  const name = await scoped(ctx, async (tx) => {
    const [agent] = await tx.select({ name: s.agents.name }).from(s.agents).where(eq(s.agents.id, agentId))
    if (!agent) throw notFound('Agent')
    // Lets the append-only trigger accept the deletion of this agent's audit rows, and only those.
    await tx.execute(sql`select set_config('app.purge', ${agentId}, true)`)
    const deleted = await tx.delete(s.agents).where(eq(s.agents.id, agentId)).returning({ id: s.agents.id })
    if (!deleted.length) throw notFound('Agent')
    // Notifications of other users that point to this agent.
    await tx.delete(s.notifications).where(eq(s.notifications.agentId, agentId))
    return agent.name
  })
  const files = await new AgentStorage(agentId).removeAll()
  await platformAudit(actor, 'a supprimé et purgé un agent', `${name} (${agentId})`, { files })
  return { files }
}
