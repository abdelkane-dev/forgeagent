import { eq } from 'drizzle-orm'
import type { LogEntry, LogLevel, Settings } from '@shared/types'
import { db, schema as s } from '../db/client'
import { bus } from '../lib/bus'
import { maskPii } from '../lib/logger'
import { newId } from '../lib/crypto'

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.id, 1))
  if (!row) throw new Error('settings row missing: run the seed')
  return { ...row.data, anthropicKeySet: !!process.env.ANTHROPIC_API_KEY }
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getSettings()
  const data = { ...cur, ...patch }
  await db.update(s.settings).set({ data }).where(eq(s.settings.id, 1))
  return getSettings()
}

/** Agent log line: stored (PII-masked) and pushed to live subscribers. */
export async function writeLog(agentId: string, level: LogLevel, message: string, runId?: string) {
  const text = maskPii(message).slice(0, 2000)
  const [row] = await db.insert(s.logs).values({ agentId, level, message: text, runId: runId ?? null }).returning()
  const entry: LogEntry = { id: `log_${row.id}`, at: row.at, agentId, level, message: text, traceId: runId }
  bus.publish('logs', entry)
  return entry
}

export async function notify(title: string, body: string, href: string) {
  await db.insert(s.notifications).values({ id: newId('ntf'), title, body, href })
}
