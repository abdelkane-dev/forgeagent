import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { and, eq } from 'drizzle-orm'
import type { AgentIntegration } from '@shared/types'
import { config } from '../config'
import { asAgent, schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { newId } from '../lib/crypto'
import { badRequest, conflict, notFound } from '../lib/errors'
import { writeLog } from '../services/settings'
import { generateDoc } from '../services/docs'

/* ---------- SSRF-safe fetch ---------- */

function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.')
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

export async function assertPublicUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw badRequest('Adresse invalide : utilisez https://…')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Seuls http et https sont acceptés')
  if (url.username || url.password) throw badRequest('Identifiants interdits dans l’URL')
  if (config.ALLOW_PRIVATE_SITE_URLS) return url
  const addrs = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true }).catch(() => [])
  if (!addrs.length) throw badRequest('Nom de domaine introuvable')
  if (addrs.some((a) => isPrivate(a.address))) throw badRequest('Adresse privée refusée (protection SSRF)')
  return url
}

/** GET with manual redirects (each hop re-checked), size cap and timeout. */
export async function safeGet(raw: string, timeoutMs = 6000): Promise<{ status: number; body: string; latencyMs: number }> {
  let url = await assertPublicUrl(raw)
  const t0 = Date.now()
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'ForgeAgent-SiteCheck/0.2' } })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location')!, url).toString())
      continue
    }
    const reader = res.body?.getReader()
    let body = ''
    if (reader) {
      const dec = new TextDecoder()
      while (body.length < 512_000) {
        const { done, value } = await reader.read()
        if (done) break
        body += dec.decode(value, { stream: true })
      }
      await reader.cancel().catch(() => null)
    }
    return { status: res.status, body, latencyMs: Date.now() - t0 }
  }
  throw new Error('Trop de redirections')
}

/* ---------- Integrations of one agent ---------- */

const toIntegration = (i: typeof s.integrations.$inferSelect): AgentIntegration => ({
  id: i.id,
  agentId: i.agentId,
  kind: i.kind,
  name: i.name,
  url: i.url,
  environment: i.environment,
  status: i.status,
  lastCheckAt: i.lastCheckAt,
  latencyMs: i.latencyMs,
  secretName: i.secretName,
})

export async function listIntegrations(tx: Tx, agentId: string) {
  return (await tx.select().from(s.integrations).where(eq(s.integrations.agentId, agentId))).map(toIntegration)
}

export async function createIntegration(
  tx: Tx,
  agentId: string,
  input: { kind: AgentIntegration['kind']; name: string; url: string; environment: 'test' | 'production'; secretName?: string | null },
  actor: string,
) {
  await assertPublicUrl(input.url)
  const [i] = await tx.insert(s.integrations).values({ id: newId('int'), agentId, ...input, secretName: input.secretName ?? null }).returning()
  // The site's origin is added to this agent's allowed origins (widget CORS).
  const origin = new URL(input.url).origin
  const [a] = await tx.select({ origins: s.agents.allowedOrigins }).from(s.agents).where(eq(s.agents.id, agentId))
  if (!a.origins.includes(origin)) await tx.update(s.agents).set({ allowedOrigins: [...a.origins, origin] }).where(eq(s.agents.id, agentId))
  await generateDoc(tx, agentId)
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a ajouté une intégration', target: `${input.name} · ${input.url}` })
  return toIntegration(i)
}

export async function deleteIntegration(tx: Tx, agentId: string, id: string, actor: string) {
  const [i] = await tx.delete(s.integrations).where(and(eq(s.integrations.id, id), eq(s.integrations.agentId, agentId))).returning()
  if (!i) throw notFound('Intégration')
  await generateDoc(tx, agentId)
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a supprimé une intégration', target: i.name })
}

/**
 * Site check: the site must answer, and its HTML must load our widget for THIS agent.
 * connected = widget found; pending = reachable but snippet missing; unreachable = no answer.
 */
