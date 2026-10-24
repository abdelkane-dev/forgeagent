import { and, eq } from 'drizzle-orm'
import { asAgent, db, schema as s } from '../db/client'
import { logger } from '../lib/logger'
import { queue } from '../queue'
import { indexDoc } from '../services/knowledge'
import { startWorkflow, startWorkflowWorker } from '../services/workflows'
import { runAgent } from './run-agent'
import { sql } from 'drizzle-orm'

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

/** Ids of agents in given states (SECURITY DEFINER lookup: ids only, no data). */
export async function agentIds(states: string[]) {
  const r = await db.execute(sql`select forge_agent_ids(${sql.raw(`ARRAY[${states.map((x) => `'${x.replace(/[^a-z]/g, '')}'`).join(',')}]`)}) as id`)
  const rows = ((r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[])) as { id: string }[]
  return rows.map((x) => x.id)
}

/** Each agent is visited in its own context: one agent's schedule never reads another's. */
async function tick(at: Date) {
  const minute = Math.floor(at.getTime() / 60_000)
  for (const agentId of await agentIds(['active'])) {
    const { triggers, workflows } = await asAgent(agentId, async (tx) => ({
      triggers: (await tx.select({ triggers: s.agents.triggers }).from(s.agents).where(eq(s.agents.id, agentId)))[0]?.triggers ?? [],
      workflows: await tx.select().from(s.workflows).where(and(eq(s.workflows.agentId, agentId), eq(s.workflows.published, true))),
    }))
    for (const t of triggers)
      if (t.enabled && t.kind === 'cron' && cronMatches(t.config, at))
        await queue.add('agents.run', 'scheduled', { agentId, input: `Déclenchement planifié : ${t.label}` }, { jobId: `agent:${agentId}:cron:${t.id}:${minute}` })
    for (const w of workflows)
      if (w.trigger.kind === 'cron' && cronMatches(w.trigger.config, at)) await startWorkflow(agentId, w.id, 'cron', 'Déclenchement planifié', { test: false, actor: 'Planificateur' })
  }
}

export function startBackgroundJobs() {
  queue.process('knowledge.index', async (d) => indexDoc(String(d.agentId), String(d.docId), (d.content as string | null) ?? null), 2)
  queue.process(
    'agents.run',
    async (d) => {
      await runAgent(String(d.agentId), String(d.input), { source: 'trigger' }).catch((e) => logger.warn({ err: (e as Error).message, agentId: d.agentId }, 'scheduled run skipped'))
    },
    4,
  )
  startWorkflowWorker()
  queue.process('scheduler.tick', async () => tick(new Date()), 1)
  void queue.every('scheduler.tick', 'tick', 60_000)
}
