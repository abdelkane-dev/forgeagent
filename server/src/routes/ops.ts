import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { LogEntry, Overview, Trace } from '@shared/types'
import { db, schema as s } from '../db/client'
import { audit } from '../lib/audit'
import { bus } from '../lib/bus'
import { conflict, forbidden, notFound } from '../lib/errors'
import { can } from '../http/permissions'
import { route } from '../http/router'
import { IdSchema, SettingsPatch } from '../http/schemas'
import type { AppEnv, Principal } from '../http/types'
import { runAgent } from '../runtime/run-agent'
import { getSettings, updateSettings, writeLog } from '../services/settings'
import { resumeAfterApproval } from '../team/engine'
import { emitWebhook } from '../services/webhooks'

const who = (p: Principal | null) => (p?.kind === 'user' ? p.name : 'Système')
const DAY = 86_400_000
const toLog = (l: typeof s.logs.$inferSelect): LogEntry => ({ id: `log_${l.id}`, at: l.at, agentId: l.agentId, level: l.level, message: l.message, traceId: l.runId ?? undefined })

async function traces(where?: ReturnType<typeof eq>, limit = 100): Promise<Trace[]> {
  const rows = await db.select().from(s.runs).where(where).orderBy(desc(s.runs.startedAt)).limit(limit)
  if (!rows.length) return []
  const steps = await db.select().from(s.runSteps).where(inArray(s.runSteps.runId, rows.map((r) => r.id))).orderBy(asc(s.runSteps.idx))
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    at: r.startedAt,
    durationMs: r.durationMs,
    tokens: r.tokensIn + r.tokensOut,
    cost: r.cost,
    status: r.status === 'ok' ? 'ok' : r.status === 'running' ? 'running' : r.status === 'blocked' ? 'blocked' : 'error',
    input: r.input,
    spans: steps.filter((st) => st.runId === r.id).map((st) => ({ id: st.id, name: st.name, kind: st.kind, startMs: st.startMs, durationMs: st.durationMs, detail: st.detail ?? undefined })),
  }))
}

