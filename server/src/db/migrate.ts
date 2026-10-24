import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { database } from './client'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Applies drizzle/*.sql. Works from src/db (tsx) and from dist/ (bundled). */
export async function runMigrations() {
  const migrationsFolder = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle')].find((f) =>
    existsSync(f),
  )
  if (!migrationsFolder) throw new Error('drizzle/ migrations folder not found')
  if (database.kind === 'pglite') await migratePglite(database.db, { migrationsFolder })
  else await migratePg(database.db, { migrationsFolder })
}

export const isEntry = (url: string) => !!process.argv[1] && path.resolve(process.argv[1]).replace(/\.(ts|js)$/, '') === fileURLToPath(url).replace(/\.(ts|js)$/, '')

if (isEntry(import.meta.url)) {
  runMigrations()
    .then(async () => {
      console.log('Migrations appliquées')
      await database.close()
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
