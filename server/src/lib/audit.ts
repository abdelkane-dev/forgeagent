import { db, schema as s } from '../db/client'
import type { Principal } from '../http/types'

type ActorType = 'user' | 'agent' | 'team' | 'system'

/** Writes to the append-only audit log: who (user, agent or internal role), what, on what, with what result. */
export async function audit(actor: string, actorType: ActorType, action: string, target: string, meta?: Record<string, unknown>) {
  await db.insert(s.auditLog).values({ actor, actorType, action, target, meta })
}

export const actorOf = (p: Principal | null): [string, ActorType] =>
  !p ? ['Anonyme', 'system'] : p.kind === 'user' ? [p.name, 'user'] : [`Clé ${p.keyId}`, 'system']
