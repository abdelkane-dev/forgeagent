import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from '../config'
import { route } from '../http/router'
import { Login, Signup } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { acceptInvite, login, logout, me, SESSION_COOKIE, signup, signupState } from '../services/auth'
import { finishFlow, isEnabled, OAUTH_COOKIE, startFlow } from '../services/oauth'

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

const console0 = () => config.consoleOrigins[0]
const OAUTH_PATH = '/v1/auth/oauth'

export function authRoutes(app: Hono<AppEnv>) {
  route(
    app,
    { method: 'get', path: '/auth/providers', tag: 'Auth', summary: 'Moyens de connexion disponibles et état de l’inscription', auth: 'public' },
    async () => ({ password: true, github: isEnabled('github'), google: isEnabled('google'), signup: await signupState() }),
  )

  // OAuth (GitHub, Google). Top-level browser navigations: errors come back to the console's login page.
  route(
    app,
    { method: 'get', path: '/auth/oauth/:provider/start', tag: 'Auth', summary: 'Se connecter ou s’inscrire avec GitHub ou Google (redirection)', auth: 'public', query: z.object({ next: z.string().max(300).optional() }) },
    ({ c, params, query }) => {
      if (!isEnabled(params.provider)) return c.redirect(`${console0()}/login?error=${encodeURIComponent('Ce fournisseur de connexion n’est pas configuré')}`)
      const f = startFlow(params.provider, query.next)
      setCookie(c, OAUTH_COOKIE, f.cookie, { httpOnly: true, sameSite: 'Lax', secure: config.isProd, path: OAUTH_PATH, maxAge: f.maxAgeSec })
      return c.redirect(f.url)
    },
  )

  route(
    app,
    { method: 'get', path: '/auth/oauth/:provider/callback', tag: 'Auth', summary: 'Retour du fournisseur OAuth (crée la session)', auth: 'public', query: z.object({ code: z.string().max(500).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }) },
    async ({ c, params, query }) => {
      const cookie = getCookie(c, OAUTH_COOKIE)
      deleteCookie(c, OAUTH_COOKIE, { path: OAUTH_PATH })
      try {
        if (!isEnabled(params.provider)) throw new Error('Ce fournisseur de connexion n’est pas configuré')
        const r = await finishFlow(params.provider, query, cookie, c.req.header('user-agent'))
        setSession(c, r.token)
        return c.redirect(`${console0()}${r.next}`)
      } catch (e) {
        return c.redirect(`${console0()}/login?error=${encodeURIComponent(e instanceof Error ? e.message : 'Connexion impossible')}`)
      }
    },
  )

  route(app, { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Se connecter (cookie de session httpOnly)', auth: 'public', body: Login, response: User }, async ({ c, body }) => {
    const r = await login(body.email, body.password, ipOf(c), c.req.header('user-agent'))
    setSession(c, r.token)
    return r.user
  })

  route(app, { method: 'post', path: '/auth/signup', tag: 'Auth', summary: 'Créer un compte (le premier devient administrateur ; ensuite selon SIGNUP_MODE)', auth: 'public', body: Signup, response: User, status: 201 }, async ({ c, body }) => {
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