export async function checkIntegration(agentId: string, integrationId: string, actor: string) {
  const integration = await asAgent(agentId, async (tx) => (await tx.select().from(s.integrations).where(and(eq(s.integrations.id, integrationId), eq(s.integrations.agentId, agentId))))[0])
  if (!integration) throw notFound('Intégration')
  let status: AgentIntegration['status'] = 'unreachable'
  let latencyMs: number | null = null
  try {
    const res = await safeGet(integration.url)
    latencyMs = res.latencyMs
    const hasWidget = /\/widget\.js/.test(res.body) && new RegExp(`data-agent=["']${agentId}["']`).test(res.body)
    status = res.status < 400 && hasWidget ? 'connected' : res.status < 400 ? 'pending' : 'unreachable'
  } catch {
    status = 'unreachable'
  }
  return asAgent(agentId, async (tx) => {
    const [u] = await tx.update(s.integrations).set({ status, latencyMs, lastCheckAt: new Date().toISOString() }).where(eq(s.integrations.id, integrationId)).returning()
    await writeLog(tx, agentId, status === 'connected' ? 'info' : 'warn', `site ${integration.url} : ${status === 'connected' ? `widget détecté (${latencyMs} ms)` : status === 'pending' ? 'joignable, widget absent' : 'injoignable'}`)
    await audit(tx, agentId, { actor, actorType: 'user', action: 'a vérifié une intégration', target: integration.url, result: status === 'connected' ? 'ok' : 'error' })
    return toIntegration(u)
  })
}

/* ---------- Console → site events, on the agent's own channel ---------- */

export const siteChannel = (agentId: string) => `agent:${agentId}:site`
const ackChannel = (agentId: string, eventId: string) => `agent:${agentId}:site-ack:${eventId}`

/** The widget acknowledges an event; only listeners of this agent's channel can receive it. */
export const ackSiteEvent = (agentId: string, eventId: string, response: string) => bus.publish(ackChannel(agentId, eventId), { response })

/**
 * Sends an event to every open page running this agent's widget and waits for the first ack.
 * Acting on an external site is sensitive: allowed only if the agent was granted it.
 */
export async function sendToSite(agentId: string, event: string, actor: string) {
  const { agent, connected } = await asAgent(agentId, async (tx) => ({
    agent: (await tx.select().from(s.agents).where(eq(s.agents.id, agentId)))[0],
    connected: (await tx.select().from(s.integrations).where(and(eq(s.integrations.agentId, agentId), eq(s.integrations.status, 'connected')))).length > 0,
  }))
  if (!agent) throw notFound('Agent')
  if (!connected) throw conflict('Aucun site connecté à cet agent : vérifiez une intégration d’abord')
  const acting = !['ping', 'page.context'].includes(event)
  if (acting && !agent.allowedActions.includes('Agir sur le site externe'))
    throw conflict('Cet agent n’a pas l’action « Agir sur le site externe » : seuls ping et page.context sont permis')
  const eventId = newId('evt')
  const t0 = Date.now()
  const ack = new Promise<{ response: string }>((resolve, reject) => {
    const off = bus.subscribe(ackChannel(agentId, eventId), (p) => {
      off()
      clearTimeout(timer)
      resolve(p as { response: string })
    })
    const timer = setTimeout(() => {
      off()
      reject(conflict('Aucune page ouverte avec le widget n’a répondu (5 s). Ouvrez le site puis réessayez.'))
    }, 5000)
  })
  bus.publish(siteChannel(agentId), { id: eventId, event, at: new Date().toISOString() })
  const { response } = await ack
  const latencyMs = Date.now() - t0
  await asAgent(agentId, async (tx) => {
    await writeLog(tx, agentId, 'info', `événement ${event} → site : ${response.slice(0, 120)} (${latencyMs} ms)`)
    await audit(tx, agentId, { actor, actorType: 'user', action: 'a envoyé un événement au site', target: event })
  })
  return { ok: true, latencyMs, response: `200 OK · ${response}`.slice(0, 300) }
}
