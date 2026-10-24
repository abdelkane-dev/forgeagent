import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db, schema as s } from '../src/db/client'
import { oauthHttp } from '../src/services/oauth'
import { setupDb } from './helpers'
import { app } from './http'

/** Fake GitHub / Google endpoints. */
type Reply = { status?: number; body: unknown }
let routes: Record<string, Reply> = {}
const realFetch = oauthHttp.fetch
const calls: { url: string; body?: string }[] = []

function stub(r: Record<string, Reply>) {
  routes = r
  oauthHttp.fetch = async (url, init) => {
    calls.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
    const hit = routes[url]
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { 'content-type': 'application/json' } })
  }
}

const github = (id: number, email: string, verified = true) =>
  stub({
    'https://github.com/login/oauth/access_token': { body: { access_token: 'gho_test' } },
    'https://api.github.com/user': { body: { id, login: 'octo', name: 'Octo Cat' } },
    'https://api.github.com/user/emails': { body: [{ email, primary: true, verified }] },
  })

const google = (sub: string, email: string, verified = true) =>
  stub({
    'https://oauth2.googleapis.com/token': { body: { access_token: 'ya29.test' } },
    'https://openidconnect.googleapis.com/v1/userinfo': { body: { sub, email, email_verified: verified, name: 'Inès D.' } },
  })

/** Runs start → provider → callback like a browser, and returns the final redirect and cookies. */
async function signIn(provider: 'github' | 'google', opts: { next?: string; tamperState?: boolean } = {}) {
  const start = await app.request(`/v1/auth/oauth/${provider}/start${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`)
  expect(start.status).toBe(302)
  const to = new URL(start.headers.get('location')!)
  const flowCookie = start.headers.get('set-cookie')!.split(';')[0]
  const state = opts.tamperState ? 'forged-state' : to.searchParams.get('state')!
  const back = await app.request(`/v1/auth/oauth/${provider}/callback?code=abc&state=${state}`, { headers: { cookie: flowCookie } })
  expect(back.status).toBe(302)
  return { authorize: to, location: back.headers.get('location')!, session: back.headers.get('set-cookie')?.split(',').map((c) => c.trim()).find((c) => c.startsWith('fa_session='))?.split(';')[0] }
}

beforeAll(setupDb)
afterEach(() => {
  oauthHttp.fetch = realFetch
  calls.length = 0
})

describe('connexion avec GitHub et Google', () => {
  it('annonce les fournisseurs configurés', async () => {
    const r = await (await app.request('/v1/auth/providers')).json()
    expect(r).toMatchObject({ password: true, github: true, google: true, signup: 'open' })
  })

  it('GitHub : crée un compte membre, relie l’identité et ouvre une session', async () => {
    github(4242, 'octo@example.com')
    const r = await signIn('github', { next: '/app/forge' })
    expect(r.authorize.origin + r.authorize.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(r.authorize.searchParams.get('redirect_uri')).toBe('http://localhost:8787/v1/auth/oauth/github/callback')
    expect(r.location).toBe('http://localhost:5173/app/forge')
    expect(r.session).toBeTruthy()
    const me = await (await app.request('/v1/auth/me', { headers: { cookie: r.session! } })).json()
    expect(me).toMatchObject({ email: 'octo@example.com', name: 'Octo Cat', platformRole: 'member' })
    // A second sign-in reuses the same account.
    github(4242, 'octo@example.com')
    const again = await signIn('github')
    const me2 = await (await app.request('/v1/auth/me', { headers: { cookie: again.session! } })).json()
    expect(me2.id).toBe(me.id)
    expect(await db.select().from(s.users).where(eq(s.users.email, 'octo@example.com'))).toHaveLength(1)
  })

  it('Google (Gmail) : PKCE, et l’email vérifié rejoint le compte existant', async () => {
    google('google-sub-1', 'ines@bonaco.pro')
    const r = await signIn('google')
    expect(r.authorize.searchParams.get('code_challenge_method')).toBe('S256')
    const token = calls.find((c) => c.url === 'https://oauth2.googleapis.com/token')!
    expect(new URLSearchParams(token.body).get('code_verifier')).toBeTruthy()
    const me = await (await app.request('/v1/auth/me', { headers: { cookie: r.session! } })).json()
    expect(me.id).toBe('usr_2')
    const [link] = await db.select().from(s.userIdentities).where(and(eq(s.userIdentities.provider, 'google'), eq(s.userIdentities.subject, 'google-sub-1')))
    expect(link.userId).toBe('usr_2')
    // She keeps her own agents only.
    const agents = await (await app.request('/v1/agents', { headers: { cookie: r.session! } })).json()
    expect(agents.map((a: { id: string }) => a.id).sort()).toEqual(['agt_2m9qa', 'agt_4r0lw', 'agt_8f3k2'])
  })

  it('refuse un état falsifié (CSRF) et un email non vérifié', async () => {
    github(1, 'x@example.com')
    const forged = await signIn('github', { tamperState: true })
    expect(forged.location).toMatch(/\/login\?error=/)
    expect(forged.session).toBeUndefined()
    google('sub-unverified', 'pas-verifie@gmail.com', false)
    const unverified = await signIn('google')
    expect(decodeURIComponent(unverified.location)).toMatch(/non vérifiée/)
    expect(unverified.session).toBeUndefined()
  })

  it('n’autorise aucune redirection hors de la console', async () => {
    github(77, 'redir@example.com')
    const r = await signIn('github', { next: '//evil.example/x' })
    expect(r.location).toBe('http://localhost:5173/app')
  })

  it('un compte GitHub ne peut pas se connecter par mot de passe', async () => {
    const r = await app.request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'octo@example.com', password: 'oauth$' }) })
    expect(r.status).toBe(401)
  })
})
