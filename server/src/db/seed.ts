import { sql } from 'drizzle-orm'
import * as demo from '../../../src/api/mock/seed'
import { encrypt, hashApiKey, hashPassword, newApiKey, randomToken } from '../lib/crypto'
import { database, db, schema as s } from './client'
import { isEntry, runMigrations } from './migrate'

/**
 * Demo seed: the same data the front-end shows in demo mode (src/api/mock/seed.ts),
 * so both modes tell the same story. Bonaco Pro is the first project.
 * Idempotent: does nothing when the database already holds users.
 */
export async function seed(opts: { password?: string; quiet?: boolean } = {}) {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(s.users)
  if (existing[0].n > 0) return { skipped: true as const }

  const password = opts.password ?? process.env.SEED_PASSWORD
  if (!password || password.length < 8) throw new Error('SEED_PASSWORD (8 caractères minimum) est requis pour créer les comptes de démo')
  const passwordHash = await hashPassword(password)

  await db.insert(s.users).values(
    demo.team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, passwordHash, lastActiveAt: m.lastActiveAt })),
  )
  await db.insert(s.projects).values(demo.projects.map((p) => ({ ...p })))
  await db.insert(s.connectors).values(demo.connectors.map((c) => ({ ...c, credentialsEnc: encrypt(JSON.stringify({ token: randomToken(16) })) })))
  await db.insert(s.skills).values(
    demo.skills.map(({ installs: _i, ...k }) => ({ ...k, instructions: `Skill « ${k.name} » : ${k.description} Réponds en respectant ce périmètre.` })),
  )

  for (const a of demo.agents) {
    const { versions, metrics: _m, externalSite, projectIds, skillIds, ...row } = a
    await db.insert(s.agents).values({ ...row, createdBy: 'usr_1' })
    if (projectIds.length) await db.insert(s.agentProjects).values(projectIds.map((projectId) => ({ agentId: a.id, projectId })))
    if (skillIds.length) await db.insert(s.agentSkills).values(skillIds.map((skillId) => ({ agentId: a.id, skillId })))
    await db.insert(s.agentVersions).values(
      versions.map((v) => ({ agentId: a.id, version: v.version, note: v.note, author: v.author, createdAt: v.createdAt, snapshot: { ...row, projectIds, skillIds } })),
    )
    if (externalSite) await db.insert(s.integrations).values({ agentId: a.id, ...externalSite })
  }

  // Runs: the demo traces, plus a 7-day history so the dashboard chart has real data.
  for (const t of demo.traces) {
    await db.insert(s.runs).values({
      id: t.id,
      agentId: t.agentId,
      source: 'api',
      status: t.status,
      input: t.input,
      output: t.status === 'ok' ? 'Analyse terminée.' : null,
      error: t.status === 'error' ? 'TimeoutError' : null,
      tokensIn: Math.round(t.tokens * 0.8),
      tokensOut: Math.round(t.tokens * 0.2),
      cost: t.cost,
      durationMs: t.durationMs,
      startedAt: t.at,
    })
    await db.insert(s.runSteps).values(t.spans.map((sp, idx) => ({ ...sp, id: `${t.id}_${sp.id}`, runId: t.id, idx })))
  }
  const DAY = 86_400_000
  const history: (typeof s.runs.$inferInsert)[] = []
  demo.runsByDay.forEach((d, i) => {
    const day = Date.now() - (demo.runsByDay.length - 1 - i) * DAY
    // One stored run per ~50 real runs keeps the seed light while preserving the shape of the curve.
    const n = Math.round(d.runs / 50)
    const errs = Math.max(1, Math.round(d.errors / 50))
    for (let k = 0; k < n; k++) {
      const agent = demo.agents[k % 3]
      history.push({
        id: `hist_${i}_${k}`,
        agentId: agent.id,
        source: 'trigger',
        status: k < errs ? 'error' : 'ok',
        input: 'Vérification planifiée',
        tokensIn: 800,
        tokensOut: 200,
        cost: 0.004,
        durationMs: 1500 + ((k * 137) % 2000),
        startedAt: new Date(day - ((k * 997) % (DAY - 3_600_000)) - 3_600_000).toISOString(),
      })
    }
  })
  for (let i = 0; i < history.length; i += 200) await db.insert(s.runs).values(history.slice(i, i + 200))

  await db.insert(s.logs).values(demo.logs.map(({ id: _id, traceId, ...l }) => ({ ...l, runId: traceId ?? null })))
  await db.insert(s.approvals).values(demo.approvals.map((a) => ({ ...a, source: 'agent' as const })))
  await db.insert(s.auditLog).values(demo.audit.map(({ id: _id, ...a }) => ({ ...a, actorType: a.actor === 'Système' ? ('system' as const) : a.actor.includes(' ') && demo.team.some((m) => m.name === a.actor) ? ('user' as const) : ('agent' as const) })))
  await db.insert(s.evals).values(
    demo.evals.map((e) => ({ ...e, cases: Array.from({ length: e.cases }, (_, i) => ({ input: `Cas ${i + 1}`, expect: 'ok' })) })),
  )
  await db.insert(s.knowledgeDocs).values(demo.knowledge)
  await db.insert(s.memories).values(demo.memories)
  await db.insert(s.templates).values(demo.templates)
  await db.insert(s.notifications).values(demo.notifications)
  await db.insert(s.workflows).values(demo.workflows)
  await db.insert(s.delegations).values(demo.delegations)
  await db.insert(s.schedules).values(demo.schedules)
  await db.insert(s.webhooks).values(demo.webhooks.map((w) => ({ ...w, secretEnc: encrypt(randomToken()) })))
  await db.insert(s.settings).values({ id: 1, data: { ...demo.settings, anthropicKeySet: !!process.env.ANTHROPIC_API_KEY } })

  // Real keys: printed once, stored hashed.
  const keys = [
    { name: 'Production · Bonaco Pro', env: 'live' as const, scope: 'secret' as const, kind: 'live' as const },
    { name: 'Widget · Bonaco Pro', env: 'live' as const, scope: 'publishable' as const, kind: 'pub' as const },
    { name: 'Tests locaux', env: 'test' as const, scope: 'secret' as const, kind: 'test' as const },
  ]
  const printed: Record<string, string> = {}
  for (const [i, k] of keys.entries()) {
    const secret = newApiKey(k.kind)
    printed[k.name] = secret
    await db.insert(s.apiKeys).values({
      id: `key_${i + 1}`,
      name: k.name,
      prefix: secret.slice(0, 12),
      keyHash: hashApiKey(secret),
      environment: k.env,
      scope: k.scope,
      projectId: 'prj_bonaco',
      createdBy: 'usr_1',
    })
  }
  if (!opts.quiet) {
    console.log('\nComptes de démo (mot de passe = SEED_PASSWORD) :')
    demo.team.forEach((m) => console.log(`  ${m.email}  (${m.role})`))
    console.log('\nClés API générées (affichées une seule fois) :')
    Object.entries(printed).forEach(([n, k]) => console.log(`  ${n.padEnd(26)} ${k}`))
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
