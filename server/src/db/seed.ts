import { sql } from 'drizzle-orm'
import * as demo from '../../../src/api/mock/seed'
import { encryptFor, hashApiKey, hashPassword, newApiKey, randomToken } from '../lib/crypto'
import { costOf } from '../llm/types'
import { generateDoc } from '../services/docs'
import { indexDoc } from '../services/knowledge'
import { database, db, scoped, schema as s } from './client'
import { isEntry, runMigrations } from './migrate'

/**
 * Demo seed: the same data the front-end shows in demo mode (src/api/mock/seed.ts),
 * so both modes tell the same story. Bonaco Pro is the first project.
 *
 * Agent data goes through the same isolation as the app: each agent is created by its owner
 * (user context), then filled in that agent's own context. Idempotent: does nothing when the
 * database already holds users.
 */
export async function seed(opts: { password?: string; quiet?: boolean } = {}) {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(s.users)
  if (existing[0].n > 0) return { skipped: true as const }

  const password = opts.password ?? process.env.SEED_PASSWORD
  if (!password || password.length < 8) throw new Error('SEED_PASSWORD (8 caractères minimum) est requis pour créer les comptes de démo')
  const passwordHash = await hashPassword(password)

  /* ---------- Platform (no agent data) ---------- */
  await db.insert(s.users).values(demo.users.map((u) => ({ ...u, passwordHash })))
  await db.insert(s.projects).values(demo.projects.map((p) => ({ ...p, createdBy: 'usr_1' })))
  await db.insert(s.connectors).values(demo.connectors)
  await db.insert(s.skills).values(demo.skills.map((k) => ({ ...k, instructions: `Skill « ${k.name} » : ${k.description} Réponds en respectant ce périmètre.` })))
  await db.insert(s.templates).values(demo.templates)
  const { anthropicKeySet: _a, embeddings: _e, storage: _s, ...settings } = demo.platformSettings
  await db.insert(s.platformSettings).values({ id: 1, data: settings })

  const DAY = 86_400_000
  const printed: Record<string, string> = {}
  const toIndex: { agentId: string; docId: string; content: string }[] = []

  for (const a of demo.agents) {
    const owner = demo.memberships.find((m) => m.agentId === a.id && m.role === 'owner')!
    const { versions, metrics: _m, projectIds, skillIds, permissions, ...row } = a

    // 1. The owner creates and claims the agent (RLS: forge_agent_unclaimed).
    await scoped({ mode: 'user', userId: owner.userId }, async (tx) => {
      await tx.insert(s.agents).values({ ...row, allowedActions: permissions.allowedActions, createdBy: owner.userId })
      await tx.insert(s.agentMembers).values({ agentId: a.id, userId: owner.userId, role: 'owner', addedAt: owner.addedAt })
    })

    // 2. Everything else in this agent's own context.
    await scoped({ mode: 'platform', agentId: a.id, userId: owner.userId }, async (tx) => {
      const others = demo.memberships.filter((m) => m.agentId === a.id && m.role !== 'owner')
      if (others.length) await tx.insert(s.agentMembers).values(others)
      if (projectIds.length) await tx.insert(s.agentProjects).values(projectIds.map((projectId) => ({ agentId: a.id, projectId })))
      if (skillIds.length) await tx.insert(s.agentSkills).values(skillIds.map((skillId) => ({ agentId: a.id, skillId })))
      await tx.insert(s.agentVersions).values(
        versions.map((v) => ({ agentId: a.id, version: v.version, note: v.note, author: v.author, createdAt: v.createdAt, regressionScore: v.regressionScore ?? null, snapshot: { ...row, projectIds, skillIds, permissions } })),
      )

      const integrations = demo.integrations.filter((i) => i.agentId === a.id)
      if (integrations.length) await tx.insert(s.integrations).values(integrations)
      const secrets = demo.secrets.filter((x) => x.agentId === a.id)
      if (secrets.length) await tx.insert(s.agentSecrets).values(secrets.map((x) => ({ ...x, valueEnc: encryptFor(a.id, randomToken(18)) })))
      const hooks = demo.webhooks.filter((w) => w.agentId === a.id)
      if (hooks.length) await tx.insert(s.webhooks).values(hooks.map((w) => ({ ...w, secretEnc: encryptFor(a.id, randomToken(24)) })))

      // Runs: the demo traces, plus a 7-day history so the charts have real data.
      const traces = demo.traces.filter((t) => t.agentId === a.id)
      for (const t of traces) {
        const tokensIn = Math.round(t.tokens * 0.8)
        const tokensOut = t.tokens - tokensIn
        await tx.insert(s.runs).values({
          id: t.id,
          agentId: a.id,
          source: 'api',
          environment: t.environment,
          status: t.status === 'running' ? 'ok' : t.status,
          input: t.input,
          output: t.status === 'ok' ? 'Analyse terminée.' : null,
          error: t.status === 'error' ? 'TimeoutError' : null,
          tokensIn,
          tokensOut,
          cost: t.cost,
          durationMs: t.durationMs,
          version: a.version,
          startedAt: t.at,
        })
        await tx.insert(s.runSteps).values(t.spans.map((sp, idx) => ({ ...sp, id: `${t.id}_${sp.id}`, agentId: a.id, runId: t.id, idx })))
        await tx.insert(s.usageCosts).values({ agentId: a.id, at: t.at, source: 'run', environment: t.environment, model: a.model, tokensIn, tokensOut, cost: t.cost, refId: t.id })
      }
      const share = a.metrics.runs24h / demo.agents.reduce((n, x) => n + x.metrics.runs24h, 0)
      const history: (typeof s.runs.$inferInsert)[] = []
      if (a.status !== 'inactive')
        demo.runsByDay.forEach((d, i) => {
          const day = Date.now() - (demo.runsByDay.length - 1 - i) * DAY
          // One stored run per ~50 real runs keeps the seed light while preserving the shape of the curve.
          const n = Math.round((d.runs * share) / 50)
          const errs = Math.round((d.errors * share) / 50)
          for (let k = 0; k < n; k++)
            history.push({
              id: `hist_${a.id.slice(4)}_${i}_${k}`,
              agentId: a.id,
              source: 'trigger',
              environment: 'production',
              status: k < errs ? 'error' : 'ok',
              input: 'Vérification planifiée',
              tokensIn: 800,
              tokensOut: 200,
              cost: costOf(a.model, { input: 800, output: 200 }),
              durationMs: 1500 + ((k * 137) % 2000),
              version: a.version,
              startedAt: new Date(day - ((k * 997) % (DAY - 3_600_000)) - 3_600_000).toISOString(),
            })
        })
      for (let i = 0; i < history.length; i += 200) {
        const chunk = history.slice(i, i + 200)
        await tx.insert(s.runs).values(chunk)
        await tx
          .insert(s.usageCosts)
          .values(chunk.map((r) => ({ agentId: a.id, at: r.startedAt, source: 'run' as const, environment: 'production' as const, model: a.model, tokensIn: 800, tokensOut: 200, cost: r.cost ?? 0, refId: r.id })))
      }

      const logs = demo.logs.filter((l) => l.agentId === a.id)
      if (logs.length) await tx.insert(s.logs).values(logs.map(({ id: _id, traceId, ...l }) => ({ ...l, runId: traceId ?? null })))
      const approvals = demo.approvals.filter((x) => x.agentId === a.id)
      if (approvals.length) await tx.insert(s.approvals).values(approvals)
      const audit = demo.audit.filter((x) => x.agentId === a.id)
      if (audit.length) await tx.insert(s.auditLog).values(audit.map(({ id: _id, ...x }) => x))

      const suites = demo.evalSuites.filter((x) => x.agentId === a.id)
      if (suites.length) {
        await tx.insert(s.evalSuites).values(suites.map((x) => ({ id: x.id, agentId: a.id, name: x.name, regression: x.regression })))
        const ids = new Set(suites.map((x) => x.id))
        const cases = demo.evalCases.filter((c) => ids.has(c.suiteId))
        if (cases.length) await tx.insert(s.evalCases).values(cases.map((c) => ({ ...c, agentId: a.id })))
        const runs = demo.evalRuns.filter((r) => ids.has(r.suiteId))
        if (runs.length) await tx.insert(s.evalRuns).values(runs)
      }

      const docs = demo.knowledge.filter((k) => k.agentId === a.id)
      for (const { content, hasFile: _f, ...d } of docs) {
        await tx.insert(s.knowledgeDocs).values({ ...d, status: 'indexing', chunks: 0 })
        toIndex.push({ agentId: a.id, docId: d.id, content })
      }
      const mems = demo.memories.filter((m) => m.agentId === a.id)
      if (mems.length) await tx.insert(s.memories).values(mems)

      const wfs = demo.workflows.filter((w) => w.agentId === a.id)
      for (const w of wfs) {
        await tx.insert(s.workflows).values(w)
        await tx.insert(s.workflowVersions).values({ agentId: a.id, workflowId: w.id, version: w.version, definition: { name: w.name, trigger: w.trigger, nodes: w.nodes } })
      }

      // Real keys, one set per agent: printed once, stored hashed.
      for (const k of demo.apiKeys.filter((x) => x.agentId === a.id)) {
        const secret = newApiKey(k.scope === 'publishable' ? 'pub' : k.environment)
        printed[`${a.name} · ${k.name}`] = secret
        await tx.insert(s.apiKeys).values({ id: k.id, agentId: a.id, name: k.name, prefix: secret.slice(0, 12), keyHash: hashApiKey(secret), environment: k.environment, scope: k.scope, createdBy: owner.userId, createdAt: k.createdAt })
      }
      await generateDoc(tx, a.id)

      // Notifications go to the members of this agent.
      const notes = demo.notifications.filter((n) => n.agentId === a.id)
      for (const n of notes)
        for (const m of demo.memberships.filter((x) => x.agentId === a.id && x.role !== 'viewer'))
          await tx.insert(s.notifications).values({ ...n, id: `${n.id}_${m.userId}`, userId: m.userId })
    })
  }

  // Knowledge vectors (pgvector), written by the indexer in each agent's context.
  for (const d of toIndex) await indexDoc(d.agentId, d.docId, d.content)

  if (!opts.quiet) {
    console.log('\nComptes de démo (mot de passe = SEED_PASSWORD) :')
    demo.users.forEach((u) => console.log(`  ${u.email}  (${u.platformRole})`))
    console.log('\nClés API générées, une par agent (affichées une seule fois) :')
    Object.entries(printed).forEach(([n, k]) => console.log(`  ${n.padEnd(46)} ${k}`))
  }
  return { skipped: false as const, keys: printed }
}

if (isEntry(import.meta.url)) {
  runMigrations()
    .then(() => seed())
    .then(async (r) => {
      console.log(r.skipped ? 'Base déjà initialisée : seed ignoré.' : '\nSeed terminé.')
      await database.close()
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
