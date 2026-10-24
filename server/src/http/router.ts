import type { Context, Hono } from 'hono'
import { z } from 'zod'
import { badRequest, forbidden, unauthorized } from '../lib/errors'
import { can, type Permission } from './permissions'
import type { AppEnv, Principal } from './types'

/**
 * Typed route registration. One declaration gives: Zod validation of params/query/body,
 * the auth + permission check (deterministic code, never AI), and the OpenAPI entry.
 */

export type Auth = 'public' | 'session' | 'session_or_key'

export interface RouteDef<B extends z.ZodType | undefined, Q extends z.ZodType | undefined> {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete'
  path: string
  tag: string
  summary: string
  auth?: Auth
  permission?: Permission
  body?: B
  query?: Q
  response?: z.ZodType
  status?: 200 | 201 | 204
}

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined

export interface Handler<B, Q> {
  (ctx: { c: Context<AppEnv>; principal: Principal | null; userId: string; body: B; query: Q; params: Record<string, string> }): unknown | Promise<unknown>
}

const registry: RouteDef<z.ZodType | undefined, z.ZodType | undefined>[] = []

export function route<B extends z.ZodType | undefined = undefined, Q extends z.ZodType | undefined = undefined>(
  app: Hono<AppEnv>,
  def: RouteDef<B, Q>,
  handler: Handler<Infer<B>, Infer<Q>>,
) {
  registry.push(def as RouteDef<z.ZodType | undefined, z.ZodType | undefined>)
  const auth = def.auth ?? 'session'
  app[def.method](def.path, async (c) => {
    const principal = c.get('principal')
    if (auth !== 'public') {
      if (!principal) throw unauthorized()
      if (auth === 'session' && principal.kind !== 'user') throw unauthorized('Session requise')
      if (def.permission && principal.kind === 'user' && !can(principal.role, def.permission)) throw forbidden()
    }
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
      userId: principal?.kind === 'user' ? principal.id : principal?.kind === 'key' ? `key:${principal.keyId}` : 'anonymous',
      body: body as Infer<B>,
      query: query as Infer<Q>,
      params: c.req.param() as Record<string, string>,
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
      ...(r.permission ? { 'x-permission': r.permission } : {}),
      parameters: [...params, ...qParams],
      ...(r.body ? { requestBody: { required: true, content: { 'application/json': { schema: json(r.body, 'input') } } } } : {}),
      responses: {
        [String(r.status ?? 200)]: r.response ? { description: 'OK', content: { 'application/json': { schema: json(r.response, 'output') } } } : { description: 'OK' },
        400: { description: 'Entrée invalide' },
        401: { description: 'Non authentifié' },
        403: { description: 'Rôle insuffisant' },
      },
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'ForgeAgent API',
      version: '0.1.0',
      description: 'API du back-end ForgeAgent. Authentification par cookie de session (console) ou clé API Bearer (intégrations).',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'fa_session' },
        apiKey: { type: 'http', scheme: 'bearer', description: 'Clé fa_live_… / fa_test_…' },
      },
    },
    paths,
  }
}
