import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, schema as s } from '../db/client'
import { decrypt } from '../lib/crypto'
import { logger } from '../lib/logger'
import { queue } from '../queue'
import { assertPublicUrl } from '../runtime/site'

/**
 * Outgoing webhooks, signed: X-Forge-Signature = sha256=HMAC(secret, timestamp.body).
 * Delivery goes through the queue (retries with BullMQ); URLs are SSRF-checked on every send.
 */
export async function deliver(webhookId: string, event: string, payload: Record<string, unknown>) {
  const [w] = await db.select().from(s.webhooks).where(eq(s.webhooks.id, webhookId))
  if (!w) throw new Error('webhook introuvable')
  const url = await assertPublicUrl(w.url)
  const body = JSON.stringify({ event, at: new Date().toISOString(), data: payload })
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = createHmac('sha256', decrypt(w.secretEnc)).update(`${ts}.${body}`).digest('hex')
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

export async function emitWebhook(event: string, payload: Record<string, unknown>) {
  const hooks = await db.select().from(s.webhooks).where(eq(s.webhooks.enabled, true))
  for (const h of hooks.filter((h) => h.events.includes(event))) await queue.add('webhooks.deliver', 'deliver', { webhookId: h.id, event, payload })
}

export function startWebhookWorker() {
  queue.process(
    'webhooks.deliver',
    async (d) => {
      const r = await deliver(String(d.webhookId), String(d.event), d.payload as Record<string, unknown>)
      if (r.status >= 500) throw new Error(`webhook ${r.status}`)
    },
    4,
  )
  logger.debug('webhook worker started')
}
