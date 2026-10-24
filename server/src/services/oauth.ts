import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { config } from '../config'
import { db, schema as s } from '../db/client'
import { platformAudit } from '../lib/audit'
import { badRequest, forbidden } from '../lib/errors'
import { createAccount, createSession, toPublic } from './auth'

/**
 * Sign-in with GitHub and Google (Gmail and Google Workspace accounts), authorization-code flow.
 * - The state is random, bound to the browser by a signed httpOnly cookie (CSRF), and expires in 10 min.
 * - Google uses PKCE (S256). Only provider-verified emails are accepted.
 * - An identity (provider, subject) is linked to one account. A verified email equal to an existing
 *   account's email links to that account; otherwise a new account is created if signup is open.
 */

export type Provider = 'github' | 'google'
export const OAUTH_COOKIE = 'fa_oauth'
const TTL_MS = 10 * 60_000

/** Swappable in tests. */
export const oauthHttp = { fetch: (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }) }

export const isEnabled = (p: string): p is Provider => (p === 'github' || p === 'google') && !!config.oauth[p]
export const callbackUrl = (p: Provider) => `${config.PUBLIC_URL}/v1/auth/oauth/${p}/callback`

/* ---------- Signed state cookie ---------- */

interface Flow {
  p: Provider
  state: string
  verifier: string
  next: string
  exp: number
}

const KEY = createHmac('sha256', config.KEY_PEPPER).update('forgeagent:oauth-state:v1').digest()
const b64 = (b: Buffer) => b.toString('base64url')

function seal(f: Flow) {
  const body = b64(Buffer.from(JSON.stringify(f)))
  return `${body}.${b64(createHmac('sha256', KEY).update(body).digest())}`
}

function unseal(cookie: string | undefined): Flow | null {
  const [body, mac] = (cookie ?? '').split('.')
  if (!body || !mac) return null
  const good = createHmac('sha256', KEY).update(body).digest()
  const given = Buffer.from(mac, 'base64url')
  if (given.length !== good.length || !timingSafeEqual(given, good)) return null
  const f = JSON.parse(Buffer.from(body, 'base64url').toString()) as Flow
  return f.exp > Date.now() ? f : null
}

