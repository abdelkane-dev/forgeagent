import { ApiError, type ForgeApi } from '../client'
import type {
  Agent,
  AgentDoc,
  AgentRole,
  AuditEntry,
  ChatMessage,
  CheckResult,
  EvalRun,
  ID,
  LogEntry,
  PlatformRole,
  TeamEvent,
  TeamRequest,
  TeamRole,
  TeamTask,
  UsageSummary,
  User,
  WorkflowRun,
} from '../types'
import * as seed from './seed'
import type { SeedAgent } from './seed'

/**
 * In-memory implementation of ForgeApi, with the server's isolation rules: an agent you are
 * not a member of is "introuvable", and each action needs the right role on THAT agent.
 * Latency is simulated so loading states are visible; set localStorage "fa:simulate-errors" = "1"
 * (Paramètres › Développeur) to make every call fail.
 */

const db = structuredClone({
  users: seed.users,
  agents: seed.agents,
  memberships: seed.memberships,
  projects: seed.projects,
  skills: seed.skills,
  connectors: seed.connectors,
  templates: seed.templates,
  traces: seed.traces,
  logs: seed.logs,
  approvals: seed.approvals,
  audit: seed.audit,
  evalSuites: seed.evalSuites,
  evalCases: seed.evalCases,
  evalRuns: seed.evalRuns,
  knowledge: seed.knowledge,
  memories: seed.memories,
  integrations: seed.integrations,
  secrets: seed.secrets,
  apiKeys: seed.apiKeys,
  webhooks: seed.webhooks,
  notifications: seed.notifications,
  workflows: seed.workflows,
  workflowRuns: [] as WorkflowRun[],
  platformSettings: seed.platformSettings,
  platformAudit: [] as { id: ID; at: string; actor: string; action: string; target: string }[],
})

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`
const nowIso = () => new Date().toISOString()
const clone = <T,>(v: T): T => structuredClone(v)

function shouldFail() {
  try {
    return localStorage.getItem('fa:simulate-errors') === '1'
  } catch {
    return false
  }
}

async function delay<T>(value: T | (() => T), ms = 220 + Math.random() * 280): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (shouldFail()) throw new ApiError('Le serveur ForgeAgent ne répond pas (erreur simulée).', 503)
  return clone(typeof value === 'function' ? (value as () => T)() : value)
}

/** Runs `fn` after the simulated latency, so validation errors surface like server errors. */
async function act<T>(fn: () => T, ms?: number): Promise<T> {
  await delay(undefined, ms)
  return clone(fn())
}

/* ---------- Who is looking ---------- */

const USER_KEY = 'fa:demo-user'
function loadUser(): User {
  let id = 'usr_1'
  try {
    id = sessionStorage.getItem(USER_KEY) ?? id
  } catch {
    /* storage blocked: default account */
  }
  const u = db.users.find((x) => x.id === id) ?? db.users[0]
  return { id: u.id, name: u.name, email: u.email, platformRole: u.platformRole }
}
let me = loadUser()

const RANK: Record<AgentRole, number> = { viewer: 0, editor: 1, owner: 2 }
const roleOn = (agentId: ID) => db.memberships.find((m) => m.agentId === agentId && m.userId === me.id)?.role ?? null

/** Same answer for unknown and foreign agents: existence never leaks. */
function scope(agentId: ID, min: AgentRole = 'viewer') {
  const a = db.agents.find((x) => x.id === agentId)
  const role = roleOn(agentId)
  if (!a || !role) throw new ApiError('Agent introuvable', 404)
  if (RANK[role] < RANK[min]) throw new ApiError('Rôle insuffisant sur cet agent', 403)
  return a
}
const asAgent = (a: SeedAgent): Agent => ({ ...a, myRole: roleOn(a.id)! })
const mine = () => db.agents.filter((a) => roleOn(a.id))
const myIds = () => new Set(mine().map((a) => a.id))
const own = <T extends { agentId: ID }>(list: T[], agentId: ID) => list.filter((x) => x.agentId === agentId)

function findIn<T extends { id: ID; agentId: ID }>(list: T[], agentId: ID, id: ID, what: string) {
  const item = list.find((x) => x.id === id && x.agentId === agentId)
  if (!item) throw new ApiError(`${what} introuvable`, 404)
  return item
}

function audit(agentId: ID, action: string, target: string, actorType: AuditEntry['actorType'] = 'user', result: AuditEntry['result'] = 'ok', actor = me.name) {
  db.audit.unshift({ id: uid('aud'), agentId, at: nowIso(), actor, actorType, action, target, result })
}
function platformAudit(action: string, target: string) {
  db.platformAudit.unshift({ id: uid('pla'), at: nowIso(), actor: me.name, action, target })
}
function notify(agentId: ID, title: string, body: string, href: string) {
  db.notifications.unshift({ id: uid('ntf'), agentId, title, body, href, read: false, at: nowIso() })
}
const requireAdmin = () => {
  if (me.platformRole !== 'admin') throw new ApiError('Réservé aux administrateurs de la plateforme', 403)
}

const keySecret = (kind: 'live' | 'test' | 'pub') =>
  `fa_${kind}_${Array.from({ length: 32 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 33)]).join('')}`

/* ---------- Agent helpers ---------- */

function snapshotVersion(a: SeedAgent, note: string, regressionScore: number | null = null) {
  a.version += 1
  a.versions.unshift({ version: a.version, createdAt: nowIso(), author: me.name, note, regressionScore })
}

function docOf(a: SeedAgent): AgentDoc {
  const integ = own(db.integrations, a.id)
  const suites = own(db.evalSuites, a.id)
  const markdown = [
    `# ${a.name}`,
    '',
    `> ${a.mission}`,
    '',
    `**Rôle** : ${a.role || '—'} · **Modèle** : ${a.model} · **Version** : ${a.version} · **État** : ${a.status}`,
    '',
    '## Actions autorisées',
    ...(a.permissions.allowedActions.length ? a.permissions.allowedActions.map((x) => `- ${x}`) : ['- Aucune']),
    '',
    '## Garde-fous',
    `- Injection de prompt : ${a.guardrails.promptInjection ? 'bloquée' : 'non filtrée'}`,
    `- Masquage des données personnelles : ${a.guardrails.piiMasking ? 'actif' : 'inactif'}`,
    `- Validation humaine : ${a.guardrails.humanApproval ? 'requise' : 'non requise'}`,
    `- Plafond : ${a.costCapPerDay} $ par jour, ${a.monthlyBudget} $ par mois`,
    '',
    '## Intégrations',
    ...(integ.length ? integ.map((i) => `- ${i.name} (${i.environment}) : ${i.url}`) : ['- Aucune']),
    '',
    '## Origines autorisées du widget',
    ...(a.allowedOrigins.length ? a.allowedOrigins.map((o) => `- ${o}`) : ['- Aucune']),
    '',
    '## Évaluations',
    ...(suites.length ? suites.map((x) => `- ${x.name} : ${x.cases} cas${x.regression ? ', rejouée avant chaque version' : ''}`) : ['- Aucune suite']),
    '',
    '## Appel API',
    '```bash',
    `curl -X POST $FORGE_URL/v1/agents/${a.id}/run \\`,
    '  -H "Authorization: Bearer $FORGE_KEY" -H "Content-Type: application/json" \\',
    `  -d '{"input":"Bonjour","environment":"test"}'`,
    '```',
  ].join('\n')
  return { agentId: a.id, version: a.version, markdown, generatedAt: nowIso() }
}

