import { eq } from 'drizzle-orm'
import { db, schema as s } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { seed } from '../src/db/seed'
import { queue } from '../src/queue'

export const PASSWORD = 'demo-password-123'
let ready: Promise<void> | null = null

/** Migrates and seeds the in-memory database once per test file. */
export function setupDb() {
  ready ??= (async () => {
    await runMigrations()
    await seed({ password: PASSWORD, quiet: true })
  })()
  return ready
}

/** Waits until every queued job has run, then returns the request row. */
export async function settle(requestId: string) {
  for (let i = 0; i < 50; i++) {
    await queue.idle()
    const [r] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId))
    if (r.status !== 'running') return r
    await new Promise((res) => setTimeout(res, 20))
  }
  throw new Error('request did not settle')
}
