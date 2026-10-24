import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Agent, EvalCase, EvalRun, EvalSuite } from '@shared/types'
import { config } from '../config'
import { asAgent, schema as s, type Tx } from '../db/client'
import { audit } from '../lib/audit'
import { newId } from '../lib/crypto'
import { notFound } from '../lib/errors'
import { runAgent } from '../runtime/run-agent'
import { generateDoc } from './docs'

/**
 * Evaluation of ONE agent, in its test environment: suites of cases (input + expected keywords),
 * scores per version, and a regression gate run before every new version is published.
 */

export async function listSuites(tx: Tx, agentId: string): Promise<EvalSuite[]> {
  const suites = await tx.select().from(s.evalSuites).where(eq(s.evalSuites.agentId, agentId)).orderBy(asc(s.evalSuites.createdAt))
  const counts = await tx.select({ suiteId: s.evalCases.suiteId, n: sql<number>`count(*)::int` }).from(s.evalCases).where(eq(s.evalCases.agentId, agentId)).groupBy(s.evalCases.suiteId)
  const last = await tx.execute(sql`select distinct on (suite_id) suite_id, score, at from eval_runs where agent_id = ${agentId} order by suite_id, at desc`)
  const lastRows = (last as unknown as { rows: { suite_id: string; score: number; at: string }[] }).rows ?? (last as unknown as { suite_id: string; score: number; at: string }[])
  return suites.map((x) => {
    const l = lastRows.find((r) => r.suite_id === x.id)
    return { id: x.id, agentId, name: x.name, regression: x.regression, cases: counts.find((c) => c.suiteId === x.id)?.n ?? 0, lastScore: l?.score ?? null, lastRunAt: l ? new Date(l.at).toISOString() : null }
  })
}

export async function createSuite(tx: Tx, agentId: string, input: { name: string; regression: boolean; cases: { input: string; expect: string }[] }, actor: string) {
  const id = newId('evs')
  await tx.insert(s.evalSuites).values({ id, agentId, name: input.name, regression: input.regression })
  if (input.cases.length) await tx.insert(s.evalCases).values(input.cases.map((c) => ({ id: newId('evc'), agentId, suiteId: id, ...c })))
  await generateDoc(tx, agentId)
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a créé une suite d’évaluation', target: input.name })
  return id
}

export async function listCases(tx: Tx, agentId: string, suiteId: string): Promise<EvalCase[]> {
  return tx.select({ id: s.evalCases.id, suiteId: s.evalCases.suiteId, input: s.evalCases.input, expect: s.evalCases.expect }).from(s.evalCases).where(and(eq(s.evalCases.agentId, agentId), eq(s.evalCases.suiteId, suiteId)))
}

export async function addCase(tx: Tx, agentId: string, suiteId: string, c: { input: string; expect: string }) {
  const [suite] = await tx.select().from(s.evalSuites).where(and(eq(s.evalSuites.id, suiteId), eq(s.evalSuites.agentId, agentId)))
  if (!suite) throw notFound('Suite')
  const [row] = await tx.insert(s.evalCases).values({ id: newId('evc'), agentId, suiteId, ...c }).returning()
  return { id: row.id, suiteId, input: row.input, expect: row.expect }
}

export async function deleteSuite(tx: Tx, agentId: string, suiteId: string, actor: string) {
  const [x] = await tx.delete(s.evalSuites).where(and(eq(s.evalSuites.id, suiteId), eq(s.evalSuites.agentId, agentId))).returning()
  if (!x) throw notFound('Suite')
  await audit(tx, agentId, { actor, actorType: 'user', action: 'a supprimé une suite', target: x.name })
}

export async function listRuns(tx: Tx, agentId: string, suiteId?: string): Promise<EvalRun[]> {
  return (
    await tx
      .select()
      .from(s.evalRuns)
      .where(and(eq(s.evalRuns.agentId, agentId), suiteId ? eq(s.evalRuns.suiteId, suiteId) : undefined))
      .orderBy(desc(s.evalRuns.at))
      .limit(50)
  ).map((r) => ({ ...r }))
}

