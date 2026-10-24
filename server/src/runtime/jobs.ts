import { eq } from 'drizzle-orm'
import { db, schema as s } from '../db/client'
import { logger } from '../lib/logger'
import { queue } from '../queue'
import { runAgent } from './run-agent'
import { safeGet } from './site'

/* ---------- Knowledge indexing ---------- */

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

async function indexDoc(docId: string) {
  const [doc] = await db.select().from(s.knowledgeDocs).where(eq(s.knowledgeDocs.id, docId))
  if (!doc) return
  try {
    let text = doc.content ?? ''
    if (doc.kind === 'website') {
      const res = await safeGet(doc.name, 10_000)
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`)
      text = stripHtml(res.body)
    } else if (!text) {
      throw new Error('Extraction non disponible pour ce format : importez du texte ou du Markdown')
    }
    const chunks = Math.max(1, Math.ceil(text.length / 1500))
    await db
      .update(s.knowledgeDocs)
      .set({ status: 'indexed', content: text.slice(0, 500_000), chunks, size: `${Math.max(1, Math.round(text.length / 1024))} Ko`, error: null })
      .where(eq(s.knowledgeDocs.id, docId))
  } catch (e) {
    await db.update(s.knowledgeDocs).set({ status: 'failed', error: (e as Error).message.slice(0, 300), size: '—' }).where(eq(s.knowledgeDocs.id, docId))
  }
}

/* ---------- Cron (5 fields, local time) ---------- */

function field(expr: string, value: number, min: number, max: number): boolean {
  return expr.split(',').some((part) => {
    const [range, stepStr] = part.split('/')
    const step = stepStr ? Number(stepStr) : 1
    let lo = min
    let hi = max
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number)
      lo = a
      hi = b ?? (stepStr ? max : a)
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || step < 1) return false
    return value >= lo && value <= hi && (value - lo) % step === 0
  })
}

export function cronMatches(cron: string, d: Date) {
  const f = cron.trim().split(/\s+/)
  if (f.length !== 5) return false
  const dow = d.getDay()
  return field(f[0], d.getMinutes(), 0, 59) && field(f[1], d.getHours(), 0, 23) && field(f[2], d.getDate(), 1, 31) && field(f[3], d.getMonth() + 1, 1, 12) && (field(f[4], dow, 0, 7) || (dow === 0 && field(f[4], 7, 0, 7)))
}

async function tick(at: Date) {
  const [schedules, agents] = await Promise.all([db.select().from(s.schedules).where(eq(s.schedules.enabled, true)), db.select().from(s.agents).where(eq(s.agents.status, 'active'))])
  const due = new Map<string, string>()
  for (const sc of schedules) if (cronMatches(sc.cron, at)) due.set(sc.agentId, sc.label)
  for (const a of agents) for (const t of a.triggers) if (t.enabled && t.kind === 'cron' && cronMatches(t.config, at)) due.set(a.id, t.label)
  for (const [agentId, label] of due) {
    if (!agents.some((a) => a.id === agentId)) continue
    // One job per agent and minute: several API processes never double-run a schedule.
    await queue.add('agents.run', 'scheduled', { agentId, input: `Déclenchement planifié : ${label}` }, { jobId: `cron:${agentId}:${Math.floor(at.getTime() / 60_000)}` })
  }
}

export function startBackgroundJobs() {
  queue.process('knowledge.index', async (d) => indexDoc(String(d.docId)), 2)
  queue.process(
    'agents.run',
    async (d) => {
      await runAgent(String(d.agentId), String(d.input), { source: 'trigger' }).catch((e) => logger.warn({ err: (e as Error).message, agentId: d.agentId }, 'scheduled run skipped'))
    },
    4,
  )
  queue.process('scheduler.tick', async () => tick(new Date()), 1)
  void queue.every('scheduler.tick', 'tick', 60_000)
}
