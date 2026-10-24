// Creates .env from .env.example with fresh random secrets. Never overwrites an existing .env.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

if (existsSync('.env')) {
  console.log('.env existe déjà : rien à faire.')
  process.exit(0)
}
const hex = (n) => randomBytes(n).toString('hex')
const env = readFileSync('.env.example', 'utf8')
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${hex(16)}`)
  .replace(/^KEY_PEPPER=.*$/m, `KEY_PEPPER=${hex(24)}`)
  .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${hex(32)}`)
  .replace(/^SEED_PASSWORD=.*$/m, `SEED_PASSWORD=forgeagent-demo`)
writeFileSync('.env', env, { mode: 0o600 })
console.log('.env créé avec des secrets aléatoires. Mot de passe des comptes de démo : forgeagent-demo')
