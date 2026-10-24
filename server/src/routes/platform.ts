import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { Overview } from '@shared/types'
import { db, scoped, schema as s, serial } from '../db/client'
import { platformAudit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { conflict, notFound } from '../lib/errors'
import { route, userCtx } from '../http/router'
import { ProjectInput, ProjectPatch, SettingsPatch, SkillInput } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { getPlatformSettings, updatePlatformSettings } from '../services/settings'
import { toApproval } from './agent-space'

const DAY = 86_400_000

export function platformRoutes(app: Hono<AppEnv>) {
  /* ---------- Dashboard: only the agents the user is a member of (RLS, user mode) ---------- */
  route(app, { method: 'get', path: '/overview', tag: 'Tableau de bord', summary: 'Métriques de mes agents (24 h, 7 jours)' }, ({ user }) =>
    scoped(userCtx(user!.id), async (tx): Promise<Overview> => {
      const since = new Date(Date.now() - DAY).toISOString()
      const midnight = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
      const week = new Date(new Date().setHours(0, 0, 0, 0) - 6 * DAY).toISOString()
      const prod = eq(s.runs.environment, 'production')
      const [[agents], [day], [today], [pending], byDay] = await serial([
        () => tx.select({ n: sql<number>`count(*)::int`, active: sql<number>`count(*) filter (where ${s.agents.status} = 'active')::int` }).from(s.agents),
        () => tx
          .select({
            runs: sql<number>`count(*)::int`,
            ok: sql<number>`count(*) filter (where ${s.runs.status} = 'ok')::int`,
            p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${s.runs.durationMs}), 0)::int`,
          })
          .from(s.runs)
          .where(and(gte(s.runs.startedAt, since), prod)),
        () => tx.select({ cost: sql<number>`coalesce(sum(${s.usageCosts.cost}), 0)::float8` }).from(s.usageCosts).where(and(gte(s.usageCosts.at, midnight), eq(s.usageCosts.environment, 'production'))),
        () => tx.select({ n: sql<number>`count(*)::int` }).from(s.approvals).where(eq(s.approvals.status, 'pending')),
        () => tx
          .select({
            day: sql<string>`to_char(date_trunc('day', ${s.runs.startedAt}), 'YYYY-MM-DD')`,
            runs: sql<number>`count(*)::int`,
            errors: sql<number>`count(*) filter (where ${s.runs.status} = 'error')::int`,
          })
          .from(s.runs)
          .where(and(gte(s.runs.startedAt, week), prod))
          .groupBy(sql`1`)])
      const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
      const runsByDay = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(new Date().setHours(0, 0, 0, 0) - (6 - i) * DAY)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const hit = byDay.find((b) => b.day === key)
        return { day: fmt.format(d), runs: hit?.runs ?? 0, errors: hit?.errors ?? 0 }
      })
      return {
        agents: agents.n,
        activeAgents: agents.active,
        runs24h: day.runs,
        costToday: Math.round(today.cost * 100) / 100,
        successRate: day.runs ? Math.round((day.ok / day.runs) * 1000) / 10 : 100,
        p50LatencyMs: day.p50,
        pendingApprovals: pending.n,
        runsByDay,
      }
    }),
  )

  /** Pending approvals across MY agents (each item still resolved under /agents/:agentId/approvals). */
  route(app, { method: 'get', path: '/approvals', tag: 'Validations', summary: 'Validations en attente sur mes agents' }, ({ user }) =>
    scoped(userCtx(user!.id), async (tx) => (await tx.select().from(s.approvals).where(eq(s.approvals.status, 'pending')).orderBy(desc(s.approvals.requestedAt)).limit(100)).map(toApproval)),
  )

  /* ---------- Notifications (mine, and only for agents I still belong to) ---------- */
  route(app, { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'Mes notifications' }, ({ user }) =>
    scoped(userCtx(user!.id), async (tx) => {
      const rows = await tx.select().from(s.notifications).where(eq(s.notifications.userId, user!.id)).orderBy(desc(s.notifications.at)).limit(50)
      const ids = [...new Set(rows.map((n) => n.agentId).filter(Boolean))] as string[]
      const visible = new Set(ids.length ? (await tx.select({ id: s.agents.id }).from(s.agents).where(inArray(s.agents.id, ids))).map((a) => a.id) : [])
      return rows.filter((n) => !n.agentId || visible.has(n.agentId)).map(({ userId: _u, ...n }) => n)
    }),
  )
  route(app, { method: 'post', path: '/notifications/:id/read', tag: 'Notifications', summary: 'Marquer comme lue', status: 204 }, async ({ params, user }) => {
    await db.update(s.notifications).set({ read: true }).where(and(eq(s.notifications.id, params.id), eq(s.notifications.userId, user!.id)))
  })
  route(app, { method: 'post', path: '/notifications/read-all', tag: 'Notifications', summary: 'Tout marquer comme lu', status: 204 }, async ({ user }) => {
    await db.update(s.notifications).set({ read: true }).where(eq(s.notifications.userId, user!.id))
  })

  /* ---------- Projects (platform catalogue: names and environments, no agent data) ---------- */
  route(app, { method: 'get', path: '/projects', tag: 'Projets', summary: 'Projets' }, () => db.select().from(s.projects).orderBy(asc(s.projects.createdAt)))
  route(app, { method: 'get', path: '/projects/:id', tag: 'Projets', summary: 'Détail d’un projet' }, async ({ params }) => {
    const [p] = await db.select().from(s.projects).where(eq(s.projects.id, params.id))
    if (!p) throw notFound('Projet')
    return p
  })
  route(app, { method: 'post', path: '/projects', tag: 'Projets', summary: 'Créer un projet', body: ProjectInput, status: 201 }, async ({ body, user }) => {
    const base = body.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'
    const taken = await db.select({ slug: s.projects.slug }).from(s.projects).where(sql`${s.projects.slug} like ${base + '%'}`)
    const slug = taken.some((t) => t.slug === base) ? `${base}-${taken.length + 1}` : base
    const empty = { url: '', deployed: false }
    const [p] = await db
      .insert(s.projects)
      .values({ id: newId('prj'), name: body.name, slug, description: body.description, createdBy: user!.id, environments: { test: empty, staging: empty, production: empty } })
      .returning()
    await platformAudit(user!.name, 'a créé le projet', p.name)
    return p
  })
  route(app, { method: 'patch', path: '/projects/:id', tag: 'Projets', summary: 'Modifier un projet', body: ProjectPatch }, async ({ params, body, user }) => {
    const [cur] = await db.select().from(s.projects).where(eq(s.projects.id, params.id))
    if (!cur) throw notFound('Projet')
    if (cur.createdBy !== user!.id && user!.platformRole !== 'admin') throw conflict('Seul le créateur du projet ou un administrateur peut le modifier')
    const [p] = await db.update(s.projects).set(body).where(eq(s.projects.id, params.id)).returning()
    await platformAudit(user!.name, 'a modifié le projet', p.name, { fields: Object.keys(body) })
    return p
  })
  route(app, { method: 'delete', path: '/projects/:id', tag: 'Projets', summary: 'Supprimer un projet (les agents sont détachés, pas supprimés)', platform: 'admin', status: 204 }, async ({ params, user }) => {
    const [p] = await db.delete(s.projects).where(eq(s.projects.id, params.id)).returning()
    if (!p) throw notFound('Projet')
    await platformAudit(user!.name, 'a supprimé le projet', p.name)
  })

  /* ---------- Skills, connectors, templates (shared definitions) ---------- */
  route(app, { method: 'get', path: '/skills', tag: 'Skills', summary: 'Bibliothèque de skills' }, async () =>
    (await db.select().from(s.skills).orderBy(asc(s.skills.createdAt))).map(({ instructions: _i, createdAt: _c, ...k }) => k),
  )
  route(app, { method: 'post', path: '/skills', tag: 'Skills', summary: 'Créer une skill', body: SkillInput, status: 201 }, async ({ body, user }) => {
    const [k] = await db
      .insert(s.skills)
      .values({ id: newId('skl'), ...body, author: user!.name, instructions: `Skill « ${body.name} » : ${body.description}` })
      .returning()
    await platformAudit(user!.name, 'a créé la skill', k.name)
    const { instructions: _i, createdAt: _c, ...rest } = k
    return rest
  })
  route(app, { method: 'delete', path: '/skills/:id', tag: 'Skills', summary: 'Supprimer une skill', platform: 'admin', status: 204 }, async ({ params, user }) => {
    const [k] = await db.select().from(s.skills).where(eq(s.skills.id, params.id))
    if (!k) throw notFound('Skill')
    if (k.builtin) throw conflict('Les skills intégrées ne peuvent pas être supprimées')
    await db.delete(s.skills).where(eq(s.skills.id, params.id))
    await platformAudit(user!.name, 'a supprimé la skill', k.name)
  })

  route(app, { method: 'get', path: '/connectors', tag: 'Connecteurs', summary: 'Types de connecteurs (les identifiants sont des secrets de chaque agent)' }, () => db.select().from(s.connectors))
  route(app, { method: 'patch', path: '/connectors/:id', tag: 'Connecteurs', summary: 'Activer ou désactiver un connecteur', platform: 'admin', body: z.object({ enabled: z.boolean() }) }, async ({ params, body, user }) => {
    const [c] = await db.update(s.connectors).set({ enabled: body.enabled }).where(eq(s.connectors.id, params.id)).returning()
    if (!c) throw notFound('Connecteur')
    await platformAudit(user!.name, body.enabled ? 'a activé le connecteur' : 'a désactivé le connecteur', c.name)
    return c
  })

  route(app, { method: 'get', path: '/templates', tag: 'Modèles', summary: 'Modèles d’agents' }, () => db.select().from(s.templates))

  /* ---------- Platform settings ---------- */
  route(app, { method: 'get', path: '/platform/settings', tag: 'Paramètres', summary: 'Paramètres de la plateforme' }, () => getPlatformSettings())
  route(app, { method: 'patch', path: '/platform/settings', tag: 'Paramètres', summary: 'Modifier les paramètres de la plateforme', platform: 'admin', body: SettingsPatch }, async ({ body, user }) => {
    const before = await getPlatformSettings()
    const after = await updatePlatformSettings(body)
    if (body.killSwitch !== undefined && body.killSwitch !== before.killSwitch) await platformAudit(user!.name, body.killSwitch ? 'a déclenché l’arrêt d’urgence' : 'a relancé les agents', 'plateforme')
    else await platformAudit(user!.name, 'a modifié les paramètres', Object.keys(body).join(', '))
    return after
  })
}
