import type { Context, Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from '../config'
import { route } from '../http/router'
import { Login, Signup } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { acceptInvite, login, logout, me, SESSION_COOKIE, signup } from '../services/auth'

const User = z.object({ id: z.string(), name: z.string(), email: z.string(), platformRole: z.enum(['admin', 'member']) })

function setSession(c: Context<AppEnv>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600,
  })
}

const ipOf = (c: Context<AppEnv>) => c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.req.header('x-real-ip') ?? 'local'

export function authRoutes(app: Hono<AppEnv>) {
  route(app, { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Se connecter (cookie de session httpOnly)', auth: 'public', body: Login, response: User }, async ({ c, body }) => {
    const r = await login(body.email, body.password, ipOf(c), c.req.header('user-agent'))
    setSession(c, r.token)
    return r.user
  })

  route(app, { method: 'post', path: '/auth/signup', tag: 'Auth', summary: 'Créer le premier compte administrateur (instance vide uniquement)', auth: 'public', body: Signup, response: User, status: 201 }, async ({ c, body }) => {
    const r = await signup(body.name, body.email, body.password, c.req.header('user-agent'))
    setSession(c, r.token)
    return r.user
  })

  route(
    app,
    { method: 'post', path: '/auth/accept-invite', tag: 'Auth', summary: 'Accepter une invitation et choisir son mot de passe', auth: 'public', body: z.object({ email: z.email(), token: z.string().min(10).max(100), password: z.string().min(10).max(200), name: z.string().min(2).max(80).optional() }), response: User },
    async ({ c, body }) => {
      const r = await acceptInvite(body.email, body.token, body.password, body.name)
      setSession(c, r.token)
      return r.user
    },
  )

  route(app, { method: 'post', path: '/auth/reset-request', tag: 'Auth', summary: 'Demander un lien de réinitialisation (réponse identique que le compte existe ou non)', auth: 'public', body: z.object({ email: z.email() }) }, async () => ({ ok: true }))

  route(app, { method: 'post', path: '/auth/logout', tag: 'Auth', summary: 'Se déconnecter' }, async ({ c, principal }) => {
    if (principal?.kind === 'user') await logout(principal.sessionId)
    deleteCookie(c, SESSION_COOKIE, { path: '/' })
    return undefined
  })

  route(app, { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Utilisateur courant', response: User }, ({ user }) => me(user!.id))
}
