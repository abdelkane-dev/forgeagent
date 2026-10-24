import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { config } from '../config'
import * as schema from './schema'

/**
 * PostgreSQL in production (docker compose), or PGlite (Postgres compiled to WASM)
 * for tests and zero-dependency local runs. Both speak the same SQL and migrations.
 */
function create(url: string) {
  if (url.startsWith('pglite://')) {
    const target = url.slice('pglite://'.length)
    if (target !== 'memory') fs.mkdirSync(target, { recursive: true })
    const client = new PGlite(target === 'memory' ? undefined : target)
    return { db: drizzlePglite(client, { schema }), close: () => client.close(), kind: 'pglite' as const, raw: client }
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 })
  return { db: drizzlePg(pool, { schema }), close: () => pool.end(), kind: 'pg' as const, raw: pool }
}

export const database = create(config.DATABASE_URL)
// Both drivers share the query builder API; the pg typing is used everywhere.
export const db = database.db as unknown as ReturnType<typeof drizzlePg<typeof schema>>
export type Db = typeof db
export { schema }
