import { swaggerUI } from '@hono/swagger-ui'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './config'
import { forbidden, HttpError } from './lib/errors'
import { logger } from './lib/logger'
import { randomToken } from './lib/crypto'
import { openApiDocument } from './http/router'
import type { AppEnv } from './http/types'
import { registerRoutes } from './routes'
import { registerWidget } from './routes/widget'
import { resolvePrincipal, SESSION_COOKIE } from './services/auth'

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const publicOrigin = new URL(config.PUBLIC_URL).origin

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('requestId', randomToken(8))
    const t0 = Date.now()
    await next()
    if (!c.req.path.endsWith('/stream') && !c.req.path.includes('/widget/events'))
      logger.debug({ method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - t0 }, 'request')
  })
  app.use('*', secureHeaders({ crossOriginResourcePolicy: false, contentSecurityPolicy: undefined }))

  // Widget endpoints have their own per-project CORS (see routes/widget.ts).
  registerWidget(app)

  const api = new Hono<AppEnv>()
  api.use('*', cors({ origin: (o) => (config.consoleOrigins.includes(o) ? o : null), credentials: true, allowHeaders: ['Content-Type', 'Authorization'], maxAge: 600 }))
  api.use('*', bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ message: 'Requête trop volumineuse' }, 413) }))
  api.use('*', async (c, next) => {
    const principal = await resolvePrincipal(getCookie(c, SESSION_COOKIE), c.req.header('authorization'))
    c.set('principal', principal)
    // CSRF: a cookie-authenticated write must come from the console's own origin.
    if (principal?.kind === 'user' && MUTATING.has(c.req.method)) {
      const origin = c.req.header('origin')
      const site = c.req.header('sec-fetch-site')
      const okOrigin = origin ? config.consoleOrigins.includes(origin) || origin === publicOrigin : site === undefined || site === 'same-origin' || site === 'none'
      if (!okOrigin) throw forbidden('Origine non autorisée (protection CSRF)')
    }
    await next()
  })
  registerRoutes(api)
  api.get('/openapi.json', (c) => c.json(openApiDocument(`${config.PUBLIC_URL}`)))
  app.route('/v1', api)
  app.get('/docs', swaggerUI({ url: '/v1/openapi.json', title: 'ForgeAgent API' }))
  app.get('/health', (c) => c.json({ ok: true }))
  app.get('/', (c) => c.redirect('/docs'))

  app.notFound((c) => c.json({ message: 'Route introuvable' }, 404))
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ message: err.message, code: err.code }, err.status as 400)
    logger.error({ err, path: c.req.path }, 'unhandled error')
    return c.json({ message: 'Erreur interne du serveur' }, 500)
  })
  return app
}
