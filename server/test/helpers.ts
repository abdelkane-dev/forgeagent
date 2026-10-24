import { eq } from 'drizzle-orm'
import { asAgent, database, schema as s } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { seed } from '../src/db/seed'
import { queue } from '../src/queue'

export const PASSWORD = 'demo-password-123'
let ready: Promise<void> | null = null
export let keys: { skipped: false; keys: Record<string, string> } = { skipped: false, keys: {} }

/** Migrates and seeds the in-memory database once per test file. */
export function setupDb() {
  ready ??= (async () => {
    await runMigrations()
    keys = (await seed({ password: PASSWORD, quiet: true })) as typeof keys
    await database.lockToAppRole()
  })()
  return ready
}

/** Waits until every queued job has run, then returns the request row. */
export async function settle(agentId: string, requestId: string) {
  for (let i = 0; i < 50; i++) {
    await queue.idle()
    const [r] = await asAgent(agentId, (tx) => tx.select().from(s.teamRequests).where(eq(s.teamRequests.id, requestId)))
    if (r.status !== 'running') return r
    await new Promise((res) => setTimeout(res, 20))
  }
  throw new Error('request did not settle')
}

declare global {
  // Tests read loosely-typed JSON bodies; the routes' own types are checked in src/.
  interface Response {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    json(): Promise<any>
  }
}