function reply(a: SeedAgent, input: string): ChatMessage {
  const injection = /ignore|oublie (tes|les) instructions|prompt système|system prompt/i.test(input)
  if (injection) return { role: 'agent', content: 'Demande bloquée par le garde-fou « injection de prompt ». Aucune action exécutée.', meta: { durationMs: 310, tokens: 220, cost: 0.0007 } }
  const kb = own(db.knowledge, a.id).find((d) => input.split(/\s+/).some((w) => w.length > 4 && d.content.toLowerCase().includes(w.toLowerCase())))
  const content = kb
    ? `D’après « ${kb.name} » : ${kb.content.split('\n')[0].slice(0, 220)}`
    : a.autonomy === 'suggest_only'
      ? `Analyse terminée. Je propose : ouvrir un ticket « ${input.slice(0, 48)} » et prévenir l’équipe. En attente de votre décision.`
      : 'Analyse terminée. Action préparée, elle attend une validation humaine avant exécution.'
  return {
    role: 'agent',
    content,
    toolCalls: a.tools.slice(0, 2).map((t) => ({
      name: `${t.connectorId.replace('mcp_', '')}.${t.access === 'read' ? 'query' : 'create'}`,
      args: JSON.stringify({ q: input.slice(0, 32), limit: 10 }),
      result: t.access === 'read' ? '10 lignes, 2 erreurs 500' : '{ "id": "TCK-2291", "status": "draft" }',
    })),
    meta: { durationMs: 900 + Math.round(Math.random() * 1200), tokens: 1200 + Math.round(Math.random() * 2400), cost: 0.004 },
  }
}

function recordRun(a: SeedAgent, input: string, msg: ChatMessage, environment: 'test' | 'production') {
  const id = uid('tr')
  db.traces.unshift({
    id,
    agentId: a.id,
    at: nowIso(),
    durationMs: msg.meta?.durationMs ?? 0,
    tokens: msg.meta?.tokens ?? 0,
    cost: msg.meta?.cost ?? 0,
    status: msg.content.startsWith('Demande bloquée') ? 'blocked' : 'ok',
    environment,
    input,
    spans: [
      { id: 's1', name: 'Déclencheur · console', kind: 'trigger', startMs: 0, durationMs: 30 },
      { id: 's2', name: `Modèle · ${a.model}`, kind: 'model', startMs: 30, durationMs: Math.round((msg.meta?.durationMs ?? 600) * 0.7) },
      { id: 's3', name: 'Sortie · réponse', kind: 'output', startMs: Math.round((msg.meta?.durationMs ?? 600) * 0.7) + 30, durationMs: 40 },
    ],
  })
  db.logs.push({ id: uid('log'), at: nowIso(), agentId: a.id, level: 'info', message: `exécution ${environment === 'test' ? 'de test' : ''} : ${input.slice(0, 80)}`, environment, traceId: id })
  return id
}

function usageOf(a: SeedAgent): UsageSummary {
  const share = a.metrics.runs24h / Math.max(1, seed.agents.reduce((n, x) => n + x.metrics.runs24h, 0))
  const month = Math.round(a.metrics.costToday * 17.5 * 100) / 100
  const tokens = a.metrics.tokens24h * 18
  const teamTasks = team.tasks.filter((t) => t.agentId === a.id)
  const teamCost = teamTasks.reduce((n, t) => n + t.cost, 0)
  return {
    agentId: a.id,
    today: a.metrics.costToday,
    month: month + teamCost,
    budget: { daily: a.costCapPerDay, monthly: a.monthlyBudget },
    runs: { today: a.metrics.runs24h, month: a.metrics.runs24h * 18 },
    avgCostPerRun: a.metrics.runs24h ? Math.round((a.metrics.costToday / a.metrics.runs24h) * 10000) / 10000 : 0,
    byModel: [{ model: a.model, tokens, cost: month }],
    bySource: [
      { source: 'run', cost: Math.round(month * 0.86 * 100) / 100, tokens: Math.round(tokens * 0.86) },
      { source: 'eval', cost: Math.round(month * 0.09 * 100) / 100, tokens: Math.round(tokens * 0.09) },
      { source: 'team', cost: Math.round((month * 0.05 + teamCost) * 100) / 100, tokens: Math.round(tokens * 0.05) + teamTasks.reduce((n, t) => n + t.tokens, 0) },
    ],
    byDay: seed.runsByDay.map((d) => ({ day: d.day, runs: Math.round(d.runs * share), cost: Math.round(d.runs * share * 0.0035 * 100) / 100 })),
  }
}

function runSuite(a: SeedAgent, suiteId: ID, kind: EvalRun['kind']): EvalRun {
  const suite = findIn(db.evalSuites, a.id, suiteId, 'Suite')
  const cases = db.evalCases.filter((c) => c.suiteId === suite.id)
  const results = cases.map((c) => {
    const out = reply(a, c.input).content
    const words = c.expect.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)
    return { caseId: c.id, input: c.input, passed: words.every((w) => out.toLowerCase().includes(w)), output: out.slice(0, 300) }
  })
  const passed = results.filter((r) => r.passed).length
  const score = results.length ? Math.round((passed / results.length) * 100) : 0
  const run: EvalRun = { id: uid('evr'), agentId: a.id, suiteId, version: a.version, kind, score, passed, total: results.length, at: nowIso(), results }
  db.evalRuns.unshift(run)
  Object.assign(suite, { lastScore: score, lastRunAt: run.at })
  audit(a.id, `évaluation ${kind}`, `${suite.name} : ${score} %`, kind === 'team' ? 'team' : 'user', score >= 50 ? 'ok' : 'error')
  return run
}

/* ---------- La Forge, simulated: a request walks through the roles on timers ---------- */

const TEAM_MODELS: Record<TeamRole, string> = {
  orchestrator: 'claude-opus-5-5',
  architect: 'claude-opus-5-5',
  security: 'claude-opus-5-5',
  builder: 'claude-sonnet-5-5',
  tester: 'claude-sonnet-5-5',
  supervisor: 'claude-haiku-5-5',
}
const TEAM_CAPS: Record<TeamRole, string[]> = {
  orchestrator: ['readRequest'],
  architect: ['readCatalog', 'readProject'],
  builder: ['readCatalog', 'configureAgentFromPlan'],
  security: ['readCatalog'],
  tester: ['runChecks', 'runSandbox', 'runEvaluation'],
  supervisor: ['readAgentHealth', 'readRecentErrors', 'notify'],
}
const team = { requests: [] as TeamRequest[], tasks: [] as TeamTask[], events: [] as TeamEvent[] }
let evtSeq = 1