/** Expected keywords (comma separated) must all appear in the answer, case-insensitive. */
const passes = (output: string, expect: string, status: string) => {
  if (status === 'error') return false
  const words = expect.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
  const o = output.toLowerCase()
  return words.every((w) => o.includes(w))
}

/** Runs one suite in the test environment (optionally against an unpublished candidate configuration). */
export async function runSuite(agentId: string, suiteId: string, kind: EvalRun['kind'], opts: { candidate?: Agent; version?: number; actor?: string } = {}) {
  const { suite, cases, version } = await asAgent(agentId, async (tx) => {
    const [suite] = await tx.select().from(s.evalSuites).where(and(eq(s.evalSuites.id, suiteId), eq(s.evalSuites.agentId, agentId)))
    if (!suite) throw notFound('Suite')
    const [a] = await tx.select({ version: s.agents.version }).from(s.agents).where(eq(s.agents.id, agentId))
    return { suite, cases: await listCases(tx, agentId, suiteId), version: opts.version ?? a.version }
  })
  const results: EvalRun['results'] = []
  for (const c of cases.slice(0, 25)) {
    const r = await runAgent(agentId, c.input, { source: 'eval', sandbox: true, configOverride: opts.candidate }).catch((e: Error) => ({ status: 'error' as const, message: { content: e.message } }))
    results.push({ caseId: c.id, input: c.input, passed: passes(r.message.content, c.expect, r.status), output: r.message.content.slice(0, 400) })
  }
  const passed = results.filter((r) => r.passed).length
  const score = results.length ? Math.round((passed / results.length) * 100) : 0
  const id = newId('evr')
  await asAgent(agentId, async (tx) => {
    await tx.insert(s.evalRuns).values({ id, agentId, suiteId, version, kind, score, passed, total: results.length, results })
    await audit(tx, agentId, { actor: opts.actor ?? 'ForgeAgent', actorType: kind === 'team' ? 'team' : opts.actor ? 'user' : 'system', action: `évaluation ${kind}`, target: `${suite.name} : ${score} %`, result: score >= 50 ? 'ok' : 'error' })
  })
  return { id, agentId, suiteId, version, kind, score, passed, total: results.length, results, at: new Date().toISOString() } satisfies EvalRun
}

/**
 * Regression gate: every regression suite is replayed against the candidate configuration.
 * Refused when a score falls below the suite's latest score minus REGRESSION_TOLERANCE.
 */
export async function regressionGate(agentId: string, candidate: Agent, actor: string) {
  const { suites, baselines } = await asAgent(agentId, async (tx) => {
    const suites = (await listSuites(tx, agentId)).filter((x) => x.regression && x.cases > 0)
    const baselines = new Map<string, number>()
    for (const x of suites) {
      // Baseline = the latest score of this suite (normally measured on the current version).
      const [b] = await tx.select({ score: s.evalRuns.score }).from(s.evalRuns).where(eq(s.evalRuns.suiteId, x.id)).orderBy(desc(s.evalRuns.at)).limit(1)
      if (b) baselines.set(x.id, b.score)
    }
    return { suites, baselines }
  })
  if (!suites.length) return { ok: true, score: null as number | null, reports: [] as { suite: string; score: number; baseline: number | null }[] }
  const reports: { suite: string; score: number; baseline: number | null }[] = []
  for (const x of suites) {
    const run = await runSuite(agentId, x.id, 'regression', { candidate, version: candidate.version + 1, actor })
    reports.push({ suite: x.name, score: run.score, baseline: baselines.get(x.id) ?? null })
  }
  const ok = reports.every((r) => r.baseline == null || r.score >= r.baseline - config.REGRESSION_TOLERANCE)
  const score = Math.round(reports.reduce((n, r) => n + r.score, 0) / reports.length)
  return { ok, score, reports }
}
