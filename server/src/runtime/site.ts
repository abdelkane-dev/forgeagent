import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { eq } from 'drizzle-orm'
import type { ExternalSite } from '@shared/types'
import { config } from '../config'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { newId } from '../lib/crypto'
import { badRequest, conflict } from '../lib/errors'
import { getAgentRow } from '../services/agents'
import { writeLog } from '../services/settings'

/* ---------- SSRF-safe fetch for site checks ---------- */

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
async function safeGet(raw: string, timeoutMs = 6000): Promise<{ status: number; body: string; latencyMs: number }> {
  let url = await assertPublicUrl(raw)
  const t0 = Date.now()
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': 'ForgeAgent-SiteCheck/0.1' } })
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

/**
 * Site check: the site must answer, and its HTML must load our widget for this agent.
 * connected = widget found; pending = site reachable but snippet missing; unreachable = no answer.
 */
export async function pingSite(agentId: string, rawUrl: string, actor: string): Promise<ExternalSite> {
  const agent = await getAgentRow(agentId)
  const url = await assertPublicUrl(rawUrl)
  let status: ExternalSite['status'] = 'unreachable'
  let latencyMs: number | null = null
  try {
    const res = await safeGet(url.toString())
    latencyMs = res.latencyMs
    const hasWidget = /\/widget\.js/.test(res.body) && new RegExp(`data-agent=["']${agentId}["']`).test(res.body)
    status = res.status < 400 && hasWidget ? 'connected' : res.status < 400 ? 'pending' : 'unreachable'
  } catch {
    status = 'unreachable'
  }
  const site = { url: url.toString().replace(/\/$/, ''), status, lastPingAt: new Date().toISOString(), latencyMs, allowedOrigins: [url.origin] }
  await db
    .insert(s.integrations)
    .values({ agentId, ...site })
    .onConflictDoUpdate({ target: s.integrations.agentId, set: { ...site, updatedAt: new Date().toISOString() } })
  await writeLog(agentId, status === 'connected' ? 'info' : 'warn', `site ${site.url} : ${status === 'connected' ? `widget détecté (${latencyMs} ms)` : status === 'pending' ? 'joignable, widget absent' : 'injoignable'}`)
  await audit(actor, 'user', 'a vérifié le site', `${agent.name} · ${site.url}`, { status })
  return site
}

/* ---------- Console → site events, through the widget's live channel ---------- */

const connected = new Map<string, number>()
export const widgetConnected = (agentId: string, delta: 1 | -1) => connected.set(agentId, Math.max(0, (connected.get(agentId) ?? 0) + delta))

/**
 * Sends an event to every open page running the agent's widget and waits for the first ack.
 * Acting on an external site is sensitive: allowed only if the agent was granted it.
 */
export async function sendToSite(agentId: string, event: string, actor: string) {
  const agent = await getAgentRow(agentId)
  const [site] = await db.select().from(s.integrations).where(eq(s.integrations.agentId, agentId))
  if (!site || site.status !== 'connected') throw conflict('Aucun site connecté à cet agent : vérifiez la connexion d’abord')
  const acting = !['ping', 'page.context'].includes(event)
  if (acting && !agent.permissions.allowedActions.includes('Agir sur le site externe'))
    throw conflict('Cet agent n’a pas l’action « Agir sur le site externe » : seuls ping et page.context sont permis')
  const eventId = newId('evt')
  const t0 = Date.now()
  const ack = new Promise<{ response: string }>((resolve, reject) => {
    const off = bus.subscribe(`site-ack:${eventId}`, (p) => {
      off()
      clearTimeout(timer)
      resolve(p as { response: string })
    })
    const timer = setTimeout(() => {
      off()
      reject(conflict('Aucune page ouverte avec le widget n’a répondu (5 s). Ouvrez le site puis réessayez.'))
    }, 5000)
  })
  bus.publish(`site:${agentId}`, { id: eventId, event, at: new Date().toISOString() })
  const { response } = await ack
  const latencyMs = Date.now() - t0
  await writeLog(agentId, 'info', `événement ${event} → site : ${response.slice(0, 120)} (${latencyMs} ms)`)
  await audit(actor, 'user', 'a envoyé un événement au site', `${agent.name} · ${event}`)
  return { ok: true, latencyMs, response: `200 OK · ${response}`.slice(0, 300) }
}
