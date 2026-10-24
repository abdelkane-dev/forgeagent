import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite-pgvector'
const t0 = Date.now()
const db = new PGlite({ extensions: { vector } })
await db.waitReady
console.log('ready', Date.now() - t0)
await db.exec('create extension if not exists vector')
console.log('ext', Date.now() - t0)
const r = await db.query(`select '[1,2,3]'::vector <=> '[1,2,4]'::vector as d`)
console.log(r.rows, Date.now() - t0)
await db.close()
