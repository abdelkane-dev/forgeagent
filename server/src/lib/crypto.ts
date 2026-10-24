import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
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

export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

export function decrypt(payload: string) {
  const [v, iv, tag, ct] = payload.split('.')
  if (v !== 'v1') throw new Error('Unknown cipher version')
  const d = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

/** Prefixed random ids in the front's style: agt_xxxxx. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8).toLowerCase()}`
