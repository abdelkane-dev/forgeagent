import { eq } from 'drizzle-orm'
import type { LogEntry, LogLevel, PlatformSettings } from '@shared/types'
import { db, schema as s, type Tx } from '../db/client'
import { bus } from '../lib/bus'
import { newId } from '../lib/crypto'
import { maskPii } from '../lib/logger'
import { storageKind } from '../lib/storage'
import { embedder } from '../lib/embeddings'

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await db.select().from(s.platformSettings).where(eq(s.platformSettings.id, 1))
  if (!row) throw new Error('platform_settings row missing: run the seed')
  return { ...row.data, anthropicKeySet: !!process.env.ANTHROPIC_API_KEY, embeddings: embedder.name, storage: storageKind }
}

export async function updatePlatformSettings(patch: Partial<PlatformSettings>) {
  const { anthropicKeySet: _a, embeddings: _e, storage: _s, ...cur } = await getPlatformSettings()
  const { anthropicKeySet: _b, embeddings: _f, storage: _t, ...rest } = patch
  await db.update(s.platformSettings).set({ data: { ...cur, ...rest } }).where(eq(s.platformSettings.id, 1))
  return getPlatformSettings()
}

/** Live channel of ONE agent. Subscribers only ever receive this agent's lines. */
export const logChannel = (agentId: string) => `agent:${agentId}:logs`

/** Agent log line: stored (PII-masked) in the agent's space and pushed to its own channel. */
export async function writeLog(tx: Tx, agentId: string, level: LogLevel, message: string, opts: { runId?: string; environment?: 'test' | 'production' } = {}) {
  const text = maskPii(message).slice(0, 2000)
  const [row] = await tx.insert(s.logs).values({ agentId, level, message: text, runId: opts.runId ?? null, environment: opts.environment ?? 'production' }).returning()
  const entry: LogEntry = { id: `log_${row.id}`, at: row.at, agentId, level, message: text, environment: row.environment, traceId: opts.runId }
  // Published after commit would be ideal; a rolled-back line is harmless in a live tail.
  bus.publish(logChannel(agentId), entry)
  return entry
}

/** Notifies the members of ONE agent (read inside the agent's context: only its members are visible). */
export async function notifyMembers(tx: Tx, agentId: string, title: string, body: string, href: string, roles: ('owner' | 'editor' | 'viewer')[] = ['owner', 'editor']) {
  const members = await tx.select().from(s.agentMembers).where(eq(s.agentMembers.agentId, agentId))
  const to = members.filter((m) => roles.includes(m.role))
  if (to.length) await tx.insert(s.notifications).values(to.map((m) => ({ id: newId('ntf'), userId: m.userId, agentId, title, body, href })))
}
