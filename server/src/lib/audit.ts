import { db, schema as s, type Tx } from '../db/client'

export type ActorType = 'user' | 'agent' | 'team' | 'system' | 'platform'

/**
 * Writes to the agent's own append-only audit log, inside the caller's isolated transaction:
 * the database refuses the row if the context does not cover this agent.
 */
export async function audit(
  tx: Tx,
  agentId: string,
  entry: { actor: string; actorType: ActorType; action: string; target: string; result?: 'ok' | 'refused' | 'error'; meta?: Record<string, unknown> },
) {
  await tx.insert(s.auditLog).values({ agentId, ...entry, result: entry.result ?? 'ok' })
}

/** Platform-level journal (accounts, projects, maintenance access). Never holds agent data. */
export async function platformAudit(actor: string, action: string, target: string, meta?: Record<string, unknown>) {
  await db.insert(s.platformAudit).values({ actor, action, target, meta })
}
