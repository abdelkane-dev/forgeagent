import { asc, desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { conflict, notFound } from '../lib/errors'
import { route } from '../http/router'
import { IdSchema, ProjectInput, ProjectPatch, SkillInput, WorkflowInput, str } from '../http/schemas'
import type { AppEnv, Principal } from '../http/types'
import { queue } from '../queue'

const who = (p: Principal | null) => (p?.kind === 'user' ? p.name : 'Système')

export function resourceRoutes(app: Hono<AppEnv>) {
  /* ---------- Projects ---------- */
  route(app, { method: 'get', path: '/projects', tag: 'Projets', summary: 'Lister les projets' }, () => db.select().from(s.projects).orderBy(asc(s.projects.createdAt)))

  route(app, { method: 'get', path: '/projects/:id', tag: 'Projets', summary: 'Détail d’un projet' }, async ({ params }) => {
    const [p] = await db.select().from(s.projects).where(eq(s.projects.id, params.id))
    if (!p) throw notFound('Projet')
    return p
  })

  route(app, { method: 'post', path: '/projects', tag: 'Projets', summary: 'Créer un projet', permission: 'projects.write', body: ProjectInput, status: 201 }, async ({ body, principal }) => {
    const base = body.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'
    const taken = await db.select({ slug: s.projects.slug }).from(s.projects).where(sql`${s.projects.slug} like ${base + '%'}`)
    const slug = taken.some((t) => t.slug === base) ? `${base}-${taken.length + 1}` : base
    const empty = { url: '', deployed: false }
    const [p] = await db
      .insert(s.projects)
      .values({ id: newId('prj'), name: body.name, slug, description: body.description, environments: { test: empty, staging: empty, production: empty } })
      .returning()
    await audit(who(principal), 'user', 'a créé le projet', p.name)
    return p
  })

  route(app, { method: 'patch', path: '/projects/:id', tag: 'Projets', summary: 'Modifier un projet (environnements, domaines autorisés…)', permission: 'projects.write', body: ProjectPatch }, async ({ params, body, principal }) => {
    const [p] = await db.update(s.projects).set(body).where(eq(s.projects.id, params.id)).returning()
    if (!p) throw notFound('Projet')
    await audit(who(principal), 'user', 'a modifié le projet', p.name, { fields: Object.keys(body) })
    return p
  })

  route(app, { method: 'delete', path: '/projects/:id', tag: 'Projets', summary: 'Supprimer un projet (les agents sont conservés, détachés)', permission: 'projects.write', status: 204 }, async ({ params, principal }) => {
    const [p] = await db.delete(s.projects).where(eq(s.projects.id, params.id)).returning()
    if (!p) throw notFound('Projet')
    await audit(who(principal), 'user', 'a supprimé le projet', p.name)
  })

  /* ---------- Skills ---------- */
  route(app, { method: 'get', path: '/skills', tag: 'Skills', summary: 'Bibliothèque de skills (avec nombre d’agents utilisateurs)' }, async () => {
    const rows = await db
      .select({ skill: s.skills, installs: sql<number>`(select count(*)::int from ${s.agentSkills} where ${s.agentSkills.skillId} = ${s.skills.id})` })
      .from(s.skills)
      .orderBy(asc(s.skills.createdAt))
    return rows.map(({ skill: { instructions: _i, createdAt: _c, ...k }, installs }) => ({ ...k, installs }))
  })

  route(app, { method: 'post', path: '/skills', tag: 'Skills', summary: 'Créer une skill', permission: 'skills.write', body: SkillInput, status: 201 }, async ({ body, principal }) => {
    const [k] = await db
      .insert(s.skills)
      .values({ id: newId('skl'), ...body, author: who(principal), instructions: `Skill « ${body.name} » : ${body.description}` })
      .returning()
    await audit(who(principal), 'user', 'a créé la skill', k.name)
    const { instructions: _i, createdAt: _c, ...rest } = k
    return { ...rest, installs: 0 }
  })

  route(app, { method: 'delete', path: '/skills/:id', tag: 'Skills', summary: 'Supprimer une skill (retirée de tous les agents)', permission: 'skills.write', status: 204 }, async ({ params, principal }) => {
    const [k] = await db.select().from(s.skills).where(eq(s.skills.id, params.id))
    if (!k) throw notFound('Skill')
    if (k.builtin) throw conflict('Les skills intégrées ne peuvent pas être supprimées')
    await db.delete(s.skills).where(eq(s.skills.id, params.id))
    await audit(who(principal), 'user', 'a supprimé la skill', k.name)
  })

  /* ---------- Connectors (credentials never leave the server) ---------- */
  route(app, { method: 'get', path: '/connectors', tag: 'Connecteurs', summary: 'Connecteurs MCP de l’instance' }, async () =>
    (await db.select().from(s.connectors)).map(({ credentialsEnc: _c, ...c }) => c),
  )

  route(app, { method: 'patch', path: '/connectors/:id', tag: 'Connecteurs', summary: 'Activer ou désactiver un connecteur', permission: 'settings.write', body: z.object({ enabled: z.boolean() }) }, async ({ params, body, principal }) => {
    const [c] = await db.update(s.connectors).set({ enabled: body.enabled }).where(eq(s.connectors.id, params.id)).returning()
    if (!c) throw notFound('Connecteur')
    await audit(who(principal), 'user', body.enabled ? 'a activé le connecteur' : 'a désactivé le connecteur', c.name)
    const { credentialsEnc: _c, ...rest } = c
    return rest
  })

  route(app, { method: 'get', path: '/templates', tag: 'Modèles', summary: 'Modèles d’agents' }, () => db.select().from(s.templates))

  /* ---------- Knowledge & memory ---------- */
  route(app, { method: 'get', path: '/knowledge', tag: 'Connaissances', summary: 'Sources indexées' }, async () =>
    (await db.select().from(s.knowledgeDocs).orderBy(asc(s.knowledgeDocs.createdAt))).map(({ createdAt: _c, content: _t, ...d }) => d),
  )

  route(
    app,
    { method: 'post', path: '/knowledge', tag: 'Connaissances', summary: 'Ajouter une source (site web indexé par le serveur)', permission: 'agents.write', body: z.object({ name: str(500).min(1), kind: z.enum(['pdf', 'docx', 'website', 'markdown']), content: z.string().max(200_000).optional() }), status: 201 },
    async ({ body, principal }) => {
      const [d] = await db.insert(s.knowledgeDocs).values({ id: newId('kb'), name: body.name, kind: body.kind, size: '…', status: 'indexing', content: body.content ?? null }).returning()
      await queue.add('knowledge.index', 'index', { docId: d.id })
      await audit(who(principal), 'user', 'a ajouté une source', body.name)
      const { createdAt: _c, content: _t, ...rest } = d
      return rest
    },
  )

  route(app, { method: 'delete', path: '/knowledge/:id', tag: 'Connaissances', summary: 'Retirer une source', permission: 'agents.write', status: 204 }, async ({ params }) => {
    await db.delete(s.knowledgeDocs).where(eq(s.knowledgeDocs.id, params.id))
  })

  route(app, { method: 'get', path: '/memories', tag: 'Connaissances', summary: 'Souvenirs des agents', query: z.object({ agentId: IdSchema.optional() }) }, async ({ query }) =>
    db.select().from(s.memories).where(query.agentId ? eq(s.memories.agentId, query.agentId) : undefined).orderBy(desc(s.memories.createdAt)),
  )

  route(app, { method: 'delete', path: '/memories/:id', tag: 'Connaissances', summary: 'Oublier un souvenir', permission: 'agents.write', status: 204 }, async ({ params }) => {
    await db.delete(s.memories).where(eq(s.memories.id, params.id))
  })

  /* ---------- Automation ---------- */
  route(app, { method: 'get', path: '/workflows', tag: 'Automatisation', summary: 'Workflows' }, () => db.select().from(s.workflows))

  route(app, { method: 'put', path: '/workflows/:id', tag: 'Automatisation', summary: 'Enregistrer un workflow', permission: 'deploy', body: WorkflowInput }, async ({ params, body, principal }) => {
    const wf = { ...body, id: params.id }
    await db.insert(s.workflows).values(wf).onConflictDoUpdate({ target: s.workflows.id, set: { name: wf.name, nodes: wf.nodes, published: wf.published, agentId: wf.agentId } })
    await audit(who(principal), 'user', wf.published ? 'a publié le workflow' : 'a enregistré le workflow', wf.name)
    return wf
  })

  route(app, { method: 'get', path: '/delegations', tag: 'Automatisation', summary: 'Délégations entre agents (A2A)' }, () => db.select().from(s.delegations))

  route(app, { method: 'post', path: '/delegations', tag: 'Automatisation', summary: 'Ajouter une délégation', permission: 'agents.write', body: z.object({ fromAgentId: IdSchema, toAgentId: IdSchema }), status: 201 }, async ({ body }) => {
    if (body.fromAgentId === body.toAgentId) throw conflict('Un agent ne peut pas se déléguer à lui-même')
    const [d] = await db.insert(s.delegations).values({ id: newId('dl'), ...body }).onConflictDoNothing().returning()
    if (!d) throw conflict('Cette délégation existe déjà')
    return d
  })

  route(app, { method: 'patch', path: '/delegations/:id', tag: 'Automatisation', summary: 'Activer ou désactiver une délégation', permission: 'agents.write', body: z.object({ enabled: z.boolean() }) }, async ({ params, body }) => {
    const [d] = await db.update(s.delegations).set(body).where(eq(s.delegations.id, params.id)).returning()
    if (!d) throw notFound('Délégation')
    return d
  })

  route(app, { method: 'get', path: '/schedules', tag: 'Automatisation', summary: 'Déclencheurs planifiés (cron)' }, () => db.select().from(s.schedules))

  const Cron = str(100).regex(/^(\S+\s+){4}\S+$/, 'expression cron à 5 champs attendue')
  route(app, { method: 'post', path: '/schedules', tag: 'Automatisation', summary: 'Ajouter une planification', permission: 'agents.write', body: z.object({ agentId: IdSchema, cron: Cron, label: str(120) }), status: 201 }, async ({ body }) => {
    const [r] = await db.insert(s.schedules).values({ id: newId('sch'), ...body }).returning()
    return r
  })

  route(app, { method: 'patch', path: '/schedules/:id', tag: 'Automatisation', summary: 'Activer ou désactiver une planification', permission: 'agents.write', body: z.object({ enabled: z.boolean() }) }, async ({ params, body }) => {
    const [r] = await db.update(s.schedules).set(body).where(eq(s.schedules.id, params.id)).returning()
    if (!r) throw notFound('Planification')
    return r
  })
}