function teamEvent(req: TeamRequest, fromRole: string, type: string, toRole: string | null = null, taskId: ID | null = null) {
  team.events.push({ id: evtSeq++, requestId: req.id, agentId: req.agentId, taskId, at: nowIso(), fromRole, toRole, type, payload: null })
  audit(req.agentId, `team.${type}`, req.id, fromRole === 'user' ? 'user' : 'team', 'ok', fromRole)
}

function nameFromBrief(brief: string) {
  if (/surveill|erreur|panne|latence/i.test(brief)) return 'Gardien de la forge'
  if (/fraude|spam|modér/i.test(brief)) return 'Sentinelle anti-abus'
  if (/rapport|résum|synth/i.test(brief)) return 'Rapporteur'
  return 'Agent forgé'
}

function simulateForge(req: TeamRequest, instant = false) {
  const flow: TeamRole[] = ['architect', 'security', 'builder', 'tester', 'supervisor']
  const input = req.input as { brief: string; maxActions: string[]; autonomyCeiling: Agent['autonomy'] }
  const steps: (() => void)[] = []
  let parent: ID | null = null
  for (const role of flow) {
    steps.push(() => {
      const base = { requestId: req.id, agentId: req.agentId, error: null, createdAt: nowIso(), startedAt: nowIso() }
      const orch: TeamTask = { ...base, id: uid('tsk'), parentId: parent, role: 'orchestrator', status: 'done', input: { allowedNext: [role] }, output: { next: role }, tokens: 180, cost: 0.0027, durationMs: 400, model: TEAM_MODELS.orchestrator, finishedAt: nowIso() }
      const task: TeamTask = { ...base, id: uid('tsk'), parentId: orch.id, role, status: 'running', input: {}, output: null, tokens: 0, cost: 0, durationMs: 0, model: TEAM_MODELS[role], finishedAt: null }
      team.tasks.push(orch, task)
      teamEvent(req, 'orchestrator', 'task.dispatched', role, task.id)
      teamEvent(req, role, 'task.started', null, task.id)
      req.steps += 2
      req.agentCalls += 1
      parent = task.id
    })
    steps.push(() => {
      const task = team.tasks.filter((t) => t.requestId === req.id && t.role === role).at(-1)!
      const a = db.agents.find((x) => x.id === req.agentId)
      let output: Record<string, unknown> = {}
      if (role === 'architect') output = { name: nameFromBrief(input.brief), allowedActions: input.maxActions, autonomy: input.autonomyCeiling }
      if (role === 'security') output = { verdict: 'approve', reasons: ['Moindre privilège respecté'], findings: [] }
      if (role === 'builder' && a) {
        Object.assign(a, { name: nameFromBrief(input.brief), role: 'Forgé par l’équipe', persona: 'Factuel, bref, cite toujours sa source.', autonomy: input.autonomyCeiling, permissions: { allowedActions: input.maxActions } })
        snapshotVersion(a, 'Construit par l’équipe interne')
        output = { agentId: a.id }
      }
      if (role === 'tester' && a) {
        const suiteId = uid('evs')
        db.evalSuites.push({ id: suiteId, agentId: a.id, name: 'Recette initiale', cases: 1, regression: true, lastScore: null, lastRunAt: null })
        db.evalCases.push({ id: uid('evc'), suiteId, input: 'Erreur 500 sur /api/invoices depuis 5 minutes', expect: '' })
        const run = runSuite(a, suiteId, 'team')
        a.status = run.score >= 50 ? 'validated' : 'error'
        output = { passed: run.score >= 50, evaluation: { score: run.score, passed: run.passed, total: run.total } }
      }
      if (role === 'supervisor') output = { watching: 1, anomalies: [] }
      Object.assign(task, { status: 'done', output, tokens: 900 + Math.round(Math.random() * 900), cost: 0.009, durationMs: 1200 + Math.round(Math.random() * 1500), finishedAt: nowIso() })
      req.tokens += task.tokens + 180
      req.cost += task.cost + 0.0027
      teamEvent(req, role, 'task.completed', 'orchestrator', task.id)
    })
  }
  steps.push(() => {
    Object.assign(req, { status: 'done', result: { agentId: req.agentId, testsPassed: true, anomalies: 0 }, finishedAt: nowIso() })
    teamEvent(req, 'orchestrator', 'request.done')
    notify(req.agentId, 'La Forge : agent forgé', 'Tests réussis', `/app/agents/${req.agentId}`)
  })
  if (instant) steps.forEach((f) => f())
  else steps.forEach((f, i) => setTimeout(f, 700 * (i + 1)))
}

