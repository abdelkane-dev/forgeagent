import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { config } from '../config'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** Password hash: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scrypt(password.normalize('NFKC'), salt, 64, SCRYPT)
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** API keys are stored as HMAC(pepper, key): a database leak does not reveal usable keys. */
export const hashApiKey = (key: string) => createHmac('sha256', config.KEY_PEPPER).update(key).digest('hex')

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'
export function newApiKey(kind: 'live' | 'test' | 'pub') {
  const bytes = randomBytes(32)
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `fa_${kind}_${body}`
}

/* AES-256-GCM for secrets at rest: v1.iv.tag.ciphertext (base64url). */
const KEY = Buffer.from(config.ENCRYPTION_KEY, 'hex')

export function encrypt(plain: string, key: Buffer = KEY) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(payload: string, key: Buffer = KEY) {
  const [v, iv, tag, ct] = payload.split('.')
  if (v !== 'v1') throw new Error('Unknown cipher version')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

/** Prefixed random ids in the front's style: agt_xxxxx. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toLowerCase()}`

/* ---------- Per-agent secrets: one derived key per agent ---------- */

/** HKDF(master, salt = agentId): a secret encrypted for agent A cannot be decrypted with B's key. */
export const agentKey = (agentId: string) => Buffer.from(hkdfSync('sha256', KEY, Buffer.from(agentId), Buffer.from('forgeagent:agent-secrets:v1'), 32))
export const encryptFor = (agentId: string, plain: string) => encrypt(plain, agentKey(agentId))
export const decryptFor = (agentId: string, payload: string) => decrypt(payload, agentKey(agentId))

/* ---------- Capability tokens for internal team tasks ---------- */

const CAP_KEY = Buffer.from(hkdfSync('sha256', Buffer.from(config.KEY_PEPPER), Buffer.from('capabilities'), Buffer.from('forgeagent:capability:v1'), 32))

export interface Capability {
  agentId: string
  taskId: string
  role: string
  exp: number
}

/** Signed, short-lived grant: "this task may act on this agent only, until exp". */
export function signCapability(c: Capability) {
  const body = Buffer.from(JSON.stringify(c)).toString('base64url')
  return `${body}.${createHmac('sha256', CAP_KEY).update(body).digest('base64url')}`
}

export function verifyCapability(token: string, expected: { agentId: string; taskId?: string }): Capability {
  const [body, mac] = token.split('.')
  const good = createHmac('sha256', CAP_KEY).update(body ?? '').digest()
  const given = Buffer.from(mac ?? '', 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) throw new Error('capability: invalid signature')
  const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as Capability
  if (c.exp < Date.now()) throw new Error('capability: expired')
  if (c.agentId !== expected.agentId) throw new Error('capability: wrong agent')
  if (expected.taskId && c.taskId !== expected.taskId) throw new Error('capability: wrong task')
  return c
}
