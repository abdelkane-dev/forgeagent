import { and, eq, isNull } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { config } from '../config'
import { db, schema as s } from '../db/client'
import { bus } from '../lib/bus'
import { hashApiKey } from '../lib/crypto'
import { badRequest, forbidden, HttpError, tooMany, unauthorized } from '../lib/errors'
import { hit } from '../lib/rate-limit'
import type { AppEnv } from '../http/types'
import { runAgent } from '../runtime/run-agent'
import { widgetConnected } from '../runtime/site'
import { WIDGET_JS } from '../widget/widget-js'

/** Does an origin belong to the project's allowed domains? `example.com` also covers its subdomains. */
export function originAllowed(origin: string, domains: string[]) {
  let u: URL
  try {
    u = new URL(origin)
  } catch {
    return false
  }
  return domains.some((d) => {
    const dl = d.toLowerCase()
    if (dl.includes(':')) return u.host.toLowerCase() === dl
    const h = u.hostname.toLowerCase()
    return h === dl || h.endsWith(`.${dl}`)
  })
}

/**
 * Publishable key → project → agent of that project → page origin in the project's allowed domains.
 * Every widget call goes through this; nothing else is trusted from the page.
 */
async function authorize(c: Context<AppEnv>, key: string | undefined, agentId: string | undefined) {
  if (!key || !/^fa_pub_[a-z0-9]{20,}$/.test(key) || !agentId || !/^[a-z]+_[a-z0-9]+$/.test(agentId)) throw unauthorized('Clé ou agent manquant')
  const [k] = await db.select().from(s.apiKeys).where(and(eq(s.apiKeys.keyHash, hashApiKey(key)), isNull(s.apiKeys.revokedAt), eq(s.apiKeys.scope, 'publishable')))
  if (!k?.projectId) throw unauthorized('Clé de widget invalide')
  const [link] = await db.select().from(s.agentProjects).where(and(eq(s.agentProjects.agentId, agentId), eq(s.agentProjects.projectId, k.projectId)))
  if (!link) throw forbidden('Cet agent n’appartient pas au projet de la clé')
  const [project] = await db.select().from(s.projects).where(eq(s.projects.id, k.projectId))
  // Same-origin GETs (EventSource on a page served by the API itself) carry no Origin header:
  // Sec-Fetch-Site cannot be set by page scripts, so it safely identifies the API's own origin.
  const referer = c.req.header('referer')
  const origin =
    c.req.header('origin') ??
    (c.req.header('sec-fetch-site') === 'same-origin' ? new URL(config.PUBLIC_URL).origin : referer ? new URL(referer).origin : undefined)
  if (!origin || !originAllowed(origin, project.allowedDomains)) throw forbidden(`Origine non autorisée pour ce projet : ajoutez le domaine dans Projets › Domaines autorisés`)
  void db.update(s.apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(s.apiKeys.id, k.id)).catch(() => null)
  return { origin, keyId: k.id }
}

const allow = (c: Context<AppEnv>, origin: string) => {
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin')
}

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

export function registerWidget(app: Hono<AppEnv>) {
  app.get('/widget.js', (c) => {
    c.header('Content-Type', 'application/javascript; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=300')
    c.header('Cross-Origin-Resource-Policy', 'cross-origin')
    return c.body(WIDGET_JS)
  })

  const errorJson = (c: Context<AppEnv>, e: unknown) => {
    const origin = c.req.header('origin')
    if (origin) allow(c, origin) // let the page read the error message; nothing sensitive is returned
    const status = e instanceof HttpError ? e.status : 500
    return c.json({ message: e instanceof HttpError ? e.message : 'Erreur interne' }, status as 400)
  }

  app.post('/v1/widget/message', async (c) => {
    try {
      const raw = await c.req.text()
      if (raw.length > 20_000) throw badRequest('Message trop long')
      const body = z
        .object({ key: z.string(), agent: z.string(), input: z.string().trim().min(1).max(2000), history: z.array(z.object({ role: z.enum(['user', 'agent']), content: z.string().max(4000) })).max(10).default([]) })
        .safeParse(JSON.parse(raw))
      if (!body.success) throw badRequest('Requête invalide')
      const { origin, keyId } = await authorize(c, body.data.key, body.data.agent)
      const ip = c.req.header('x-forwarded-for')?.split(',')[0] ?? 'local'
      if (!(await hit(`widget:${keyId}:${ip}`, 20, 60_000)).ok) throw tooMany()
      const r = await runAgent(body.data.agent, body.data.input, { source: 'widget', history: body.data.history })
      allow(c, origin)
      // Visitors get the answer only: no tool calls, no internal ids.
      return c.json({ content: r.message.content, status: r.status })
    } catch (e) {
      return errorJson(c, e)
    }
  })

  app.get('/v1/widget/events', async (c) => {
    try {
      const agentId = c.req.query('agent')
      const { origin } = await authorize(c, c.req.query('key'), agentId)
      allow(c, origin)
      return streamSSE(c, async (stream) => {
        widgetConnected(agentId!, 1)
        const off = bus.subscribe(`site:${agentId}`, (e) => void stream.writeSSE({ data: JSON.stringify(e) }))
        stream.onAbort(() => {
          off()
          widgetConnected(agentId!, -1)
        })
        while (!stream.aborted) {
          await stream.writeSSE({ event: 'ping', data: '' })
          await stream.sleep(15_000)
        }
      })
    } catch (e) {
      return errorJson(c, e)
    }
  })

  app.post('/v1/widget/events/:id/ack', async (c) => {
    try {
      const body = z.object({ key: z.string(), agent: z.string(), response: z.string().max(500) }).safeParse(JSON.parse(await c.req.text()))
      if (!body.success) throw badRequest('Requête invalide')
      const { origin } = await authorize(c, body.data.key, body.data.agent)
      bus.publish(`site-ack:${c.req.param('id')}`, { response: body.data.response })
      allow(c, origin)
      return c.json({ ok: true })
    } catch (e) {
      return errorJson(c, e)
    }
  })

  /** Demo site for local integration tests: a fake Bonaco Pro page embedding the real widget. */
  app.get('/demo-site', (c) => {
    const agent = escapeHtml(c.req.query('agent') ?? 'agt_7x1pd')
    const key = escapeHtml(c.req.query('key') ?? '')
    c.header('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; style-src 'self' 'unsafe-inline'`)
    return c.html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bonaco Pro · démo</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f4f5f7;color:#0b0c0e}header{padding:18px 24px;background:#fff;font-weight:800}main{padding:32px 24px;max-width:760px}h1{font-size:34px;margin:0 0 8px}</style></head>
<body><header>Bonaco Pro</header><main><h1>Administration</h1><p>Page de démonstration servie par l’API ForgeAgent (${escapeHtml(config.PUBLIC_URL)}). Le widget de l’agent est chargé ci-dessous.</p></main>
<script src="/widget.js" data-agent="${agent}" data-project="bonaco-pro" data-key="${key}" data-title="Assistant Bonaco" defer></script></body></html>`)
  })
}