function startForge(input: { brief: string; projectId: ID; maxActions: string[]; autonomyCeiling: Agent['autonomy'] }, instant = false) {
  const id = uid('agt')
  db.agents.unshift({
    ...clone(seed.agents[2]),
    id,
    name: 'Nouvel agent',
    mission: input.brief.slice(0, 500),
    role: 'En construction',
    status: 'starting',
    version: 1,
    versions: [{ version: 1, createdAt: nowIso(), author: me.name, note: 'Création par La Forge', regressionScore: null }],
    projectIds: [input.projectId],
    triggers: [],
    tools: [],
    skillIds: [],
    integrations: [],
    allowedOrigins: [],
    permissions: { allowedActions: [] },
    metrics: { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 0, tokens24h: 0 },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  db.memberships.push({ agentId: id, userId: me.id, role: 'owner', addedAt: nowIso() })
  const req: TeamRequest = { id: uid('req'), agentId: id, agentName: 'Nouvel agent', kind: 'create_agent', input, status: 'running', result: null, error: null, steps: 0, agentCalls: 0, tokens: 0, cost: 0, createdBy: me.id, createdAt: nowIso(), finishedAt: null }
  team.requests.unshift(req)
  teamEvent(req, 'user', 'request.created', 'orchestrator')
  simulateForge(req, instant)
  return req
}
// One finished forge in the history, owned by the demo admin.
startForge({ brief: 'Surveille les erreurs et la latence de Bonaco Pro et alerte l’équipe.', projectId: 'prj_bonaco', maxActions: ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte'], autonomyCeiling: 'act_after_approval' }, true)

const withName = (r: TeamRequest): TeamRequest => ({ ...r, agentName: db.agents.find((a) => a.id === r.agentId)?.name ?? r.agentName })

/* ---------- The API ---------- */

export const mockApi: ForgeApi = {
  auth: {
    me: () => delay(() => me, 60),
    login: (email) =>
      act(() => {
        const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
        if (!u) throw new ApiError('Email ou mot de passe incorrect', 401)
        try {
          sessionStorage.setItem(USER_KEY, u.id)
        } catch {
          /* storage blocked: session lasts for this tab only */
        }
        me = loadUser()
        if (me.id !== u.id) me = { id: u.id, name: u.name, email: u.email, platformRole: u.platformRole }
        return me
      }),
    signup: () => act(() => me),
    acceptInvite: () => act(() => me),
    resetRequest: () => delay(undefined),
    logout: () => delay(undefined, 60),
    // Demo mode has no OAuth app: the buttons explain how to enable them on a real back-end.
    providers: () => delay({ password: true, github: false, google: false, signup: 'open' as const }, 60),
    oauthUrl: () => '/login?error=' + encodeURIComponent('Mode démo : configurez GitHub ou Google sur le back-end'),
  },

  overview: {
    get: () =>
      delay(() => {
        const list = mine()
        const runs = list.reduce((n, a) => n + a.metrics.runs24h, 0)
        const share = runs / Math.max(1, seed.agents.reduce((n, a) => n + a.metrics.runs24h, 0))
        return {
          agents: list.length,
          activeAgents: list.filter((a) => a.status === 'active').length,
          runs24h: runs,
          costToday: Math.round(list.reduce((n, a) => n + a.metrics.costToday, 0) * 100) / 100,
          successRate: runs ? Math.round((list.reduce((n, a) => n + a.metrics.successRate * a.metrics.runs24h, 0) / runs) * 10) / 10 : 100,
          p50LatencyMs: list.length ? Math.round(list.reduce((n, a) => n + a.metrics.p50LatencyMs, 0) / list.length) : 0,
          pendingApprovals: db.approvals.filter((x) => myIds().has(x.agentId)).length,
          runsByDay: seed.runsByDay.map((d) => ({ day: d.day, runs: Math.round(d.runs * share), errors: Math.round(d.errors * share) })),
        }
      }),
  },

  approvals: {
    mine: () => delay(() => db.approvals.filter((x) => myIds().has(x.agentId))),
    list: (agentId) => act(() => (scope(agentId), own(db.approvals, agentId))),
    resolve: (agentId, id, decision) =>
      act(() => {
        const role = (scope(agentId, 'editor'), roleOn(agentId))
        const a = findIn(db.approvals, agentId, id, 'Validation')
        if (a.source === 'team' && role !== 'owner') throw new ApiError('Seul un propriétaire de l’agent peut trancher une demande de La Forge', 403)
        db.approvals = db.approvals.filter((x) => x.id !== id)
        audit(agentId, decision === 'approve' ? 'a approuvé' : 'a refusé', a.action)
      }),
  },

  agents: {
    list: () => delay(() => mine().map(asAgent)),
    get: (id) => act(() => asAgent(scope(id))),
    create: (draft) =>
      act(() => {
        const { members, ...rest } = draft
        const a: SeedAgent = {
          ...rest,
          id: uid('agt'),
          status: 'starting',
          version: 1,
          versions: [{ version: 1, createdAt: nowIso(), author: me.name, note: 'Création', regressionScore: null }],
          metrics: { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 0, tokens24h: 0 },
          createdAt: nowIso(),
          updatedAt: nowIso(),
        }
        db.agents.unshift(a)
        db.memberships.push({ agentId: a.id, userId: me.id, role: 'owner', addedAt: nowIso() })
        for (const m of members ?? []) {
          const u = db.users.find((x) => x.email === m.email)
          if (u && u.id !== me.id) db.memberships.push({ agentId: a.id, userId: u.id, role: m.role === 'owner' ? 'editor' : m.role, addedAt: nowIso() })
        }
        audit(a.id, 'a créé l’agent', a.name)
        return asAgent(a)
      }),
    update: (id, patch, note) =>
      act(() => {
        const a = scope(id, 'editor')
        const sensitive = ['Écrire en base de données', 'Redémarrer un service', 'Suspendre un compte', 'Envoyer un email externe', 'Agir sur le site externe']
        const added = (patch.permissions?.allowedActions ?? []).filter((x) => !a.permissions.allowedActions.includes(x))
        if (roleOn(id) !== 'owner' && added.some((x) => sensitive.includes(x))) throw new ApiError('Seul un propriétaire peut accorder une action sensible', 403)
        const { members: _m, ...fields } = patch
        Object.assign(a, fields, { updatedAt: nowIso() })
        if (note) {
          // Regression gate: every regression suite is replayed on the candidate first.
          const suites = own(db.evalSuites, id).filter((x) => x.regression && x.cases > 0)
          const scores = suites.map((x) => runSuite(a, x.id, 'regression').score)
          const score = scores.length ? Math.round(scores.reduce((n, x) => n + x, 0) / scores.length) : null
          snapshotVersion(a, note, score)
        }
        audit(id, note ? `a publié la v${a.version}` : 'a modifié la configuration', note ?? Object.keys(fields).join(', '))
        return asAgent(a)
      }),
    setStatus: (id, status) =>
      act(() => {
        const a = scope(id, 'editor')
        a.status = status
        audit(id, `a changé l’état en ${status}`, a.name)
        return asAgent(a)
      }),
    restoreVersion: (id, version) =>
      act(() => {
        const a = scope(id, 'editor')
        snapshotVersion(a, `Restauration de la v${version}`)
        audit(id, 'a restauré une version', `v${version}`)
        return asAgent(a)
      }),
    duplicate: (id) =>
      act(() => {
        const src = scope(id, 'editor')
        const a: SeedAgent = { ...clone(src), id: uid('agt'), name: `${src.name} (copie)`, status: 'inactive', version: 1, versions: [{ version: 1, createdAt: nowIso(), author: me.name, note: `Copie de ${src.name}`, regressionScore: null }], createdAt: nowIso(), updatedAt: nowIso() }
        db.agents.unshift(a)
        db.memberships.push({ agentId: a.id, userId: me.id, role: 'owner', addedAt: nowIso() })
        audit(a.id, 'a créé l’agent par copie', src.name)
        return asAgent(a)
      }),
    exportData: (id) =>
      act(() => {
        scope(id, 'owner')
        return {
          exportedAt: nowIso(),
          format: 'forgeagent.agent-export.v1',
          agent: db.agents.find((a) => a.id === id),
          members: db.memberships.filter((m) => m.agentId === id),
          knowledge: own(db.knowledge, id),
          memories: own(db.memories, id),
          audit: own(db.audit, id),
          evalSuites: own(db.evalSuites, id),
          workflows: own(db.workflows, id),
          secrets: own(db.secrets, id).map((x) => ({ name: x.name, value: '[non exporté]' })),
        } as Record<string, unknown>
      }),
    remove: (id) =>
      act(() => {
        const a = scope(id, 'owner')
        const drop = <T extends { agentId: ID }>(list: T[]) => list.filter((x) => x.agentId !== id)
        db.agents = db.agents.filter((x) => x.id !== id)
        db.memberships = drop(db.memberships)
        Object.assign(db, {
          traces: drop(db.traces),
          logs: drop(db.logs),
          approvals: drop(db.approvals),
          audit: drop(db.audit),
          evalSuites: drop(db.evalSuites),
          evalRuns: drop(db.evalRuns),
          knowledge: drop(db.knowledge),
          memories: drop(db.memories),
          integrations: drop(db.integrations),
          secrets: drop(db.secrets),
          apiKeys: drop(db.apiKeys),
          webhooks: drop(db.webhooks),
          workflows: drop(db.workflows),
          workflowRuns: drop(db.workflowRuns),
        })
        db.notifications = db.notifications.filter((n) => n.agentId !== id)
        platformAudit('a supprimé et purgé un agent', `${a.name} (${id})`)
      }),
  },

  runtime: {
    send: (agentId, input, _history, environment = 'test') =>
      act(() => {
        const a = scope(agentId)
        if (environment === 'production' && roleOn(agentId) === 'viewer') throw new ApiError('Un lecteur ne peut exécuter l’agent qu’en environnement de test', 403)
        if (db.platformSettings.killSwitch) throw new ApiError('Arrêt d’urgence actif : aucune exécution', 409)
        if (environment === 'production' && a.status === 'inactive') throw new ApiError('Agent inactif : activez-le pour l’exécuter en production', 409)
        const msg = reply(a, input)
        const runId = recordRun(a, input, msg, environment)
        return { ...msg, runId, status: msg.content.startsWith('Demande bloquée') ? 'blocked' : 'ok' }
      }, 900 + Math.random() * 600),
    checks: (agentId) =>
      act((): CheckResult[] => {
        const a = scope(agentId)
        const site = own(db.integrations, agentId)
        return [
          { id: 'model', label: 'Clé Anthropic et modèle', status: db.platformSettings.anthropicKeySet ? 'ok' : 'warn', detail: db.platformSettings.anthropicKeySet ? a.model : `${a.model} · mode simulé` },
          { id: 'mcp', label: 'Connexion aux outils (MCP)', status: a.tools.every((t) => db.connectors.find((c) => c.id === t.connectorId)?.enabled) ? 'ok' : 'warn', detail: `${a.tools.length} connecteur(s)` },
          { id: 'perm', label: 'Permissions', status: a.permissions.allowedActions.length ? 'ok' : 'warn', detail: `${a.permissions.allowedActions.length} action(s) autorisée(s)` },
          { id: 'guard', label: 'Garde-fous', status: a.guardrails.promptInjection ? 'ok' : 'warn', detail: a.guardrails.humanApproval ? 'Validation humaine active' : 'Sans validation humaine' },
          { id: 'kb', label: 'Connaissances', status: own(db.knowledge, agentId).length ? 'ok' : 'warn', detail: `${own(db.knowledge, agentId).length} source(s) indexée(s)` },
          { id: 'site', label: 'Intégrations', status: site.some((s) => s.status === 'connected') ? 'ok' : site.length ? 'fail' : 'warn', detail: site[0]?.url ?? 'Aucune intégration' },
          { id: 'cap', label: 'Budget', status: a.metrics.costToday < a.costCapPerDay * 0.8 ? 'ok' : 'warn', detail: `${a.metrics.costToday.toFixed(2)} $ / ${a.costCapPerDay} $ aujourd’hui` },
        ]
      }, 1100),
  },

  members: {
    list: (agentId) =>
      act(() => {
        scope(agentId)
        return db.memberships
          .filter((m) => m.agentId === agentId)
          .map((m) => {
            const u = db.users.find((x) => x.id === m.userId)!
            return { userId: u.id, name: u.name, email: u.email, role: m.role, addedAt: m.addedAt }
          })
      }),
    add: (agentId, email, role) =>
      act(() => {
        scope(agentId, 'owner')
        if (role === 'owner') throw new ApiError('Un nouveau membre ne peut pas être propriétaire directement : changez son rôle ensuite', 400)
        let u = db.users.find((x) => x.email.toLowerCase() === email.toLowerCase())
        let inviteUrl: string | undefined
        if (!u) {
          u = { id: uid('usr'), name: email.split('@')[0], email, platformRole: 'member', lastActiveAt: nowIso() }
          db.users.push(u)
          inviteUrl = `${location.origin}/login?invite=${uid('inv')}&email=${encodeURIComponent(email)}`
        }
        if (db.memberships.some((m) => m.agentId === agentId && m.userId === u.id)) throw new ApiError('Cette personne est déjà membre de l’agent', 409)
        const m = { agentId, userId: u.id, role, addedAt: nowIso() }
        db.memberships.push(m)
        audit(agentId, `a ajouté un membre (${role})`, email)
        return { member: { userId: u.id, name: u.name, email: u.email, role, addedAt: m.addedAt, invited: !!inviteUrl }, inviteUrl }
      }),
    setRole: (agentId, userId, role) =>
      act(() => {
        scope(agentId, 'owner')
        const m = db.memberships.find((x) => x.agentId === agentId && x.userId === userId)
        if (!m) throw new ApiError('Membre introuvable', 404)
        if (m.role === 'owner' && role !== 'owner' && db.memberships.filter((x) => x.agentId === agentId && x.role === 'owner').length < 2) throw new ApiError('Il doit rester au moins un propriétaire', 409)
        m.role = role
        audit(agentId, `a changé un rôle (${role})`, userId)
      }),
    remove: (agentId, userId) =>
      act(() => {
        scope(agentId, 'owner')
        const m = db.memberships.find((x) => x.agentId === agentId && x.userId === userId)
        if (!m) throw new ApiError('Membre introuvable', 404)
        if (m.role === 'owner' && db.memberships.filter((x) => x.agentId === agentId && x.role === 'owner').length < 2) throw new ApiError('Il doit rester au moins un propriétaire', 409)
        db.memberships = db.memberships.filter((x) => x !== m)
        audit(agentId, 'a retiré un membre', userId)
      }),
  },

  keys: {
    list: (agentId) => act(() => (scope(agentId), own(db.apiKeys, agentId))),
    create: (agentId, name, environment, keyScope) =>
      act(() => {
        scope(agentId, 'owner')
        const secret = keySecret(keyScope === 'publishable' ? 'pub' : environment)
        const key = { id: uid('key'), agentId, name, prefix: secret.slice(0, 12), environment, scope: keyScope, createdAt: nowIso(), lastUsedAt: null }
        db.apiKeys.unshift(key)
        audit(agentId, `a créé une clé ${keyScope === 'publishable' ? 'publiable' : 'secrète'}`, name)
        return { key, secret }
      }),
    rotate: (agentId, keyId) =>
      act(() => {
        scope(agentId, 'owner')
        const k = findIn(db.apiKeys, agentId, keyId, 'Clé')
        const secret = keySecret(k.scope === 'publishable' ? 'pub' : k.environment)
        Object.assign(k, { prefix: secret.slice(0, 12), createdAt: nowIso(), lastUsedAt: null })
        audit(agentId, 'a régénéré une clé', k.name)
        return { key: k, secret }
      }),
    revoke: (agentId, keyId) =>
      act(() => {
        scope(agentId, 'owner')
        const k = findIn(db.apiKeys, agentId, keyId, 'Clé')
        db.apiKeys = db.apiKeys.filter((x) => x !== k)
        audit(agentId, 'a révoqué une clé', k.name)
      }),
  },

  secrets: {
    list: (agentId) => act(() => (scope(agentId), own(db.secrets, agentId))),
    put: (agentId, name, _value) =>
      act(() => {
        scope(agentId, 'owner')
        if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(name)) throw new ApiError('nom en MAJUSCULES_AVEC_TIRETS_BAS', 400)
        let x = db.secrets.find((s) => s.agentId === agentId && s.name === name)
        if (!x) db.secrets.push((x = { id: uid('sec'), agentId, name, createdAt: nowIso(), lastUsedAt: null }))
        else x.createdAt = nowIso()
        audit(agentId, 'a enregistré un secret', name)
        return x
      }),
    remove: (agentId, name) =>
      act(() => {
        scope(agentId, 'owner')
        db.secrets = db.secrets.filter((s) => !(s.agentId === agentId && s.name === name))
        audit(agentId, 'a supprimé un secret', name)
      }),
  },

  integrations: {
    list: (agentId) => act(() => (scope(agentId), own(db.integrations, agentId))),
    create: (agentId, input) =>
      act(() => {
        const a = scope(agentId, 'editor')
        let origin: string
        try {
          origin = new URL(input.url).origin
        } catch {
          throw new ApiError('URL invalide', 400)
        }
        const i = { id: uid('int'), agentId, ...input, secretName: input.secretName ?? null, status: 'pending' as const, lastCheckAt: null, latencyMs: null }
        db.integrations.push(i)
        if (!a.allowedOrigins.includes(origin)) a.allowedOrigins.push(origin)
        audit(agentId, 'a ajouté une intégration', `${input.name} · ${input.url}`)
        return i
      }),
    remove: (agentId, id) =>
      act(() => {
        scope(agentId, 'editor')
        const i = findIn(db.integrations, agentId, id, 'Intégration')
        db.integrations = db.integrations.filter((x) => x !== i)
        audit(agentId, 'a supprimé une intégration', i.name)
      }),
    check: (agentId, id) =>
      act(() => {
        scope(agentId, 'editor')
        const i = findIn(db.integrations, agentId, id, 'Intégration')
        Object.assign(i, { status: i.url.includes('bonaco.pro') ? 'connected' : 'pending', lastCheckAt: nowIso(), latencyMs: 60 + Math.round(Math.random() * 120) })
        audit(agentId, 'a vérifié une intégration', i.url, 'user', i.status === 'connected' ? 'ok' : 'error')
        return i
      }, 900),
    sendEvent: (agentId, event) =>
      act(() => {
        const a = scope(agentId, 'editor')
        if (!own(db.integrations, agentId).some((i) => i.status === 'connected')) throw new ApiError('Aucun site connecté à cet agent : vérifiez une intégration d’abord', 409)
        if (!['ping', 'page.context'].includes(event) && !a.permissions.allowedActions.includes('Agir sur le site externe'))
          throw new ApiError('Cet agent n’a pas l’action « Agir sur le site externe » : seuls ping et page.context sont permis', 409)
        audit(agentId, 'a envoyé un événement au site', event)
        return { ok: true, latencyMs: 70 + Math.round(Math.random() * 60), response: event === 'ping' ? 'pong' : 'reçu par le widget' }
      }, 700),
  },

  webhooks: {
    list: (agentId) => act(() => (scope(agentId), own(db.webhooks, agentId))),
    create: (agentId, url, events) =>
      act(() => {
        scope(agentId, 'owner')
        const w = { id: uid('wh'), agentId, url, events, enabled: true }
        db.webhooks.push(w)
        audit(agentId, 'a ajouté un webhook', url)
        return { ...w, signingSecret: keySecret('live').replace('fa_live_', 'whsec_') }
      }),
    remove: (agentId, id) =>
      act(() => {
        scope(agentId, 'owner')
        const w = findIn(db.webhooks, agentId, id, 'Webhook')
        db.webhooks = db.webhooks.filter((x) => x !== w)
        audit(agentId, 'a supprimé un webhook', w.url)
      }),
    test: (agentId, id) => act(() => (scope(agentId, 'editor'), findIn(db.webhooks, agentId, id, 'Webhook'), { status: 200, latencyMs: 140 }), 600),
  },

  knowledge: {
    list: (agentId) => act(() => (scope(agentId), own(db.knowledge, agentId).map(({ content: _c, ...d }) => d))),
    add: (agentId, input) =>
      act(() => {
        scope(agentId, 'editor')
        const text = input.content ?? (input.file ? atob(input.file) : '')
        const doc = { id: uid('kb'), agentId, name: input.name, kind: input.kind, size: `${Math.max(1, Math.round(text.length / 1024))} Ko`, status: 'indexing' as const, chunks: 0, hasFile: !!input.file, createdAt: nowIso(), content: text }
        db.knowledge.push(doc)
        setTimeout(() => Object.assign(doc, { status: 'indexed', chunks: Math.max(1, Math.ceil(text.length / 800)) }), 1500)
        audit(agentId, 'a ajouté une source', input.name)
        const { content: _c, ...rest } = doc
        return rest
      }),
    remove: (agentId, id) =>
      act(() => {
        scope(agentId, 'editor')
        const d = findIn(db.knowledge, agentId, id, 'Source')
        db.knowledge = db.knowledge.filter((x) => x !== d)
        audit(agentId, 'a retiré une source', d.name)
      }),
    search: (agentId, q) =>
      act(() => {
        scope(agentId)
        const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2)
        return own(db.knowledge, agentId)
          .flatMap((d) => d.content.split(/\n+/).filter(Boolean).map((chunk) => ({ docId: d.id, docName: d.name, chunk, score: words.filter((w) => chunk.toLowerCase().includes(w)).length / Math.max(1, words.length) })))
          .filter((h) => h.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((h) => ({ ...h, score: Math.round(h.score * 100) / 100 }))
      }),
  },

  memories: {
    list: (agentId) => act(() => (scope(agentId), own(db.memories, agentId))),
    add: (agentId, text) =>
      act(() => {
        scope(agentId, 'editor')
        const m = { id: uid('mem'), agentId, kind: 'long' as const, text, createdAt: nowIso() }
        db.memories.unshift(m)
        audit(agentId, 'a ajouté un souvenir', text.slice(0, 80))
        return m
      }),
    remove: (agentId, id) =>
      act(() => {
        scope(agentId, 'editor')
        findIn(db.memories, agentId, id, 'Souvenir')
        db.memories = db.memories.filter((m) => m.id !== id)
        audit(agentId, 'a oublié un souvenir', '1 élément')
      }),
    clear: (agentId) =>
      act(() => {
        scope(agentId, 'editor')
        const n = own(db.memories, agentId).length
        db.memories = db.memories.filter((m) => m.agentId !== agentId)
        audit(agentId, 'a effacé la mémoire', `${n} élément(s)`)
      }),
  },

  evals: {
    suites: (agentId) => act(() => (scope(agentId), own(db.evalSuites, agentId))),
    createSuite: (agentId, input) =>
      act(() => {
        scope(agentId, 'editor')
        const suite = { id: uid('evs'), agentId, name: input.name, cases: input.cases.length, regression: input.regression, lastScore: null, lastRunAt: null }
        db.evalSuites.push(suite)
        input.cases.forEach((c) => db.evalCases.push({ id: uid('evc'), suiteId: suite.id, ...c }))
        audit(agentId, 'a créé une suite d’évaluation', input.name)
        return suite
      }),
    removeSuite: (agentId, suiteId) =>
      act(() => {
        scope(agentId, 'editor')
        const x = findIn(db.evalSuites, agentId, suiteId, 'Suite')
        db.evalSuites = db.evalSuites.filter((s) => s !== x)
        audit(agentId, 'a supprimé une suite', x.name)
      }),
    cases: (agentId, suiteId) => act(() => (scope(agentId), own(db.evalSuites, agentId).some((s) => s.id === suiteId) ? db.evalCases.filter((c) => c.suiteId === suiteId) : [])),
    addCase: (agentId, suiteId, input, expect) =>
      act(() => {
        scope(agentId, 'editor')
        const suite = findIn(db.evalSuites, agentId, suiteId, 'Suite')
        const c = { id: uid('evc'), suiteId, input, expect }
        db.evalCases.push(c)
        suite.cases += 1
        return c
      }),
    run: (agentId, suiteId) => act(() => runSuite(scope(agentId), suiteId, 'manual'), 1400),
    runs: (agentId, suiteId) => act(() => (scope(agentId), own(db.evalRuns, agentId).filter((r) => !suiteId || r.suiteId === suiteId))),
  },

  workflows: {
    list: (agentId) => act(() => (scope(agentId), own(db.workflows, agentId))),
    save: (agentId, wf) =>
      act(() => {
        scope(agentId, 'editor')
        const cur = wf.id ? db.workflows.find((w) => w.id === wf.id && w.agentId === agentId) : undefined
        if (wf.id && !cur) throw new ApiError('Workflow introuvable', 404)
        if (cur) {
          const bump = wf.published && (!cur.published || JSON.stringify(cur.nodes) !== JSON.stringify(wf.nodes))
          Object.assign(cur, wf, { version: bump ? cur.version + 1 : cur.version, updatedAt: nowIso() })
          audit(agentId, bump ? `a publié le workflow (v${cur.version})` : 'a enregistré le workflow', cur.name)
          return cur
        }
        const created = { ...wf, id: uid('wf'), agentId, version: 1, updatedAt: nowIso() }
        db.workflows.push(created)
        audit(agentId, 'a créé le workflow', created.name)
        return created
      }),
    remove: (agentId, id) =>
      act(() => {
        scope(agentId, 'editor')
        const w = findIn(db.workflows, agentId, id, 'Workflow')
        db.workflows = db.workflows.filter((x) => x !== w)
        audit(agentId, 'a supprimé le workflow', w.name)
      }),
    run: (agentId, id, input, test) =>
      act(() => {
        const a = scope(agentId, 'editor')
        const w = findIn(db.workflows, agentId, id, 'Workflow')
        if (!w.published && !test) throw new ApiError('Publiez le workflow avant de l’exécuter en production', 409)
        let out = input
        const steps: WorkflowRun['steps'] = []
        let status: WorkflowRun['status'] = 'ok'
        for (const n of w.nodes) {
          if (status !== 'ok') break
          if (n.kind === 'approval' && !test) {
            steps.push({ nodeId: n.id, label: n.label, status: 'waiting', attempts: 1, output: 'En attente de validation' })
            db.approvals.unshift({ id: uid('apr'), agentId, source: 'workflow', action: n.label, reason: `Workflow « ${w.name} »`, risk: 'medium', requestedAt: nowIso() })
            status = 'waiting_approval'
            break
          }
          if (n.kind === 'model') out = reply(a, `${n.config ?? n.label} ${out}`).content
          if (n.kind === 'output') out = (n.config ?? '{{output}}').replace('{{output}}', out)
          steps.push({ nodeId: n.id, label: n.label, status: 'ok', attempts: 1, output: out.slice(0, 200) })
        }
        const run: WorkflowRun = { id: uid('wfr'), agentId, workflowId: id, version: w.version, status, trigger: `manual${test ? ' (test)' : ''}`, startedAt: nowIso(), durationMs: 600 + steps.length * 300, steps }
        db.workflowRuns.unshift(run)
        audit(agentId, 'a lancé le workflow', `${w.name} (manuel)`)
        return { runId: run.id }
      }, 900),
    runs: (agentId, workflowId) => act(() => (scope(agentId), own(db.workflowRuns, agentId).filter((r) => !workflowId || r.workflowId === workflowId))),
  },

  audit: { list: (agentId) => act(() => (scope(agentId), own(db.audit, agentId))) },
  usage: { get: (agentId) => act(() => usageOf(scope(agentId))) },
  docs: {
    get: (agentId) => act(() => ({ current: docOf(scope(agentId)), history: scope(agentId).versions.map((v) => ({ version: v.version, generatedAt: v.createdAt })) })),
    regenerate: (agentId) => act(() => ({ current: docOf(scope(agentId, 'editor')), history: scope(agentId).versions.map((v) => ({ version: v.version, generatedAt: v.createdAt })) })),
  },

  logs: {
    list: (agentId, f) => act(() => (scope(agentId), own(db.logs, agentId).filter((l) => (!f?.level || l.level === f.level) && (!f?.environment || l.environment === f.environment)))),
    subscribe: (agentId, onEntry) => {
      if (!roleOn(agentId)) return () => {}
      const pool = seed.liveLogPool.filter(([id]) => id === agentId)
      const lines = pool.length ? pool : ([[agentId, 'info', 'battement : agent à l’écoute']] as [string, LogEntry['level'], string][])
      const t = window.setInterval(() => {
        const [, level, message] = lines[Math.floor(Math.random() * lines.length)]
        const e: LogEntry = { id: uid('log'), at: nowIso(), agentId, level, message, environment: 'production' }
        db.logs.push(e)
        onEntry(clone(e))
      }, 2600)
      return () => window.clearInterval(t)
    },
  },
  traces: {
    list: (agentId) => act(() => (scope(agentId), own(db.traces, agentId))),
    get: (agentId, id) => act(() => (scope(agentId), findIn(db.traces, agentId, id, 'Trace'))),
  },

  forge: {
    agents: () =>
      delay(() => {
        const ids = myIds()
        const tasks = team.tasks.filter((t) => ids.has(t.agentId))
        return (['orchestrator', 'architect', 'security', 'builder', 'tester', 'supervisor'] as TeamRole[]).map((role) => {
          const mineByRole = tasks.filter((t) => t.role === role)
          const cur = mineByRole.find((t) => t.status === 'running' || t.status === 'queued')
          return {
            role,
            model: TEAM_MODELS[role],
            escalationModel: role === 'supervisor' ? 'claude-sonnet-5-5' : null,
            capabilities: TEAM_CAPS[role],
            status: cur ? (cur.status === 'running' ? 'working' : 'queued') : 'idle',
            currentTask: cur ? { requestId: cur.requestId, agentId: cur.agentId, agentName: db.agents.find((a) => a.id === cur.agentId)?.name ?? '', startedAt: cur.startedAt } : null,
            tasksDone: mineByRole.filter((t) => t.status === 'done').length,
            tasksFailed: mineByRole.filter((t) => t.status === 'failed').length,
            tokens: mineByRole.reduce((n, t) => n + t.tokens, 0),
            cost: Math.round(mineByRole.reduce((n, t) => n + t.cost, 0) * 10000) / 10000,
            lastActivityAt: mineByRole.at(-1)?.finishedAt ?? mineByRole.at(-1)?.createdAt ?? null,
          }
        })
      }, 120),
    requests: () => delay(() => team.requests.filter((r) => myIds().has(r.agentId)).map(withName), 120),
    agentRequests: (agentId) => act(() => (scope(agentId), team.requests.filter((r) => r.agentId === agentId).map(withName))),
    request: (agentId, requestId) =>
      act(() => {
        scope(agentId)
        const request = team.requests.find((r) => r.id === requestId && r.agentId === agentId)
        if (!request) throw new ApiError('Demande introuvable', 404)
        return { request: withName(request), tasks: team.tasks.filter((t) => t.requestId === requestId), events: team.events.filter((e) => e.requestId === requestId) }
      }, 120),
    create: (input) => act(() => withName(startForge(input))),
    supervise: (agentId) =>
      act(() => {
        scope(agentId, 'editor')
        const req: TeamRequest = { id: uid('req'), agentId, agentName: '', kind: 'supervise', input: { mode: 'sweep' }, status: 'done', result: { agentId, anomalies: 0 }, error: null, steps: 2, agentCalls: 1, tokens: 640, cost: 0.002, createdBy: me.id, createdAt: nowIso(), finishedAt: nowIso() }
        team.requests.unshift(req)
        teamEvent(req, 'user', 'request.created', 'orchestrator')
        teamEvent(req, 'orchestrator', 'request.done')
        return { requestId: req.id }
      }),
  },

  projects: {
    list: () => delay(db.projects),
    get: (id) =>
      act(() => {
        const p = db.projects.find((x) => x.id === id)
        if (!p) throw new ApiError('Projet introuvable', 404)
        return p
      }),
    create: (input) =>
      act(() => {
        const slug = input.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'
        const empty = { url: '', deployed: false }
        const p = { id: uid('prj'), name: input.name, slug, description: input.description, stack: [], environments: { test: empty, staging: empty, production: empty }, createdAt: nowIso() }
        db.projects.push(p)
        platformAudit('a créé le projet', p.name)
        return p
      }),
    update: (id, patch) =>
      act(() => {
        const p = db.projects.find((x) => x.id === id)
        if (!p) throw new ApiError('Projet introuvable', 404)
        Object.assign(p, patch)
        return p
      }),
    remove: (id) =>
      act(() => {
        requireAdmin()
        db.projects = db.projects.filter((p) => p.id !== id)
        db.agents.forEach((a) => (a.projectIds = a.projectIds.filter((x) => x !== id)))
      }),
  },
  skills: {
    list: () => delay(db.skills),
    create: (input) =>
      act(() => {
        const k = { id: uid('skl'), ...input, version: '0.1.0', author: me.name, builtin: false }
        db.skills.push(k)
        return k
      }),
    remove: (id) =>
      act(() => {
        requireAdmin()
        const k = db.skills.find((x) => x.id === id)
        if (k?.builtin) throw new ApiError('Les skills intégrées ne peuvent pas être supprimées', 409)
        db.skills = db.skills.filter((x) => x.id !== id)
        db.agents.forEach((a) => (a.skillIds = a.skillIds.filter((x) => x !== id)))
      }),
  },
  connectors: {
    list: () => delay(db.connectors),
    toggle: (id, enabled) =>
      act(() => {
        requireAdmin()
        const c = db.connectors.find((x) => x.id === id)
        if (!c) throw new ApiError('Connecteur introuvable', 404)
        c.enabled = enabled
        return c
      }),
  },
  templates: { list: () => delay(db.templates) },
  notifications: {
    list: () => delay(() => db.notifications.filter((n) => !n.agentId || myIds().has(n.agentId))),
    markRead: (id) => act(() => void db.notifications.filter((n) => n.id === id).forEach((n) => (n.read = true))),
    markAllRead: () => act(() => void db.notifications.forEach((n) => (n.read = true))),
  },
  platform: {
    settings: () => delay(db.platformSettings),
    updateSettings: (patch) =>
      act(() => {
        requireAdmin()
        Object.assign(db.platformSettings, patch)
        platformAudit(patch.killSwitch === true ? 'a déclenché l’arrêt d’urgence' : patch.killSwitch === false ? 'a relancé les agents' : 'a modifié les paramètres', Object.keys(patch).join(', '))
        return db.platformSettings
      }),
  },
  admin: {
    users: () => act(() => (requireAdmin(), db.users.map((u) => ({ ...u, invited: false })))),
    invite: (email, platformRole: PlatformRole) =>
      act(() => {
        requireAdmin()
        if (db.users.some((u) => u.email === email)) throw new ApiError('Un compte utilise déjà cet email', 409)
        const u = { id: uid('usr'), name: email.split('@')[0], email, platformRole, lastActiveAt: nowIso() }
        db.users.push(u)
        platformAudit('a invité', `${email} (${platformRole})`)
        return { id: u.id, inviteUrl: `${location.origin}/login?invite=${uid('inv')}&email=${encodeURIComponent(email)}` }
      }),
    setRole: (id, platformRole) =>
      act(() => {
        requireAdmin()
        const u = db.users.find((x) => x.id === id)
        if (!u) throw new ApiError('Compte introuvable', 404)
        if (u.platformRole === 'admin' && platformRole !== 'admin' && db.users.filter((x) => x.platformRole === 'admin').length < 2) throw new ApiError('Il doit rester au moins un administrateur', 409)
        u.platformRole = platformRole
        platformAudit('a changé le rôle plateforme', `${u.email} → ${platformRole}`)
      }),
    removeUser: (id) =>
      act(() => {
        requireAdmin()
        if (id === me.id) throw new ApiError('Vous ne pouvez pas supprimer votre propre compte', 409)
        db.users = db.users.filter((u) => u.id !== id)
        db.memberships = db.memberships.filter((m) => m.userId !== id)
      }),
    agents: () =>
      act(() => {
        requireAdmin()
        return db.agents.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          owners: db.memberships.filter((m) => m.agentId === a.id && m.role === 'owner').map((m) => db.users.find((u) => u.id === m.userId)?.email ?? m.userId),
          members: db.memberships.filter((m) => m.agentId === a.id).length,
          createdAt: a.createdAt,
        }))
      }),
    audit: () => act(() => (requireAdmin(), db.platformAudit)),
  },
}
