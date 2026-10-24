import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { AgentMember, AgentRole, AgentSecret, ApiKey, Webhook } from '@shared/types'
import { schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { decryptFor, encryptFor, hashApiKey, newApiKey, newId, randomToken, sha256 } from '../lib/crypto'
import { badRequest, conflict, notFound } from '../lib/errors'
import { config } from '../config'

/* ======================= Members (per agent) ======================= */

export async function listMembers(tx: Tx, agentId: string): Promise<AgentMember[]> {
  const rows = await tx
    .select({ userId: s.agentMembers.userId, role: s.agentMembers.role, addedAt: s.agentMembers.addedAt, name: s.users.name, email: s.users.email, hash: s.users.passwordHash })
    .from(s.agentMembers)
    .innerJoin(s.users, eq(s.users.id, s.agentMembers.userId))
    .where(eq(s.agentMembers.agentId, agentId))
    .orderBy(s.agentMembers.addedAt)
  return rows.map(({ hash, ...m }) => ({ ...m, invited: hash.startsWith('invite$') }))
}

/**
 * Adds someone to THIS agent only. Unknown emails get an account created by invitation
 * (one-time link): the account has access to nothing but this agent.
 */
export async function addMember(tx: Tx, agentId: string, email: string, role: AgentRole, actor: string) {
  if (role === 'owner') throw badRequest('Un nouveau membre ne peut pas être propriétaire directement : changez son rôle ensuite')
  let [u] = await tx.select().from(s.users).where(sql`lower(${s.users.email}) = ${email.toLowerCase()}`)
  let inviteUrl: string | undefined
  if (!u) {
    const token = randomToken(24)
    ;[u] = await tx.insert(s.users).values({ id: newId('usr'), name: email.split('@')[0], email, passwordHash: `invite$${sha256(token)}` }).returning()
    inviteUrl = `${config.consoleOrigins[0]}/login?invite=${token}&email=${encodeURIComponent(email)}`
  }
  const existing = await tx.select().from(s.agentMembers).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, u.id)))
  if (existing.length) throw conflict('Cette personne est déjà membre de l’agent')
  await tx.insert(s.agentMembers).values({ agentId, userId: u.id, role })
  await audit(tx, agentId, { actor, actorType: 'user', action: `a ajouté un membre (${role})`, target: email })
  return { member: (await listMembers(tx, agentId)).find((m) => m.userId === u.id)!, inviteUrl }
}

async function ownersLeft(tx: Tx, agentId: string, excluding: string) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.agentMembers)
    .where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.role, 'owner'), sql`${s.agentMembers.userId} <> ${excluding}`))
  return r.n
}

export async function setMemberRole(tx: Tx, agentId: string, userId: string, role: AgentRole, actor: string) {
  const [m] = await tx.select().from(s.agentMembers).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, userId)))
  if (!m) throw notFound('Membre')
  if (m.role === 'owner' && role !== 'owner' && (await ownersLeft(tx, agentId, userId)) === 0) throw conflict('Un agent doit garder au moins un propriétaire')
  await tx.update(s.agentMembers).set({ role }).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, userId)))
  await audit(tx, agentId, { actor, actorType: 'user', action: `a changé un rôle (${m.role} → ${role})`, target: userId })
}

export async function removeMember(tx: Tx, agentId: string, userId: string, actor: string) {
  const [m] = await tx.select().from(s.agentMembers).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, userId)))
  if (!m) throw notFound('Membre')
  if (m.role === 'owner' && (await ownersLeft(tx, agentId, userId)) === 0) throw conflict('Un agent doit garder au moins un propriétaire')
  await tx.delete(s.agentMembers).where(and(eq(s.agentMembers.agentId, agentId), eq(s.agentMembers.userId, userId)))
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a retiré un membre', target: userId })
}

/* ======================= API keys (per agent) ======================= */

const toKey = (k: typeof s.apiKeys.$inferSelect): ApiKey => ({
  id: k.id,
  agentId: k.agentId,
  name: k.name,
  prefix: k.prefix,
  environment: k.environment,
  scope: k.scope,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
})

export async function listKeys(tx: Tx, agentId: string) {
  return (await tx.select().from(s.apiKeys).where(and(eq(s.apiKeys.agentId, agentId), isNull(s.apiKeys.revokedAt))).orderBy(desc(s.apiKeys.createdAt))).map(toKey)
}