/** Only same-console relative paths: no open redirect. */
export const safeNext = (next: string | undefined) => (next && /^\/(?!\/)[\w\-./?=&%#]*$/.test(next) ? next : '/app')

/* ---------- Step 1: send the browser to the provider ---------- */

export function startFlow(p: Provider, next?: string) {
  const conf = config.oauth[p]!
  const flow: Flow = { p, state: b64(randomBytes(24)), verifier: b64(randomBytes(32)), next: safeNext(next), exp: Date.now() + TTL_MS }
  const url =
    p === 'github'
      ? new URL('https://github.com/login/oauth/authorize')
      : new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', conf.clientId)
  url.searchParams.set('redirect_uri', callbackUrl(p))
  url.searchParams.set('state', flow.state)
  if (p === 'github') {
    url.searchParams.set('scope', 'read:user user:email')
    url.searchParams.set('allow_signup', 'true')
  } else {
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('code_challenge', b64(createHash('sha256').update(flow.verifier).digest()))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('prompt', 'select_account')
  }
  return { url: url.toString(), cookie: seal(flow), maxAgeSec: TTL_MS / 1000 }
}

/* ---------- Step 2: the provider sends the browser back ---------- */

interface Profile {
  subject: string
  email: string
  name: string
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw badRequest(`${what} : réponse ${res.status} du fournisseur`)
  return (await res.json()) as T
}

async function githubProfile(code: string): Promise<Profile> {
  const conf = config.oauth.github!
  const tok = await json<{ access_token?: string; error_description?: string }>(
    await oauthHttp.fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: conf.clientId, client_secret: conf.clientSecret, code, redirect_uri: callbackUrl('github') }),
    }),
    'Jeton GitHub',
  )
  if (!tok.access_token) throw badRequest(`GitHub a refusé la connexion${tok.error_description ? ` : ${tok.error_description}` : ''}`)
  const headers = { authorization: `Bearer ${tok.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'ForgeAgent' }
  const user = await json<{ id: number; login: string; name: string | null }>(await oauthHttp.fetch('https://api.github.com/user', { headers }), 'Profil GitHub')
  const emails = await json<{ email: string; primary: boolean; verified: boolean }[]>(await oauthHttp.fetch('https://api.github.com/user/emails', { headers }), 'Emails GitHub')
  const email = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
  if (!email) throw forbidden('Aucune adresse email vérifiée sur ce compte GitHub')
  return { subject: String(user.id), email: email.email, name: user.name || user.login }
}

async function googleProfile(code: string, verifier: string): Promise<Profile> {
  const conf = config.oauth.google!
  const tok = await json<{ access_token?: string }>(
    await oauthHttp.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: conf.clientId, client_secret: conf.clientSecret, redirect_uri: callbackUrl('google'), grant_type: 'authorization_code', code_verifier: verifier }).toString(),
    }),
    'Jeton Google',
  )
  if (!tok.access_token) throw badRequest('Google a refusé la connexion')
  const u = await json<{ sub: string; email?: string; email_verified?: boolean; name?: string }>(
    await oauthHttp.fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } }),
    'Profil Google',
  )
  if (!u.email || !u.email_verified) throw forbidden('Adresse Gmail non vérifiée par Google')
  return { subject: u.sub, email: u.email, name: u.name || u.email.split('@')[0] }
}

/** Finishes the flow: checks the state, reads the verified profile, signs in (or signs up). */
export async function finishFlow(p: Provider, query: { code?: string; state?: string; error?: string }, cookie: string | undefined, userAgent?: string) {
  const flow = unseal(cookie)
  if (query.error) throw badRequest(query.error === 'access_denied' ? 'Connexion annulée' : `Le fournisseur a renvoyé une erreur : ${query.error}`)
  if (!flow || flow.p !== p || !query.state || flow.state !== query.state) throw badRequest('Session de connexion expirée ou invalide : recommencez')
  if (!query.code) throw badRequest('Code d’autorisation manquant')
  const profile = p === 'github' ? await githubProfile(query.code) : await googleProfile(query.code, flow.verifier)
  const user = await signInWith(p, profile)
  return { user, token: await createSession(user.id, userAgent), next: flow.next }
}

async function signInWith(p: Provider, profile: Profile) {
  const now = new Date().toISOString()
  const [linked] = await db
    .select({ user: s.users })
    .from(s.userIdentities)
    .innerJoin(s.users, eq(s.users.id, s.userIdentities.userId))
    .where(and(eq(s.userIdentities.provider, p), eq(s.userIdentities.subject, profile.subject)))
  if (linked) {
    await db.update(s.userIdentities).set({ lastLoginAt: now, email: profile.email }).where(and(eq(s.userIdentities.provider, p), eq(s.userIdentities.subject, profile.subject)))
    await platformAudit(linked.user.name, `s’est connecté avec ${p}`, 'console')
    return toPublic(linked.user)
  }
  // The provider verified this email: it may claim the account (or pending invitation) that uses it.
  let [user] = await db.select().from(s.users).where(sql`lower(${s.users.email}) = ${profile.email.toLowerCase()}`)
  if (user) {
    if (user.passwordHash.startsWith('invite$')) await db.update(s.users).set({ passwordHash: 'oauth$', name: profile.name }).where(eq(s.users.id, user.id))
  } else {
    const created = await createAccount(profile.name, profile.email, 'oauth$', p)
    ;[user] = await db.select().from(s.users).where(eq(s.users.id, created.id))
  }
  await db.insert(s.userIdentities).values({ provider: p, subject: profile.subject, userId: user.id, email: profile.email, lastLoginAt: now })
  await platformAudit(user.name, `a relié son compte ${p}`, profile.email)
  return toPublic(user)
}
