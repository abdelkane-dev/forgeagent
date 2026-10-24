import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { ApiKey } from '@shared/types'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { encrypt, hashApiKey, newApiKey, newId, randomToken } from '../lib/crypto'
import { badRequest, conflict, notFound } from '../lib/errors'
import { route } from '../http/router'
import { IdSchema, Role, str } from '../http/schemas'
import type { AppEnv, Principal } from '../http/types'
import { invite } from '../services/auth'
import { deliver } from '../services/webhooks'
import { assertPublicUrl } from '../runtime/site'

const who = (p: Principal | null) => (p?.kind === 'user' ? p.name : 'Système')
const toKey = (k: typeof s.apiKeys.$inferSelect): ApiKey => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  environment: k.environment,
  scope: k.scope,
  projectId: k.projectId,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
})

export function adminRoutes(app: Hono<AppEnv>) {
  /* ---------- Team members ---------- */
  const member = (u: typeof s.users.$inferSelect) => ({ id: u.id, name: u.name, email: u.email, role: u.role, lastActiveAt: u.lastActiveAt, invited: u.passwordHash.startsWith('invite$') })

  route(app, { method: 'get', path: '/team', tag: 'Équipe', summary: 'Membres de l’instance' }, async () => (await db.select().from(s.users).orderBy(s.users.createdAt)).map(member))

  route(
    app,
    { method: 'post', path: '/team/invitations', tag: 'Équipe', summary: 'Inviter un membre (renvoie un lien d’invitation à transmettre)', permission: 'team.manage', body: z.object({ email: z.email().max(200), role: Role }), status: 201 },
    async ({ body, principal }) => {
      const r = await invite(body.email, body.role, who(principal))
      const [u] = await db.select().from(s.users).where(eq(s.users.id, r.id))
      return { ...member(u), inviteUrl: r.inviteUrl }
    },
  )

  route(app, { method: 'patch', path: '/team/:id', tag: 'Équipe', summary: 'Changer le rôle d’un membre', permission: 'team.manage', body: z.object({ role: Role }) }, async ({ params, body, principal }) => {
    const [target] = await db.select().from(s.users).where(eq(s.users.id, params.id))
    if (!target) throw notFound('Membre')
    if (target.role === 'admin' && body.role !== 'admin') {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.role, 'admin'))
      if (n <= 1) throw conflict('Impossible de retirer le dernier administrateur')
    }
    const [u] = await db.update(s.users).set({ role: body.role }).where(eq(s.users.id, params.id)).returning()
    if (body.role !== target.role) await db.delete(s.sessions).where(eq(s.sessions.userId, u.id))
    await audit(who(principal), 'user', `a changé le rôle (${body.role})`, u.email)
    return member(u)
  })

  route(app, { method: 'delete', path: '/team/:id', tag: 'Équipe', summary: 'Retirer un membre (ferme ses sessions)', permission: 'team.manage', status: 204 }, async ({ params, principal }) => {
    if (principal?.kind === 'user' && principal.id === params.id) throw conflict('Vous ne pouvez pas retirer votre propre accès')
    const [u] = await db.delete(s.users).where(eq(s.users.id, params.id)).returning()
    if (!u) throw notFound('Membre')
    await audit(who(principal), 'user', 'a retiré l’accès', u.email)
  })

  /* ---------- API keys: secret shown once, stored as HMAC ---------- */
  route(app, { method: 'get', path: '/api-keys', tag: 'Clés API', summary: 'Clés actives (jamais le secret)' }, async () =>
    (await db.select().from(s.apiKeys).where(isNull(s.apiKeys.revokedAt)).orderBy(desc(s.apiKeys.createdAt))).map(toKey),
  )

  route(
    app,
    {
      method: 'post',
      path: '/api-keys',
      tag: 'Clés API',
      summary: 'Créer une clé (secret renvoyé une seule fois). scope=publishable : clé de widget, liée à un projet',
      permission: 'keys.manage',
      body: z.object({ name: str(80).min(1), environment: z.enum(['live', 'test']), scope: z.enum(['secret', 'publishable']).default('secret'), projectId: IdSchema.nullable().optional() }),
      status: 201,
    },
    async ({ body, principal, userId }) => {
      if (body.scope === 'publishable' && !body.projectId) throw badRequest('Une clé publiable doit être liée à un projet')
      if (body.projectId && !(await db.select().from(s.projects).where(eq(s.projects.id, body.projectId))).length) throw badRequest('Projet inconnu')
      const secret = newApiKey(body.scope === 'publishable' ? 'pub' : body.environment)
      const [k] = await db
        .insert(s.apiKeys)
        .values({ id: newId('key'), name: body.name, prefix: secret.slice(0, 12), keyHash: hashApiKey(secret), environment: body.environment, scope: body.scope, projectId: body.projectId ?? null, createdBy: userId })
        .returning()
      await audit(who(principal), 'user', 'a créé une clé API', k.name)
      return { key: toKey(k), secret }
    },
  )

  route(app, { method: 'post', path: '/api-keys/:id/rotate', tag: 'Clés API', summary: 'Régénérer une clé (l’ancienne cesse de fonctionner)', permission: 'keys.manage' }, async ({ params, principal }) => {
    const [k] = await db.select().from(s.apiKeys).where(and(eq(s.apiKeys.id, params.id), isNull(s.apiKeys.revokedAt)))
    if (!k) throw notFound('Clé')
    const secret = newApiKey(k.scope === 'publishable' ? 'pub' : k.environment)
    const [u] = await db.update(s.apiKeys).set({ keyHash: hashApiKey(secret), prefix: secret.slice(0, 12), createdAt: new Date().toISOString(), lastUsedAt: null }).where(eq(s.apiKeys.id, k.id)).returning()
    await audit(who(principal), 'user', 'a régénéré une clé API', k.name)
    return { key: toKey(u), secret }
  })

  route(app, { method: 'delete', path: '/api-keys/:id', tag: 'Clés API', summary: 'Révoquer une clé', permission: 'keys.manage', status: 204 }, async ({ params, principal }) => {
    const [k] = await db.update(s.apiKeys).set({ revokedAt: new Date().toISOString() }).where(and(eq(s.apiKeys.id, params.id), isNull(s.apiKeys.revokedAt))).returning()
    if (!k) throw notFound('Clé')
    await audit(who(principal), 'user', 'a révoqué une clé API', k.name)
  })

  /* ---------- Webhooks ---------- */
  const toHook = ({ secretEnc: _s, createdAt: _c, ...w }: typeof s.webhooks.$inferSelect) => w
  route(app, { method: 'get', path: '/webhooks', tag: 'Webhooks', summary: 'Webhooks sortants' }, async () => (await db.select().from(s.webhooks)).map(toHook))

  route(
    app,
    { method: 'post', path: '/webhooks', tag: 'Webhooks', summary: 'Ajouter un webhook (secret de signature généré et chiffré)', permission: 'settings.write', body: z.object({ url: z.url().max(500), events: z.array(str(60)).min(1).max(20) }), status: 201 },
    async ({ body, principal }) => {
      await assertPublicUrl(body.url)
      const secret = randomToken(24)
      const [w] = await db.insert(s.webhooks).values({ id: newId('wh'), url: body.url, events: body.events, secretEnc: encrypt(secret) }).returning()
      await audit(who(principal), 'user', 'a ajouté un webhook', body.url)
      return { ...toHook(w), signingSecret: secret }
    },
  )

  route(app, { method: 'delete', path: '/webhooks/:id', tag: 'Webhooks', summary: 'Supprimer un webhook', permission: 'settings.write', status: 204 }, async ({ params }) => {
    await db.delete(s.webhooks).where(eq(s.webhooks.id, params.id))
  })

  route(app, { method: 'post', path: '/webhooks/:id/test', tag: 'Webhooks', summary: 'Envoyer un événement de test signé', permission: 'settings.write' }, async ({ params }) => {
    try {
      return await deliver(params.id, 'test.ping', { message: 'Événement de test ForgeAgent' })
    } catch (e) {
      throw conflict(`Envoi impossible : ${(e as Error).message}`)
    }
  })
}
