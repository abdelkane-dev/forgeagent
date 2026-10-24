import { desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { AdminAgentRow } from '@shared/types'
import { db, schema as s } from '../db/client'
import { platformAudit } from '../lib/audit'
import { conflict, notFound } from '../lib/errors'
import { route } from '../http/router'
import { PlatformRole } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { invite } from '../services/auth'

const rowsOf = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[]

/**
 * Platform administration: accounts and agent metadata. An admin sees that an agent exists,
 * who owns it and its state, never its data; reaching its data takes an audited maintenance access.
 */
export function adminRoutes(app: Hono<AppEnv>) {
  route(app, { method: 'get', path: '/admin/users', tag: 'Administration', summary: 'Comptes de la plateforme', platform: 'admin' }, async () =>
    (await db.select().from(s.users).orderBy(s.users.createdAt)).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      platformRole: u.platformRole,
      invited: u.passwordHash.startsWith('invite$'),
      lastActiveAt: u.lastActiveAt,
    })),
  )

  route(app, { method: 'post', path: '/admin/users', tag: 'Administration', summary: 'Inviter un compte (lien à usage unique)', platform: 'admin', body: z.object({ email: z.email().max(200), platformRole: PlatformRole.default('member') }), status: 201 }, ({ body, user }) =>
    invite(body.email, body.platformRole, user!.name),
  )

  route(app, { method: 'patch', path: '/admin/users/:id', tag: 'Administration', summary: 'Changer le rôle plateforme d’un compte', platform: 'admin', body: z.object({ platformRole: PlatformRole }) }, async ({ params, body, user }) => {
    if (params.id === user!.id && body.platformRole !== 'admin') {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.users).where(eq(s.users.platformRole, 'admin'))
      if (n <= 1) throw conflict('Il doit rester au moins un administrateur')
    }
    const [u] = await db.update(s.users).set({ platformRole: body.platformRole }).where(eq(s.users.id, params.id)).returning()
    if (!u) throw notFound('Compte')
    await platformAudit(user!.name, 'a changé le rôle plateforme', `${u.email} → ${body.platformRole}`)
    return { id: u.id, name: u.name, email: u.email, platformRole: u.platformRole }
  })

  route(app, { method: 'delete', path: '/admin/users/:id', tag: 'Administration', summary: 'Supprimer un compte (ses sessions et ses appartenances)', platform: 'admin', status: 204 }, async ({ params, user }) => {
    if (params.id === user!.id) throw conflict('Vous ne pouvez pas supprimer votre propre compte')
    const [u] = await db.delete(s.users).where(eq(s.users.id, params.id)).returning()
    if (!u) throw notFound('Compte')
    await platformAudit(user!.name, 'a supprimé le compte', u.email)
  })

  route(app, { method: 'get', path: '/admin/agents', tag: 'Administration', summary: 'Agents de la plateforme : métadonnées seulement', platform: 'admin' }, async (): Promise<AdminAgentRow[]> =>
    rowsOf<{ id: string; name: string; status: AdminAgentRow['status']; owners: string[]; members: number; created_at: string | Date }>(await db.execute(sql`select * from forge_admin_agents()`)).map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      owners: r.owners,
      members: r.members,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  )

  route(app, { method: 'get', path: '/admin/audit', tag: 'Administration', summary: 'Journal de la plateforme (comptes, projets, accès de maintenance)', platform: 'admin' }, async () =>
    (await db.select().from(s.platformAudit).orderBy(desc(s.platformAudit.id)).limit(500)).map((a) => ({ id: `pla_${a.id}`, at: a.at, actor: a.actor, action: a.action, target: a.target })),
  )
}
