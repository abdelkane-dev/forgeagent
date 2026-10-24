import { eq } from 'drizzle-orm'
import type { Hono } from 'hono'
import { z } from 'zod'
import { db, schema as s } from '../db/client'
import { forbidden } from '../lib/errors'
import { route } from '../http/router'
import { AgentDraft, AgentPatch, IdSchema, RunInput } from '../http/schemas'
import type { AppEnv, Principal } from '../http/types'
import { runChecks } from '../runtime/checks'
import { runAgent } from '../runtime/run-agent'
import { pingSite, sendToSite } from '../runtime/site'
import { createAgent, duplicateAgent, getAgent, listAgents, removeAgent, restoreVersion, updateAgent } from '../services/agents'
import { audit } from '../lib/audit'

const actorOf = (p: Principal | null) => (p?.kind === 'user' ? { id: p.id, name: p.name, role: p.role } : { id: 'system', name: 'Système', role: 'viewer' as const })

/** A project-scoped key may only reach agents of its project. */
async function assertKeyScope(p: Principal | null, agentId: string) {
  if (p?.kind !== 'key' || !p.projectId) return
  const links = await db.select().from(s.agentProjects).where(eq(s.agentProjects.agentId, agentId))
  if (!links.some((l) => l.projectId === p.projectId)) throw forbidden('Cette clé n’a pas accès à cet agent')
}

export function agentRoutes(app: Hono<AppEnv>) {
  route(app, { method: 'get', path: '/agents', tag: 'Agents', summary: 'Lister les agents' }, () => listAgents())

  route(app, { method: 'post', path: '/agents', tag: 'Agents', summary: 'Créer un agent', permission: 'agents.write', body: AgentDraft, status: 201 }, ({ body, principal }) =>
    createAgent(body, actorOf(principal)),
  )

  route(app, { method: 'get', path: '/agents/:id', tag: 'Agents', summary: 'Détail d’un agent', auth: 'session_or_key' }, async ({ params, principal }) => {
    await assertKeyScope(principal, params.id)
    return getAgent(params.id)
  })

  route(app, { method: 'patch', path: '/agents/:id', tag: 'Agents', summary: 'Modifier un agent (versionNote ⇒ nouvelle version)', permission: 'agents.write', body: AgentPatch }, ({ params, body, principal }) =>
    updateAgent(params.id, body, actorOf(principal)),
  )

  route(app, { method: 'delete', path: '/agents/:id', tag: 'Agents', summary: 'Supprimer un agent', permission: 'agents.write', status: 204 }, async ({ params, principal }) => {
    await removeAgent(params.id, actorOf(principal))
  })

  route(app, { method: 'post', path: '/agents/:id/versions/:version/restore', tag: 'Agents', summary: 'Restaurer une version', permission: 'agents.write' }, ({ params, principal }) =>
    restoreVersion(params.id, Number(params.version), actorOf(principal)),
  )

  route(app, { method: 'post', path: '/agents/:id/duplicate', tag: 'Agents', summary: 'Copier un agent vers un projet', permission: 'agents.write', body: z.object({ projectId: IdSchema }) }, ({ params, body, principal }) =>
    duplicateAgent(params.id, body.projectId, actorOf(principal)),
  )

  route(
    app,
    { method: 'post', path: '/agents/:id/run', tag: 'Exécution', summary: 'Exécuter l’agent (sandbox: true pour le bac à sable ; clé de test ⇒ bac à sable imposé)', auth: 'session_or_key', permission: 'agents.run', body: RunInput },
    async ({ params, body, principal }) => {
      await assertKeyScope(principal, params.id)
      const sandbox = body.sandbox || (principal?.kind === 'key' && principal.environment === 'test')
      const r = await runAgent(params.id, body.input, {
        source: principal?.kind === 'key' ? 'api' : 'playground',
        sandbox,
        history: body.history,
      })
      return { ...r.message, runId: r.runId, status: r.status }
    },
  )

  route(app, { method: 'post', path: '/agents/:id/checks', tag: 'Exécution', summary: 'Tests de connexion et de configuration' }, ({ params }) => runChecks(params.id))

  route(
    app,
    { method: 'post', path: '/agents/:id/site/ping', tag: 'Site externe', summary: 'Vérifier qu’un site répond et charge le widget de l’agent', permission: 'deploy', body: z.object({ url: z.string().max(500) }) },
    ({ params, body, principal }) => pingSite(params.id, body.url, actorOf(principal).name),
  )

  route(
    app,
    { method: 'post', path: '/agents/:id/site/events', tag: 'Site externe', summary: 'Envoyer un événement aux pages ouvertes du site (action sensible : permission dédiée)', permission: 'deploy', body: z.object({ event: z.enum(['ping', 'page.context', 'ui.highlight', 'api.call', 'notify.admin']) }) },
    ({ params, body, principal }) => sendToSite(params.id, body.event, actorOf(principal).name),
  )

  route(app, { method: 'delete', path: '/agents/:id/memories', tag: 'Agents', summary: 'Effacer la mémoire d’un agent', permission: 'agents.write', status: 204 }, async ({ params, principal }) => {
    await db.delete(s.memories).where(eq(s.memories.agentId, params.id))
    await audit(actorOf(principal).name, 'user', 'a effacé la mémoire', params.id)
  })
}
