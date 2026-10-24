import { asc, desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import type { TeamAgentInfo, TeamRequest } from '@shared/types'
import { config } from '../config'
import { scoped, schema as s, type Tx } from '../db/client'
import { bus } from '../lib/bus'
import { notFound } from '../lib/errors'
import { route, userCtx } from '../http/router'
import { CreateAgentRequest } from '../http/schemas'
import type { AppEnv } from '../http/types'
import { queue } from '../queue'
import { MODEL_FOR, startCreateRequest, startSuperviseRequest, supervisorState, sweep, teamChannel } from '../team/engine'
import { ROLE_CAPABILITIES, type TeamRole } from '../team/types'

const ORDER: TeamRole[] = ['orchestrator', 'architect', 'security', 'builder', 'tester', 'supervisor']

async function requestsOf(tx: Tx, where?: ReturnType<typeof eq>, limit = 30): Promise<TeamRequest[]> {
  const rows = await tx
    .select({ r: s.teamRequests, agentName: s.agents.name })
    .from(s.teamRequests)
    .innerJoin(s.agents, eq(s.agents.id, s.teamRequests.agentId))
    .where(where)
    .orderBy(desc(s.teamRequests.createdAt))
    .limit(limit)
  return rows.map(({ r, agentName }) => ({ ...r, agentName }))
}

async function replay(tx: Tx, requestId: string, agentId?: string) {
  const [request] = await requestsOf(tx, eq(s.teamRequests.id, requestId), 1)
  if (!request || (agentId && request.agentId !== agentId)) throw notFound('Demande')
  const [tasks, events] = await Promise.all([
    tx.select().from(s.teamTasks).where(eq(s.teamTasks.requestId, requestId)).orderBy(asc(s.teamTasks.createdAt)),
    tx.select().from(s.teamEvents).where(eq(s.teamEvents.requestId, requestId)).orderBy(asc(s.teamEvents.id)),
  ])
  return { request, tasks, events }
}

export function forgeRoutes(app: Hono<AppEnv>) {
  /** The team as the user sees it: activity and tokens on THEIR agents only (RLS). */
  route(app, { method: 'get', path: '/forge/agents', tag: 'La Forge', summary: 'Équipe interne : rôle, modèle, tâche en cours et tokens sur mes agents' }, ({ user }) =>
    scoped(userCtx(user!.id), async (tx): Promise<TeamAgentInfo[]> => {
      const stats = await tx
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
      const current = await tx
        .select({ role: s.teamTasks.role, requestId: s.teamTasks.requestId, agentId: s.teamTasks.agentId, agentName: s.agents.name, startedAt: s.teamTasks.startedAt })
        .from(s.teamTasks)
        .innerJoin(s.agents, eq(s.agents.id, s.teamTasks.agentId))
        .where(sql`${s.teamTasks.status} in ('running','queued')`)
        .orderBy(desc(s.teamTasks.createdAt))
      return ORDER.map((role) => {
        const st = stats.find((x) => x.role === role)
        const cur = current.find((x) => x.role === role)
        return {
          role,
          model: MODEL_FOR[role](),
          escalationModel: role === 'supervisor' ? config.MODEL_SUPERVISOR_ESCALATION : null,
          capabilities: [...ROLE_CAPABILITIES[role]],
          status: (st?.running ?? 0) > 0 ? 'working' : (st?.queued ?? 0) > 0 ? 'queued' : 'idle',
          currentTask: cur ? { requestId: cur.requestId, agentId: cur.agentId, agentName: cur.agentName, startedAt: cur.startedAt } : null,
          tasksDone: st?.done ?? 0,
          tasksFailed: st?.failed ?? 0,
          tokens: st?.tokens ?? 0,
          cost: Math.round((st?.cost ?? 0) * 10000) / 10000,
          lastActivityAt: role === 'supervisor' ? (supervisorState.lastSweepAt ?? st?.last ?? null) : (st?.last ?? null),
        }
      })
    }),
  )

  route(app, { method: 'get', path: '/forge/requests', tag: 'La Forge', summary: 'Demandes récentes sur mes agents', query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }) }, ({ user, query }) =>
    scoped(userCtx(user!.id), (tx) => requestsOf(tx, undefined, query.limit)),
  )

  route(app, { method: 'get', path: '/agents/:agentId/forge/requests', tag: 'La Forge', summary: 'Demandes de l’équipe sur cet agent', agent: 'viewer' }, ({ agent }) =>
    agent.tx((tx) => requestsOf(tx, eq(s.teamRequests.agentId, agent.id), 50)),
  )

  route(app, { method: 'get', path: '/agents/:agentId/forge/requests/:requestId', tag: 'La Forge', summary: 'Rejouer une demande : tâches et échanges dans l’ordre', agent: 'viewer' }, ({ agent, params }) =>
    agent.tx((tx) => replay(tx, params.requestId, agent.id)),
  )

  route(
    app,
    { method: 'post', path: '/forge/requests', tag: 'La Forge', summary: 'Forger un agent avec l’équipe (plafond de permissions fixé par le demandeur, qui devient propriétaire)', body: CreateAgentRequest, status: 201 },
    async ({ body, user }) => {
      const { agentId, requestId } = await startCreateRequest(body, { id: user!.id, name: user!.name })
      return scoped({ mode: 'user', userId: user!.id, agentId }, async (tx) => (await requestsOf(tx, eq(s.teamRequests.id, requestId), 1))[0])
    },
  )

  route(app, { method: 'post', path: '/agents/:agentId/forge/supervise', tag: 'La Forge', summary: 'Demander une ronde du Veilleur de Feu sur cet agent', agent: 'editor', status: 201 }, async ({ agent, user }) => ({
    requestId: await startSuperviseRequest(agent.id, user?.id ?? null),
  }))

  route(app, { method: 'post', path: '/forge/sweep', tag: 'La Forge', summary: 'Ronde de supervision sur tous les agents actifs (agent par agent)', platform: 'admin' }, async () => ({ requestIds: await sweep() }))

  route(app, { method: 'get', path: '/forge/queue', tag: 'La Forge', summary: 'État des files de tâches (compteurs seulement)', platform: 'admin' }, () => queue.stats())

  /** Live progress of the team on MY agents: one subscription per agent channel. */
  route(app, { method: 'get', path: '/forge/stream', tag: 'La Forge', summary: 'Progression en direct sur mes agents (SSE)' }, async ({ c, user }) => {
    const ids = await scoped(userCtx(user!.id), async (tx) => (await tx.select({ id: s.agents.id }).from(s.agents)).map((a) => a.id))
    return streamSSE(c, async (stream) => {
      const offs = ids.map((id) => bus.subscribe(teamChannel(id), (e) => void stream.writeSSE({ data: JSON.stringify({ agentId: id, ...(e as object) }) })))
      const off = () => offs.forEach((f) => f())
      stream.onAbort(off)
      while (!stream.aborted) {
        await stream.writeSSE({ event: 'ping', data: '' })
        await stream.sleep(15_000)
      }
      off()
    })
  })
}
