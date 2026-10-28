import type { Hono } from 'hono'
import { z } from 'zod'
import { scoped } from '../db/client'
import { conflict, forbidden } from '../lib/errors'
import { route, userCtx } from '../http/router'
import { AgentDraft, AgentPatch, AgentStatus, RunInput } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { runChecks } from '../runtime/checks'
import { runAgent } from '../runtime/run-agent'
import { createAgent, duplicateAgent, getAgent, listAgents, restoreVersion, setStatus, updateAgent } from '../services/agents'
import { getDocs, generateDoc } from '../services/docs'
import { regressionGate } from '../services/evals'
import { exportAgent, purgeAgent } from '../services/lifecycle'
import { usageSummary } from '../services/usage'

export function agentRoutes(app: Hono<AppEnv>) {
  /* ---------- The user's agents only (RLS: membership) ---------- */
  route(app, { method: 'get', path: '/agents', tag: 'Agents', summary: 'Mes agents (ceux dont je suis membre)' }, ({ user }) =>
    scoped(userCtx(user!.id), (tx) => listAgents(tx, user!.id)),
  )

  route(app, { method: 'post', path: '/agents', tag: 'Agents', summary: 'Forger un agent (le créateur en devient propriétaire)', body: AgentDraft, status: 201 }, ({ body, user }) =>
    scoped(userCtx(user!.id), (tx) => createAgent(tx, body, { id: user!.id, name: user!.name }, { status: 'starting' })),
  )

  /* ---------- One agent's space ---------- */
  route(app, { method: 'get', path: '/agents/:agentId', tag: 'Agents', summary: 'Aperçu d’un agent', auth: 'session_or_key', agent: 'viewer' }, ({ agent, user }) =>
    agent.tx((tx) => getAgent(tx, agent.id, user?.id)),
  )

  route(
    app,
    { method: 'patch', path: '/agents/:agentId', tag: 'Agents', summary: 'Modifier un agent. Avec versionNote : test de régression puis nouvelle version', agent: 'editor', body: AgentPatch },
    async ({ agent, body, user }) => {
      let regressionScore: number | null | undefined
      if (body.versionNote) {
        const current = await agent.tx((tx) => getAgent(tx, agent.id, user?.id))
        const candidate = { ...current, ...body, permissions: body.permissions ?? current.permissions }
        const gate = await regressionGate(agent.id, candidate, agent.actor.name)
        if (!gate.ok) throw conflict(`Régression détectée : ${gate.reports.map((r) => `${r.suite} ${r.score} % (référence ${r.baseline ?? '—'} %)`).join(' ; ')}`)
        regressionScore = gate.score
      }
      return agent.tx((tx) => updateAgent(tx, agent.id, { ...body, regressionScore }, agent.actor))
    },
  )

  route(app, { method: 'post', path: '/agents/:agentId/status', tag: 'Agents', summary: 'Changer l’état (Inactif, Actif…)', agent: 'editor', body: z.object({ status: AgentStatus }) }, ({ agent, body }) =>
    agent.tx((tx) => setStatus(tx, agent.id, body.status, agent.actor)),
  )

  route(app, { method: 'post', path: '/agents/:agentId/versions/:version/restore', tag: 'Agents', summary: 'Restaurer une version', agent: 'editor' }, ({ agent, params }) =>
    agent.tx((tx) => restoreVersion(tx, agent.id, Number(params.version), agent.actor)),
  )

  // A copy is a new agent: it is created outside the source agent's context, the copier owns it.
  route(app, { method: 'post', path: '/agents/:agentId/duplicate', tag: 'Agents', summary: 'Dupliquer la configuration (sans données)', agent: 'editor', status: 201 }, ({ agent, user }) =>
    scoped(userCtx(user!.id), (tx) => duplicateAgent(tx, agent.id, { ...agent.actor, role: 'owner' })),
  )

  route(app, { method: 'get', path: '/agents/:agentId/export', tag: 'Agents', summary: 'Exporter toutes les données de l’agent (sans secrets)', agent: 'owner' }, ({ agent }) => exportAgent(agent.ctx, agent.id))

  route(app, { method: 'delete', path: '/agents/:agentId', tag: 'Agents', summary: 'Supprimer et purger l’agent (base, vecteurs, fichiers, secrets)', agent: 'owner', status: 204 }, async ({ agent }) => {
    await purgeAgent(agent.ctx, agent.id, agent.actor.name)
  })

  /* ---------- Runtime ---------- */
  route(
    app,
    { method: 'post', path: '/agents/:agentId/run', tag: 'Exécution', summary: 'Exécuter l’agent (environment test : bac à sable ; clé de test ⇒ test imposé)', auth: 'session_or_key', agent: 'viewer', body: RunInput },
    async ({ agent, body, principal }) => {
      const test = body.environment === 'test' || (principal?.kind === 'key' && principal.environment === 'test')
      if (!test && agent.role === 'viewer') throw forbidden('Un lecteur ne peut exécuter l’agent qu’en environnement de test')
      const r = await runAgent(agent.id, body.input, {
        source: principal?.kind === 'key' ? 'api' : 'playground',
        sandbox: test,
        sessionId: body.sessionId,
        history: body.history,
        actor: agent.actor.name,
      })
      return { ...r.message, runId: r.runId, status: r.status }
    },
  )

  route(app, { method: 'post', path: '/agents/:agentId/checks', tag: 'Exécution', summary: 'Tests de connexion et de configuration', agent: 'viewer' }, ({ agent }) => runChecks(agent.id))

  route(app, { method: 'get', path: '/agents/:agentId/usage', tag: 'Coûts et usage', summary: 'Coûts, tokens et budget de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => usageSummary(tx, agent.id)))

  route(app, { method: 'get', path: '/agents/:agentId/docs', tag: 'Documentation', summary: 'Documentation générée de l’agent', agent: 'viewer' }, ({ agent }) => agent.tx((tx) => getDocs(tx, agent.id)))
  route(app, { method: 'post', path: '/agents/:agentId/docs', tag: 'Documentation', summary: 'Régénérer la documentation', agent: 'editor' }, ({ agent }) =>
    agent.tx(async (tx) => {
      await generateDoc(tx, agent.id)
      return getDocs(tx, agent.id)
    }),
  )

  /**
   * The agent as an MCP server (JSON-RPC over HTTP, stateless): one tool, `run`.
   * Reached with this agent's own secret key only.
   */
  route(
    app,
    {
      method: 'post',
      path: '/agents/:agentId/mcp',
      tag: 'Exécution',
      summary: 'Serveur MCP de l’agent (initialize, tools/list, tools/call « run »)',
      auth: 'session_or_key',
      agent: 'editor',
      body: z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]).optional(), method: z.string().max(100), params: z.record(z.string(), z.unknown()).optional() }),
    },
    async ({ c, agent, body, principal, user }) => {
      if (body.id === undefined) return c.body(null, 202) // notification
      const reply = (result: unknown) => ({ jsonrpc: '2.0', id: body.id, result })
      const a = await agent.tx((tx) => getAgent(tx, agent.id, user?.id))
      switch (body.method) {
        case 'initialize':
          return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: `forgeagent-${a.id}`, version: String(a.version) } })
        case 'ping':
          return reply({})
        case 'tools/list':
          return reply({
            tools: [
              {
                name: 'run',
                description: `Demande à « ${a.name} » : ${a.mission.slice(0, 300)}`,
                inputSchema: { type: 'object', properties: { input: { type: 'string', description: 'La demande' } }, required: ['input'] },
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: true,
                annotations: {
                  readOnlyHint: false,
                  destructiveHint: false,
                  idempotentHint: false,
                  openWorldHint: true,
                },
              },
            ],
          })
        case 'tools/call': {
          const input = String((body.params?.arguments as { input?: unknown } | undefined)?.input ?? '').slice(0, 8000)
          if (body.params?.name !== 'run' || !input) return { jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Outil « run » avec { input } attendu' } }
          const sandbox = principal?.kind === 'key' && principal.environment === 'test'
          const r = await runAgent(agent.id, input, { source: 'mcp', sandbox, actor: agent.actor.name })
          return reply({ content: [{ type: 'text', text: r.message.content }], isError: r.status !== 'ok' })
        }
        default:
          return { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: `Méthode inconnue : ${body.method}` } }
      }
    },
  )
}
