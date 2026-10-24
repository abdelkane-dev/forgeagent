import type { Context, Hono } from 'hono'
import { z } from 'zod'
import type { AgentRole } from '@shared/types'
import { eq } from 'drizzle-orm'
import { scoped, schema as s, type Ctx, type Tx } from '../db/client'
import { audit, platformAudit } from '../lib/audit'
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors'
import { atLeast, memberRole, type Actor } from '../services/agents'
import type { AppEnv, Principal } from './types'

/**
 * Typed route registration. One declaration gives: Zod validation of params/query/body,
 * the auth check, the agent context (membership + role on THIS agent, deterministic code,
 * never AI) and the OpenAPI entry.
 */

export type Auth = 'public' | 'session' | 'session_or_key'

export interface RouteDef<B extends z.ZodType | undefined, Q extends z.ZodType | undefined> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete'
  path: string
  tag: string
  summary: string
  auth?: Auth
  /** Minimum role on the agent named by :agentId. Non-members get 404, whatever the route. */
  agent?: AgentRole
  /** Platform-level permission (accounts, catalogues, instance settings). */
  platform?: 'admin'
  body?: B
  query?: Q
  response?: z.ZodType
  status?: 200 | 201 | 204
}

/** Everything a handler may do on the agent of the route, already authorised. */
export interface AgentScope {
  id: string
  role: AgentRole
  ctx: Ctx
  actor: Actor
  /** Platform admin acting on an agent they are not a member of (audited on every request). */
  maintenance: boolean
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>
}

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined

export interface Handler<B, Q> {
  (ctx: {
    c: Context<AppEnv>
    principal: Principal | null
    /** Signed-in user (null for API keys and public routes). */
    user: Extract<Principal, { kind: 'user' }> | null
    agent: AgentScope
    body: B
    query: Q
    params: Record<string, string>
  }): unknown | Promise<unknown>
}

const registry: RouteDef<z.ZodType | undefined, z.ZodType | undefined>[] = []
const AGENT_ID = /^agt_[a-z0-9]{4,16}$/

export const userCtx = (userId: string): Ctx => ({ mode: 'user', userId })

async function resolveAgent(c: Context<AppEnv>, principal: Principal, agentId: string, min: AgentRole): Promise<AgentScope> {
  // Unknown, malformed and foreign agents all answer the same 404: existence never leaks.
  if (!AGENT_ID.test(agentId)) throw notFound('Agent')
  const scope = (ctx: Ctx, role: AgentRole, actor: Actor, maintenance = false): AgentScope => ({ id: agentId, role, ctx, actor, maintenance, tx: (fn) => scoped(ctx, fn) })

  if (principal.kind === 'key') {
    if (principal.scope !== 'secret' || principal.agentId !== agentId) throw notFound('Agent')
    const s = scope({ mode: 'task', agentId }, 'editor', { id: `key:${principal.keyId}`, name: `Clé API ${principal.keyId}`, role: 'editor', type: 'system' })
    if (!atLeast(s.role, min)) throw forbidden('Rôle insuffisant sur cet agent')
    return s
  }

  const ctx: Ctx = { mode: 'user', userId: principal.id, agentId }
  const role = await scoped(ctx, (tx) => memberRole(tx, agentId, principal.id))
  if (role) {
    if (!atLeast(role, min)) throw forbidden('Rôle insuffisant sur cet agent')
    return scope(ctx, role, { id: principal.id, name: principal.name, role, type: 'user' })
  }

  // Platform maintenance: explicit, justified, and written to the agent's own audit.
  const reason = c.req.header('x-forge-maintenance')?.trim()
  if (principal.platformRole === 'admin' && reason && reason.length >= 5) {
    const pctx: Ctx = { mode: 'platform', userId: principal.id, agentId }
    const [exists] = await scoped(pctx, (tx) => tx.select({ id: s.agents.id }).from(s.agents).where(eq(s.agents.id, agentId)))
    if (!exists) throw notFound('Agent')
    await scoped(pctx, (tx) => audit(tx, agentId, { actor: principal.name, actorType: 'platform', action: `maintenance ${c.req.method} ${c.req.path}`, target: reason.slice(0, 200) }))
    await platformAudit(principal.name, 'accès de maintenance à un agent', agentId, { reason: reason.slice(0, 200), method: c.req.method, path: c.req.path })
    return scope(pctx, 'owner', { id: principal.id, name: `${principal.name} (maintenance)`, role: 'owner', type: 'platform' }, true)
  }
  throw notFound('Agent')
}

