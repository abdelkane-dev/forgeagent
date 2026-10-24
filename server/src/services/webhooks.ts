import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { asAgent, schema as s } from '../db/client'
import { decryptFor } from '../lib/crypto'
import { logger } from '../lib/logger'
import { queue } from '../queue'
import { assertPublicUrl } from '../runtime/site'

/**
 * Outgoing webhooks of ONE agent, signed with that agent's own secret:
 * X-Forge-Signature = sha256=HMAC(secret, timestamp.body). URLs are SSRF-checked on every send.
 */
export async function deliver(agentId: string, webhookId: string, event: string, payload: Record<string, unknown>) {
  const w = await asAgent(agentId, async (tx) => (await tx.select().from(s.webhooks).where(and(eq(s.webhooks.id, webhookId), eq(s.webhooks.agentId, agentId))))[0])
  if (!w) throw new Error('webhook introuvable')
  const url = await assertPublicUrl(w.url)
  const body = JSON.stringify({ event, agentId, at: new Date().toISOString(), data: payload })
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = createHmac('sha256', decryptFor(agentId, w.secretEnc)).update(`${ts}.${body}`).digest('hex')
  const t0 = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/json', 'x-forge-event': event, 'x-forge-timestamp': ts, 'x-forge-signature': `sha256=${sig}` },
    body,
  })
  return { status: res.status, latencyMs: Date.now() - t0 }
}

export async function emitWebhook(agentId: string, event: string, payload: Record<string, unknown>) {
  const hooks = await asAgent(agentId, (tx) => tx.select().from(s.webhooks).where(and(eq(s.webhooks.agentId, agentId), eq(s.webhooks.enabled, true))))
  for (const h of hooks.filter((h) => h.events.includes(event))) await queue.add('webhooks.deliver', 'deliver', { agentId, webhookId: h.id, event, payload }, { jobId: `agent:${agentId}:wh:${h.id}:${Date.now()}` })
}

export function startWebhookWorker() {
  queue.process(
    'webhooks.deliver',
    async (d) => {
      const r = await deliver(String(d.agentId), String(d.webhookId), String(d.event), d.payload as Record<string, unknown>)
      if (r.status >= 500) throw new Error(`webhook ${r.status}`)
    },
    4,
  )
  logger.debug('webhook worker started')
}
