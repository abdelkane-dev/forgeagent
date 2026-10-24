import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { config } from '../config'
import { adminDb, database } from './client'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Applies drizzle/*.sql with the owner connection, then gives the forge_app role its password
 * (PostgreSQL). Works from src/db (tsx) and from dist/ (bundled).
 */
export async function runMigrations() {
  const migrationsFolder = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle'), path.resolve(process.cwd(), 'drizzle')].find((f) =>
    existsSync(f),
  )
  if (!migrationsFolder) throw new Error('drizzle/ migrations folder not found')
  await database.unlockAdmin()
  if (database.kind === 'pglite') await migratePglite(database.admin, { migrationsFolder })
  else await migratePg(adminDb, { migrationsFolder })
  if (database.kind === 'pg' && config.APP_DB_PASSWORD) {
    if (!/^[\w.-]+$/.test(config.APP_DB_PASSWORD)) throw new Error('APP_DB_PASSWORD: lettres, chiffres, . _ - uniquement')
    await adminDb.execute(sql.raw(`ALTER ROLE forge_app WITH LOGIN PASSWORD '${config.APP_DB_PASSWORD}'`))
  }
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