/** The secret is returned once; only its HMAC is stored. A key only ever reaches its own agent. */
export async function createKey(tx: Tx, agentId: string, input: { name: string; environment: 'live' | 'test'; scope: 'secret' | 'publishable' }, actor: { id: string; name: string }) {
  const secret = newApiKey(input.scope === 'publishable' ? 'pub' : input.environment)
  const [k] = await tx
    .insert(s.apiKeys)
    .values({ id: newId('key'), agentId, name: input.name, prefix: secret.slice(0, 12), keyHash: hashApiKey(secret), environment: input.environment, scope: input.scope, createdBy: actor.id })
    .returning()
  await audit(tx, agentId, { actor: actor.name, actorType: 'user', action: `a créé une clé ${input.scope === 'publishable' ? 'publiable' : 'secrète'}`, target: input.name })
  return { key: toKey(k), secret }
}

export async function rotateKey(tx: Tx, agentId: string, keyId: string, actor: string) {
  const [k] = await tx.select().from(s.apiKeys).where(and(eq(s.apiKeys.id, keyId), eq(s.apiKeys.agentId, agentId), isNull(s.apiKeys.revokedAt)))
  if (!k) throw notFound('Clé')
  const secret = newApiKey(k.scope === 'publishable' ? 'pub' : k.environment)
  const [u] = await tx.update(s.apiKeys).set({ keyHash: hashApiKey(secret), prefix: secret.slice(0, 12), createdAt: new Date().toISOString(), lastUsedAt: null }).where(eq(s.apiKeys.id, k.id)).returning()
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a régénéré une clé', target: k.name })
  return { key: toKey(u), secret }
}

export async function revokeKey(tx: Tx, agentId: string, keyId: string, actor: string) {
  const [k] = await tx.update(s.apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(s.apiKeys.id, keyId), eq(s.apiKeys.agentId, agentId), isNull(s.apiKeys.revokedAt))).returning()
  if (!k) throw notFound('Clé')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a révoqué une clé', target: k.name })
}

/* ======================= Secrets (encrypted with the agent's own key) ======================= */

const NAME = /^[A-Z][A-Z0-9_]{1,63}$/

export async function listSecrets(tx: Tx, agentId: string): Promise<AgentSecret[]> {
  const rows = await tx.select().from(s.agentSecrets).where(eq(s.agentSecrets.agentId, agentId)).orderBy(s.agentSecrets.name)
  return rows.map(({ valueEnc: _v, ...r }) => r)
}

export async function putSecret(tx: Tx, agentId: string, name: string, value: string, actor: string) {
  if (!NAME.test(name)) throw badRequest('Nom de secret : MAJUSCULES, chiffres et _ (ex. CRM_TOKEN)')
  const valueEnc = encryptFor(agentId, value)
  await tx
    .insert(s.agentSecrets)
    .values({ id: newId('sec'), agentId, name, valueEnc })
    .onConflictDoUpdate({ target: [s.agentSecrets.agentId, s.agentSecrets.name], set: { valueEnc } })
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a enregistré un secret', target: name })
}

export async function deleteSecret(tx: Tx, agentId: string, name: string, actor: string) {
  const rows = await tx.delete(s.agentSecrets).where(and(eq(s.agentSecrets.agentId, agentId), eq(s.agentSecrets.name, name))).returning()
  if (!rows.length) throw notFound('Secret')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a supprimé un secret', target: name })
}

/** Server-side only: used by connectors and integrations of the same agent. Never sent to the console. */
export async function readSecret(tx: Tx, agentId: string, name: string) {
  const [row] = await tx.select().from(s.agentSecrets).where(and(eq(s.agentSecrets.agentId, agentId), eq(s.agentSecrets.name, name)))
  if (!row) return null
  await tx.update(s.agentSecrets).set({ lastUsedAt: new Date().toISOString() }).where(eq(s.agentSecrets.id, row.id))
  return decryptFor(agentId, row.valueEnc)
}

/* ======================= Webhooks (per agent, signed) ======================= */

export async function listWebhooks(tx: Tx, agentId: string): Promise<Webhook[]> {
  return (await tx.select().from(s.webhooks).where(eq(s.webhooks.agentId, agentId))).map(({ secretEnc: _s, createdAt: _c, ...w }) => w)
}

export async function createWebhook(tx: Tx, agentId: string, url: string, events: string[], actor: string) {
  const signingSecret = randomToken(24)
  const [w] = await tx.insert(s.webhooks).values({ id: newId('wh'), agentId, url, events, secretEnc: encryptFor(agentId, signingSecret) }).returning()
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a ajouté un webhook', target: url })
  const { secretEnc: _s, createdAt: _c, ...rest } = w
  return { ...rest, signingSecret }
}

export async function deleteWebhook(tx: Tx, agentId: string, id: string, actor: string) {
  const rows = await tx.delete(s.webhooks).where(and(eq(s.webhooks.id, id), eq(s.webhooks.agentId, agentId))).returning()
  if (!rows.length) throw notFound('Webhook')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a supprimé un webhook', target: rows[0].url })
}

