import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { UsageSummary } from '@shared/types'
import { schema as s, type Tx, serial } from '../db/client'
import { costOf } from '../llm/types'

type Source = 'run' | 'team' | 'eval' | 'workflow' | 'embedding'

/** Records tokens spent for ONE agent, whoever spent them (its runs, evals, workflows, the internal team). */
export async function recordUsage(
  tx: Tx,
  agentId: string,
  u: { source: Source; model: string; tokensIn: number; tokensOut: number; environment?: 'test' | 'production'; refId?: string; cost?: number },
) {
  const cost = u.cost ?? costOf(u.model, { input: u.tokensIn, output: u.tokensOut })
  await tx.insert(s.usageCosts).values({ agentId, source: u.source, model: u.model, tokensIn: u.tokensIn, tokensOut: u.tokensOut, cost, environment: u.environment ?? 'production', refId: u.refId })
  return cost
}

const startOfDay = () => new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
const startOfMonth = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

/** Spend of this agent in production (test environment runs are tracked but not budgeted). */
export async function spent(tx: Tx, agentId: string) {
  const [r] = await tx
    .select({
      today: sql<number>`coalesce(sum(${s.usageCosts.cost}) filter (where ${s.usageCosts.at} >= ${startOfDay()}), 0)::float8`,
      month: sql<number>`coalesce(sum(${s.usageCosts.cost}), 0)::float8`,
    })
    .from(s.usageCosts)
    .where(and(eq(s.usageCosts.agentId, agentId), gte(s.usageCosts.at, startOfMonth()), eq(s.usageCosts.environment, 'production')))
  return r
}

export async function usageSummary(tx: Tx, agentId: string): Promise<UsageSummary> {
  const [agent] = await tx.select({ cap: s.agents.costCapPerDay, budget: s.agents.monthlyBudget }).from(s.agents).where(eq(s.agents.id, agentId))
  const since30 = new Date(Date.now() - 29 * 86_400_000)
  since30.setHours(0, 0, 0, 0)
  const where = and(eq(s.usageCosts.agentId, agentId), gte(s.usageCosts.at, since30.toISOString()))
  const [totals, byModel, bySource, byDay, runs] = await serial([
    () => spent(tx, agentId),
    () => tx
      .select({ model: s.usageCosts.model, tokens: sql<number>`sum(${s.usageCosts.tokensIn} + ${s.usageCosts.tokensOut})::int`, cost: sql<number>`sum(${s.usageCosts.cost})::float8` })
      .from(s.usageCosts)
      .where(where)
      .groupBy(s.usageCosts.model)
      .orderBy(desc(sql`3`)),
    () => tx
      .select({ source: s.usageCosts.source, tokens: sql<number>`sum(${s.usageCosts.tokensIn} + ${s.usageCosts.tokensOut})::int`, cost: sql<number>`sum(${s.usageCosts.cost})::float8` })
      .from(s.usageCosts)
      .where(where)
      .groupBy(s.usageCosts.source),
    () => tx
      .select({
        day: sql<string>`to_char(date_trunc('day', ${s.usageCosts.at}), 'YYYY-MM-DD')`,
        cost: sql<number>`sum(${s.usageCosts.cost})::float8`,
        runs: sql<number>`count(*) filter (where ${s.usageCosts.source} = 'run')::int`,
      })
      .from(s.usageCosts)
      .where(where)
      .groupBy(sql`1`),
    () => tx
      .select({
        today: sql<number>`count(*) filter (where ${s.runs.startedAt} >= ${startOfDay()})::int`,
        month: sql<number>`count(*)::int`,
      })
      .from(s.runs)
      .where(and(eq(s.runs.agentId, agentId), gte(s.runs.startedAt, startOfMonth()), eq(s.runs.environment, 'production')))])
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(since30.getTime() + i * 86_400_000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const hit = byDay.find((b) => b.day === key)
    return { day: key, cost: Math.round((hit?.cost ?? 0) * 10000) / 10000, runs: hit?.runs ?? 0 }
  })
  const round = (n: number) => Math.round(n * 10000) / 10000
  return {
    agentId,
    today: round(totals.today),
    month: round(totals.month),
    budget: { daily: agent?.cap ?? 0, monthly: agent?.budget ?? 0 },
    runs: runs[0],
    avgCostPerRun: runs[0].month ? round(totals.month / runs[0].month) : 0,
    byModel: byModel.map((m) => ({ ...m, cost: round(m.cost) })),
    bySource: bySource.map((b) => ({ ...b, cost: round(b.cost) })),
    byDay: days,
  }
}
