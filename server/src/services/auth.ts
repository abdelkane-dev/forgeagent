import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import type { Role } from '@shared/types'
import { config } from '../config'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { hashApiKey, hashPassword, newId, randomToken, sha256, verifyPassword } from '../lib/crypto'
import { badRequest, conflict, forbidden, tooMany, unauthorized } from '../lib/errors'
import { hit } from '../lib/rate-limit'
import type { Principal } from '../http/types'

export const SESSION_COOKIE = 'fa_session'

export interface PublicUser {
  id: string
  name: string
  email: string
  role: Role
}

const toPublic = (u: typeof s.users.$inferSelect): PublicUser => ({ id: u.id, name: u.name, email: u.email, role: u.role })

/** Same work whether the email exists or not, to avoid user enumeration by timing. */
const DUMMY_HASH = hashPassword(randomToken())

export async function login(email: string, password: string, ip: string, userAgent: string | undefined) {
  const key = `login:${ip}:${email.toLowerCase()}`
  if (!(await hit(key, 10, 15 * 60_000)).ok) throw tooMany('Trop de tentatives : réessayez dans 15 minutes')
  const [user] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email.toLowerCase()}`)
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH))
  if (!user || !ok) {
    await audit(email, 'user', 'échec de connexion', 'console', { ip })
    throw unauthorized('Email ou mot de passe incorrect')
  }
  const token = await createSession(user.id, userAgent)
  await audit(user.name, 'user', 's’est connecté', 'console')
  return { user: toPublic(user), token }
}

export async function createSession(userId: string, userAgent?: string) {
  const token = randomToken(32)
  await db.insert(s.sessions).values({
    id: sha256(token),
    userId,
    userAgent: userAgent?.slice(0, 200),
    expiresAt: new Date(Date.now() + config.SESSION_TTL_HOURS * 3_600_000).toISOString(),
  })
  return token
}

export async function logout(sessionId: string) {
  await db.delete(s.sessions).where(eq(s.sessions.id, sessionId))
}

/** Resolves the caller from the session cookie or a Bearer API key. Returns null if neither is valid. */
export async function resolvePrincipal(cookieToken: string | undefined, authHeader: string | undefined): Promise<Principal | null> {
  const bearer = authHeader?.match(/^Bearer\s+(fa_(live|test)_[a-z0-9]+)$/i)?.[1]
  if (bearer) {
    const [k] = await db
      .select()
      .from(s.apiKeys)
      .where(and(eq(s.apiKeys.keyHash, hashApiKey(bearer)), isNull(s.apiKeys.revokedAt), eq(s.apiKeys.scope, 'secret')))
    if (!k) return null
    void db.update(s.apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(s.apiKeys.id, k.id)).catch(() => null)
    return { kind: 'key', keyId: k.id, scope: k.scope, projectId: k.projectId, environment: k.environment }
  }
  if (!cookieToken || cookieToken.length > 100) return null
  const id = sha256(cookieToken)
  const [row] = await db
    .select({ session: s.sessions, user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.id, id), gt(s.sessions.expiresAt, new Date().toISOString())))
  if (!row) return null
  // Activity timestamp, at most once a minute.
  if (Date.now() - new Date(row.user.lastActiveAt).getTime() > 60_000)
    void db.update(s.users).set({ lastActiveAt: new Date().toISOString() }).where(eq(s.users.id, row.user.id)).catch(() => null)
  return { kind: 'user', id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role, sessionId: id }
}

/** First-run bootstrap: signup is open only while the instance has no user. The first account is admin. */
export async function signup(name: string, email: string, password: string, userAgent?: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users)
  if (n > 0) throw forbidden('Inscription fermée : demandez une invitation à un administrateur')
  const id = newId('usr')
  await db.insert(s.users).values({ id, name, email, role: 'admin', passwordHash: await hashPassword(password) })
  await audit(name, 'user', 'a créé le compte administrateur', 'instance')
  const token = await createSession(id, userAgent)
  return { user: { id, name, email, role: 'admin' as Role }, token }
}

/** Invitation: creates the user with an unusable password and returns a one-time link to set it. */
export async function invite(email: string, role: Role, by: string) {
  const exists = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${email.toLowerCase()}`)
  if (exists.length) throw conflict('Un membre utilise déjà cet email')
  const id = newId('usr')
  const token = randomToken(24)
  await db.insert(s.users).values({ id, name: email.split('@')[0], email, role, passwordHash: `invite$${sha256(token)}` })
  await audit(by, 'user', 'a invité', `${email} (${role})`)
  return { id, inviteUrl: `${config.consoleOrigins[0]}/login?invite=${token}&email=${encodeURIComponent(email)}` }
}

export async function acceptInvite(email: string, token: string, password: string, name?: string) {
  const [u] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${email.toLowerCase()}`)
  if (!u || u.passwordHash !== `invite$${sha256(token)}`) throw badRequest('Invitation invalide ou déjà utilisée')
  await db.update(s.users).set({ passwordHash: await hashPassword(password), ...(name ? { name } : {}) }).where(eq(s.users.id, u.id))
  return { user: toPublic({ ...u, name: name ?? u.name }), token: await createSession(u.id) }
}

export async function me(userId: string) {
  const [u] = await db.select().from(s.users).where(eq(s.users.id, userId))
  if (!u) throw unauthorized()
  return toPublic(u)
}
