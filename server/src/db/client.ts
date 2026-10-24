import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
import { sql } from 'drizzle-orm'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import pg from 'pg'
import { config } from '../config'
import * as schema from './schema'

/**
 * Two connections:
 *  - `admin` (owner): migrations and demo seed only;
 *  - `app` (role forge_app): everything else. Row-Level Security always applies to it.
 * PGlite (tests, local runs without Docker) has a single superuser connection: after migrations
 * the session switches to `SET ROLE forge_app`, so the same RLS rules apply.
 */
function create() {
  const url = config.DATABASE_URL
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length)
    if (target !== 'memory') fs.mkdirSync(target, { recursive: true })
    const client = new PGlite({ dataDir: target === 'memory' ? undefined : target, extensions: { vector } })
    const db = drizzlePglite(client, { schema })
    return {
      kind: 'pglite' as const,
      app: db,
      admin: db,
      raw: client,
      /** Locks the single PGlite session to the application role (after migrations and seed). */
      lockToAppRole: async () => void (await client.exec('SET ROLE forge_app')),
      unlockAdmin: async () => void (await client.exec('RESET ROLE')),
      close: () => client.close(),
    }
  }
  const appPool = new pg.Pool({ connectionString: url, max: 15 })
  const adminPool = new pg.Pool({ connectionString: config.DATABASE_ADMIN_URL ?? url, max: 2 })
  return {
    kind: 'pg' as const,
    app: drizzlePg(appPool, { schema }),
    admin: drizzlePg(adminPool, { schema }),
    raw: appPool,
    lockToAppRole: async () => {},
    unlockAdmin: async () => {},
    close: async () => {
      await appPool.end()
      await adminPool.end()
    },
  }
}

export const database = create()
// Both drivers share the query builder API; the pg typing is used everywhere.
type PgDb = ReturnType<typeof drizzlePg<typeof schema>>
export const db = database.app as unknown as PgDb
export const adminDb = database.admin as unknown as PgDb
export type Db = PgDb
export type Tx = Parameters<Parameters<PgDb['transaction']>[0]>[0]
export { schema }

/* ---------- Isolation context ---------- */

export type Ctx =
  | { mode: 'user'; userId: string; agentId?: string }
  | { mode: 'task'; agentId: string; userId?: string }
  | { mode: 'platform'; agentId: string; userId: string }

/**
 * Runs `fn` in a transaction carrying the isolation context. PostgreSQL's RLS policies read it:
 * outside a context, or for another agent, agent tables return nothing and refuse writes.
 * Never nest scoped() calls: compose with the `tx` argument instead.
 */
export function scoped<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.mode', ${ctx.mode}, true), set_config('app.user_id', ${ctx.userId ?? ''}, true), set_config('app.agent_id', ${ctx.agentId ?? ''}, true)`,
    )
    await tx.execute(sql`set local role forge_app`)
    return fn(tx)
  })
}

/** Shorthand for work done by the platform on behalf of one agent (runtime, workers, team tasks). */
export const asAgent = <T,>(agentId: string, fn: (tx: Tx) => Promise<T>) => scoped({ mode: 'task', agentId }, fn)
