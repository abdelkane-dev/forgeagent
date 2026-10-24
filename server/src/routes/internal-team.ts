import { asc, desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { db, schema as s } from '../db/client'
import { bus } from '../lib/bus'
import { notFound } from '../lib/errors'
import { route } from '../http/router'
import { CreateAgentRequest } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { queue } from '../queue'
import { assertGrantable } from '../services/agents'
import { ROLE_CAPABILITIES, type TeamRole } from '../team/types'
import { MODEL_FOR, startRequest, supervisorState, sweep, TEAM } from '../team/engine'

const ORDER: TeamRole[] = ['orchestrator', 'architect', 'security', 'builder', 'tester', 'supervisor']

export function internalTeamRoutes(app: Hono<AppEnv>) {
  route(app, { method: 'get', path: '/internal-team/agents', tag: 'Équipe interne', summary: 'Agents internes : statut, modèle, périmètre, consommation' }, async () => {
    const stats = await db
      .select({
        role: s.teamTasks.role,
        running: sql<number>`count(*) filter (where ${s.teamTasks.status} = 'running')::int`,
        queued: sql<number>`count(*) filter (where ${s.teamTasks.status} = 'queued')::int`,
        done: sql<number>`count(*) filter (where ${s.teamTasks.status} in ('done','vetoed'))::int`,
        failed: sql<number>`count(*) filter (where ${s.teamTasks.status} = 'failed')::int`,
        tokens: sql<number>`coalesce(sum(${s.teamTasks.tokens}),0)::int`,
        cost: sql<number>`coalesce(sum(${s.teamTasks.cost}),0)::float8`,
        last: sql<string | null>`max(coalesce(${s.teamTasks.finishedAt}, ${s.teamTasks.startedAt}, ${s.teamTasks.createdAt}))`,
      })
      .from(s.teamTasks)
      .groupBy(s.teamTasks.role)
    return ORDER.map((role) => {
      const st = stats.find((x) => x.role === role)
      return {
        role,
        label: TEAM[role].label,
        mission: TEAM[role].mission,
        model: MODEL_FOR[role](),
        capabilities: [...ROLE_CAPABILITIES[role]],
        status: (st?.running ?? 0) > 0 ? 'working' : (st?.queued ?? 0) > 0 ? 'queued' : 'idle',
        running: st?.running ?? 0,
        queued: st?.queued ?? 0,
        tasksDone: st?.done ?? 0,
        tasksFailed: st?.failed ?? 0,
        tokens: st?.tokens ?? 0,
        cost: Math.round((st?.cost ?? 0) * 10000) / 10000,
        lastActivityAt: role === 'supervisor' ? (supervisorState.lastSweepAt ?? st?.last ?? null) : (st?.last ?? null),
      }
    })
  })

  route(app, { method: 'get', path: '/internal-team/requests', tag: 'Équipe interne', summary: 'Demandes récentes', query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) }, async ({ query }) =>
    db.select().from(s.teamRequests).orderBy(desc(s.teamRequests.createdAt)).limit(query.limit),
  )

  route(app, { method: 'get', path: '/internal-team/requests/:id', tag: 'Équipe interne', summary: 'Rejouer une demande : tâches et événements dans l’ordre' }, async ({ params }) => {
    const [request] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, params.id))
    if (!request) throw notFound('Demande')
    const [tasks, events] = await Promise.all([
      db.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, params.id)).orderBy(asc(s.teamTasks.createdAt)),
      db.select().from(s.teamEvents).where(eq(s.teamEvents.requestId, params.id)).orderBy(asc(s.teamEvents.id)),
    ])
    return { request, tasks, events }
  })

  route(
    app,
    { method: 'post', path: '/internal-team/requests', tag: 'Équipe interne', summary: 'Demander à l’équipe de créer un agent (plafond de permissions fixé par l’utilisateur)', permission: 'agents.write', body: CreateAgentRequest, status: 201 },
    async ({ body, principal }) => {
      // The ceiling itself must be grantable by the requester: the team can never exceed the user.
      if (principal?.kind === 'user') assertGrantable(body.maxActions, [], principal.role)
      const id = await startRequest('create_agent', body, principal?.kind === 'user' ? principal.id : null)
      const [r] = await db.select().from(s.teamRequests).where(eq(s.teamRequests.id, id))
      return r
    },
  )

  route(app, { method: 'post', path: '/internal-team/sweep', tag: 'Équipe interne', summary: 'Lancer une ronde du Superviseur maintenant', permission: 'agents.write' }, async () => ({ requestId: await sweep() }))

  route(app, { method: 'get', path: '/internal-team/queue', tag: 'Équipe interne', summary: 'État des files de tâches' }, () => queue.stats())

  route(app, { method: 'get', path: '/internal-team/stream', tag: 'Équipe interne', summary: 'Progression en direct (SSE)' }, ({ c }) =>
    streamSSE(c, async (stream) => {
      const off = bus.subscribe('team', (e) => void stream.writeSSE({ data: JSON.stringify(e) }))
      stream.onAbort(off)
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(15_000)
      }
      off()
    }),
  )
}