export function route<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined>(
  app: Hono<AppEnv>,
  def: RouteDef<B, Q>,
  handler: Handler<Infer<B>, Infer<Q>>,
) {
  registry.push(def as RouteDef<z.ZodType | undefined, z.ZodType | undefined>)
  const auth = def.auth ?? 'session'
  if (def.agent && !def.path.includes(':agentId')) throw new Error(`route ${def.path}: agent role without :agentId`)
  app[def.method](def.path, async (c) => {
    const principal = c.get('principal')
    if (auth !== 'public') {
      if (!principal) throw unauthorized()
      if (auth === 'session' && principal.kind !== 'user') throw unauthorized('Session requise')
    }
    if (def.platform === 'admin' && (principal?.kind !== 'user' || principal.platformRole !== 'admin')) throw forbidden('Réservé aux administrateurs de la plateforme')
    const params = c.req.param() as Record<string, string>
    const agent = def.agent && principal ? await resolveAgent(c, principal, params.agentId, def.agent) : (null as unknown as AgentScope)

    let body: unknown
    if (def.body) {
      const raw = await c.req.json().catch(() => {
        throw badRequest('Corps JSON invalide')
      })
      const r = def.body.safeParse(raw)
      if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.') || 'corps'} : ${i.message}`).join(' ; '))
      body = r.data
    }
    let query: unknown
    if (def.query) {
      const r = def.query.safeParse(c.req.query())
      if (!r.success) throw badRequest(r.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; '))
      query = r.data
    }
    const result = await handler({
      c,
      principal,
      user: principal?.kind === 'user' ? principal : null,
      agent,
      body: body as Infer<B>,
      query: query as Infer<Q>,
      params,
    })
    if (result instanceof Response) return result
    if (def.status === 204 || result === undefined) return c.body(null, 204)
    return c.json(result as object, def.status ?? 200)
  })
}

/** OpenAPI 3.1 document built from the registered routes. */
export function openApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  const json = (s: z.ZodType, io: 'input' | 'output') => {
    try {
      return z.toJSONSchema(s, { io, unrepresentable: 'any' })
    } catch {
      return {}
    }
  }
  for (const r of registry) {
    const p = '/v1' + r.path.replace(/:(\w+)/g, '{$1}')
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }))
    const qSchema = r.query ? (json(r.query, 'input') as { properties?: Record<string, unknown>; required?: string[] }) : null
    const qParams = qSchema?.properties
      ? Object.entries(qSchema.properties).map(([name, schema]) => ({ name, in: 'query', required: qSchema.required?.includes(name) ?? false, schema }))
      : []
    paths[p] ??= {}
    paths[p][r.method] = {
      tags: [r.tag],
      summary: r.summary,
      security: (r.auth ?? 'session') === 'public' ? [] : r.auth === 'session_or_key' ? [{ session: [] }, { apiKey: [] }] : [{ session: [] }],
      ...(r.agent ? { 'x-agent-role': r.agent } : {}),
      ...(r.platform ? { 'x-platform-role': r.platform } : {}),
      parameters: [...params, ...qParams],
      ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: json(r.body, 'input') } } } } : {}),
      responses: {
        [String(r.status ?? 200)]: r.response ? { description: 'OK', content: { 'application/json': { schema: json(r.response, 'output') } } } : { description: 'OK' },
        400: { description: 'Entrée invalide' },
        401: { description: 'Non authentifié' },
        403: { description: 'Rôle insuffisant sur cet agent' },
        404: { description: 'Introuvable, ou agent dont vous n’êtes pas membre' },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'ForgeAgent API',
      version: '0.2.0',
      description:
        'API du back-end ForgeAgent. Chaque agent est un espace isolé sous /agents/{agentId}/… : seuls ses membres y accèdent (rôles owner, editor, viewer). Authentification par cookie de session (console) ou clé API Bearer propre à un agent.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'fa_session' },
        apiKey: { type: 'http', scheme: 'bearer', description: 'Clé fa_live_… / fa_test_… d’un agent : elle ne donne accès qu’à cet agent.' },
      },
    },
    paths,
  }
}