export function opsRoutes(app: Hono<AppEnv>) {
  route(app, { method: 'get', path: '/overview', tag: 'Observabilité', summary: 'Métriques du tableau de bord (24 h, 7 jours)' }, async (): Promise<Overview> => {
    const since = new Date(Date.now() - DAY).toISOString()
    const midnight = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const week = new Date(new Date().setHours(0, 0, 0, 0) - 6 * DAY).toISOString()
    const notSandbox = eq(s.runs.sandbox, false)
    const [[active], [day], [today], byDay] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(s.agents).where(eq(s.agents.status, 'active')),
      db
        .select({
          runs: sql<number>`count(*)::int`,
          ok: sql<number>`count(*) filter (where ${s.runs.status} = 'ok')::int`,
          p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${s.runs.durationMs}), 0)::int`,
        })
        .from(s.runs)
        .where(and(gte(s.runs.startedAt, since), notSandbox)),
      db.select({ cost: sql<number>`coalesce(sum(${s.runs.cost}), 0)::float8` }).from(s.runs).where(and(gte(s.runs.startedAt, midnight), notSandbox)),
      db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${s.runs.startedAt}), 'YYYY-MM-DD')`,
          runs: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${s.runs.status} = 'error')::int`,
        })
        .from(s.runs)
        .where(and(gte(s.runs.startedAt, week), notSandbox))
        .groupBy(sql`1`),
    ])
    const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
    const runsByDay = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(new Date().setHours(0, 0, 0, 0) - (6 - i) * DAY)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const hit = byDay.find((b) => b.day === key)
      return { day: fmt.format(d), runs: hit?.runs ?? 0, errors: hit?.errors ?? 0 }
    })
    return {
      activeAgents: active.n,
      runs24h: day.runs,
      costToday: Math.round(today.cost * 100) / 100,
      successRate: day.runs ? Math.round((day.ok / day.runs) * 1000) / 10 : 100,
      p50LatencyMs: day.p50,
      runsByDay,
    }
  })

  route(app, { method: 'get', path: '/traces', tag: 'Observabilité', summary: 'Traces d’exécution', query: z.object({ agentId: IdSchema.optional() }) }, ({ query }) =>
    traces(query.agentId ? eq(s.runs.agentId, query.agentId) : undefined),
  )

  route(app, { method: 'get', path: '/traces/:id', tag: 'Observabilité', summary: 'Une trace et ses étapes' }, async ({ params }) => {
    const [t] = await traces(eq(s.runs.id, params.id), 1)
    if (!t) throw notFound('Trace')
    return t
  })

  route(
    app,
    { method: 'get', path: '/logs', tag: 'Observabilité', summary: 'Dernières lignes de journal', query: z.object({ agentId: IdSchema.optional(), level: z.enum(['debug', 'info', 'warn', 'error']).optional() }) },
    async ({ query }) => {
      const rows = await db
        .select()
        .from(s.logs)
        .where(and(query.agentId ? eq(s.logs.agentId, query.agentId) : undefined, query.level ? eq(s.logs.level, query.level) : undefined))
        .orderBy(desc(s.logs.id))
        .limit(200)
      return rows.reverse().map(toLog)
    },
  )

  route(app, { method: 'get', path: '/logs/stream', tag: 'Observabilité', summary: 'Journal en direct (Server-Sent Events, un LogEntry JSON par message)', query: z.object({ agentId: IdSchema.optional() }) }, ({ c, query }) =>
    streamSSE(c, async (stream) => {
      const off = bus.subscribe('logs', (e) => {
        const entry = e as LogEntry
        if (!query.agentId || entry.agentId === query.agentId) void stream.writeSSE({ data: JSON.stringify(entry) })
      })
      stream.onAbort(off)
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(15_000)
      }
      off()
    }),
  )

  /* ---------- Approvals: only admins decide ---------- */
  route(app, { method: 'get', path: '/approvals', tag: 'Sécurité', summary: 'Validations humaines en attente' }, async () => {
    const rows = await db.select().from(s.approvals).where(eq(s.approvals.status, 'pending')).orderBy(desc(s.approvals.requestedAt))
    return rows.map((a) => ({ id: a.id, source: a.source, agentId: a.agentId ?? a.requestId ?? '', requestId: a.requestId ?? undefined, action: a.action, reason: a.reason, risk: a.risk, requestedAt: a.requestedAt }))
  })

  for (const decision of ['approve', 'reject'] as const) {
    route(app, { method: 'post', path: `/approvals/:id/${decision}`, tag: 'Sécurité', summary: decision === 'approve' ? 'Approuver une action' : 'Refuser une action', permission: 'approvals.resolve', status: 204 }, async ({ params, principal }) => {
      const [a] = await db.select().from(s.approvals).where(eq(s.approvals.id, params.id))
      if (!a) throw notFound('Validation')
      if (a.status !== 'pending') throw conflict('Cette validation a déjà été traitée')
      await db
        .update(s.approvals)
        .set({ status: decision === 'approve' ? 'approved' : 'rejected', resolvedBy: who(principal), resolvedAt: new Date().toISOString() })
        .where(eq(s.approvals.id, a.id))
      await audit(who(principal), 'user', decision === 'approve' ? 'a approuvé' : 'a refusé', a.action, { approvalId: a.id })
      if (a.source === 'team' && a.requestId) await resumeAfterApproval(a.requestId, decision === 'approve')
      else if (a.agentId) {
        await writeLog(a.agentId, 'info', `${a.action} : ${decision === 'approve' ? 'approuvée et exécutée' : 'refusée'} par ${who(principal)}`)
        void emitWebhook('approval.resolved', { approvalId: a.id, agentId: a.agentId, decision })
      }
    })
  }

  route(app, { method: 'get', path: '/audit', tag: 'Sécurité', summary: 'Journal d’audit (ajout seul)' }, async () =>
    (await db.select().from(s.auditLog).orderBy(desc(s.auditLog.id)).limit(500)).map((a) => ({ id: `aud_${a.id}`, at: a.at, actor: a.actor, action: a.action, target: a.target })),
  )

  /* ---------- Evals: replay up to 10 cases in the sandbox ---------- */
  route(app, { method: 'get', path: '/evals', tag: 'Évaluations', summary: 'Suites de tests' }, async () =>
    (await db.select().from(s.evals)).map(({ cases, ...e }) => ({ ...e, cases: cases.length })),
  )

  route(app, { method: 'post', path: '/evals/:id/run', tag: 'Évaluations', summary: 'Lancer une suite (10 cas au plus, en bac à sable)', permission: 'agents.run' }, async ({ params, principal }) => {
    const [e] = await db.select().from(s.evals).where(eq(s.evals.id, params.id))
    if (!e) throw notFound('Suite')
    const sample = e.cases.slice(0, 10)
    let ok = 0
    for (const tc of sample) {
      const r = await runAgent(e.agentId, tc.input, { source: 'eval', sandbox: true }).catch(() => null)
      if (r && r.status !== 'error') ok++
    }
    const lastScore = sample.length ? Math.round((ok / sample.length) * 100) : 0
    const [u] = await db.update(s.evals).set({ lastScore, lastRunAt: new Date().toISOString() }).where(eq(s.evals.id, e.id)).returning()
    await audit(who(principal), 'user', 'a lancé la suite', e.name, { score: lastScore })
    return { ...u, cases: u.cases.length }
  })

  /* ---------- Notifications ---------- */
  route(app, { method: 'get', path: '/notifications', tag: 'Notifications', summary: 'Notifications récentes' }, () => db.select().from(s.notifications).orderBy(desc(s.notifications.at)).limit(50))
  route(app, { method: 'post', path: '/notifications/:id/read', tag: 'Notifications', summary: 'Marquer comme lue', status: 204 }, async ({ params }) => {
    await db.update(s.notifications).set({ read: true }).where(eq(s.notifications.id, params.id))
  })
  route(app, { method: 'post', path: '/notifications/read-all', tag: 'Notifications', summary: 'Tout marquer comme lu', status: 204 }, async () => {
    await db.update(s.notifications).set({ read: true })
  })

  /* ---------- Settings: kill switch for editors, everything else admin ---------- */
  route(app, { method: 'get', path: '/settings', tag: 'Paramètres', summary: 'Paramètres de l’instance' }, () => getSettings())

  route(app, { method: 'patch', path: '/settings', tag: 'Paramètres', summary: 'Modifier les paramètres (arrêt d’urgence : éditeur ; reste : administrateur)', body: SettingsPatch }, async ({ body, principal }) => {
    if (principal?.kind !== 'user') throw forbidden()
    const onlyKill = Object.keys(body).every((k) => k === 'killSwitch')
    if (!can(principal.role, onlyKill ? 'killswitch' : 'settings.write')) throw forbidden()
    const before = await getSettings()
    const after = await updateSettings(body)
    if (body.killSwitch !== undefined && body.killSwitch !== before.killSwitch) await audit(principal.name, 'user', body.killSwitch ? 'a déclenché l’arrêt d’urgence' : 'a relancé les agents', 'Tous les agents')
    else await audit(principal.name, 'user', 'a modifié les paramètres', Object.keys(body).join(', '))
    return after
  })
}
