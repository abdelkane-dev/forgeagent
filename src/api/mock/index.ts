import { ApiError, type ForgeApi } from '../client'
import type { Agent, ChatMessage, CheckResult, ID, LogEntry } from '../types'
import * as seed from './seed'

/**
 * In-memory implementation of ForgeApi. State lives for the browser session.
 * Latency is simulated so loading states are visible; set
 * localStorage "fa:simulate-errors" = "1" (Paramètres › Développeur) to make every call fail.
 */

const db = structuredClone({
  agents: seed.agents,
  projects: seed.projects,
  skills: seed.skills,
  connectors: seed.connectors,
  traces: seed.traces,
  logs: seed.logs,
  approvals: seed.approvals,
  audit: seed.audit,
  evals: seed.evals,
  knowledge: seed.knowledge,
  memories: seed.memories,
  templates: seed.templates,
  team: seed.team,
  apiKeys: seed.apiKeys,
  webhooks: seed.webhooks,
  notifications: seed.notifications,
  workflows: seed.workflows,
  delegations: seed.delegations,
  schedules: seed.schedules,
  settings: seed.settings,
})

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 7)}`
const nowIso = () => new Date().toISOString()
const clone = <T,>(v: T): T => structuredClone(v)

function shouldFail() {
  try {
    return localStorage.getItem('fa:simulate-errors') === '1'
  } catch {
    return false
  }
}

async function delay<T>(value: T, ms = 260 + Math.random() * 320): Promise<T> {
  await new Promise((r) => setTimeout(r, ms))
  if (shouldFail()) throw new ApiError('Le serveur ForgeAgent ne répond pas (erreur simulée).', 503)
  return clone(value)
}

function find<T extends { id: ID }>(list: T[], id: ID, what: string): T {
  const item = list.find((x) => x.id === id)
  if (!item) throw new ApiError(`${what} introuvable`, 404)
  return item
}

function log(actor: string, action: string, target: string) {
  db.audit.unshift({ id: uid('aud'), at: nowIso(), actor, action, target })
}

const ME = 'Abdoul Karim'

const secret = (env: 'live' | 'test') =>
  `fa_${env}_${Array.from({ length: 32 }, () => 'abcdefghijkmnopqrstuvwxyz23456789'[Math.floor(Math.random() * 33)]).join('')}`

export const mockApi: ForgeApi = {
  overview: {
    get: () => {
      const active = db.agents.filter((a) => a.status === 'active')
      return delay({
        activeAgents: active.length,
        runs24h: db.agents.reduce((s, a) => s + a.metrics.runs24h, 0),
        costToday: Math.round(db.agents.reduce((s, a) => s + a.metrics.costToday, 0) * 100) / 100,
        successRate: 98.7,
        p50LatencyMs: 2300,
        runsByDay: seed.runsByDay,
      })
    },
  },

  agents: {
    list: () => delay(db.agents),
    get: (id) => delay(find(db.agents, id, 'Agent')),
    create: (draft) => {
      const agent: Agent = {
        ...clone(draft),
        id: uid('agt'),
        status: 'active',
        version: 1,
        versions: [{ version: 1, createdAt: nowIso(), author: ME, note: 'Création' }],
        externalSite: null,
        metrics: { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 0, tokens24h: 0 },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.agents.unshift(agent)
      log(ME, 'a créé l’agent', agent.name)
      return delay(agent, 400)
    },
    update: (id, patch, note) => {
      const a = find(db.agents, id, 'Agent')
      const bumps = note !== undefined
      Object.assign(a, clone(patch), { updatedAt: nowIso() })
      if (bumps) {
        a.version += 1
        a.versions.unshift({ version: a.version, createdAt: nowIso(), author: ME, note: note || 'Mise à jour' })
        log(ME, `a publié la v${a.version}`, a.name)
      }
      return delay(a)
    },
    remove: (id) => {
      const a = find(db.agents, id, 'Agent')
      db.agents = db.agents.filter((x) => x.id !== id)
      log(ME, 'a supprimé l’agent', a.name)
      return delay(undefined)
    },
    restoreVersion: (id, version) => {
      const a = find(db.agents, id, 'Agent')
      a.version += 1
      a.versions.unshift({ version: a.version, createdAt: nowIso(), author: ME, note: `Restauration de la v${version}` })
      log(ME, `a restauré la v${version}`, a.name)
      return delay(a)
    },
    duplicate: (id, projectId) => {
      const src = find(db.agents, id, 'Agent')
      const copy: Agent = {
        ...clone(src),
        id: uid('agt'),
        name: `${src.name} (copie)`,
        projectIds: [projectId],
        status: 'paused',
        version: 1,
        versions: [{ version: 1, createdAt: nowIso(), author: ME, note: `Copie de ${src.name}` }],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      db.agents.unshift(copy)
      return delay(copy)
    },
    pingSite: (id, url) => {
      const a = find(db.agents, id, 'Agent')
      let host = ''
      try {
        host = new URL(url).origin
      } catch {
        throw new ApiError('Adresse invalide : utilisez https://…', 422)
      }
      const reachable = !/localhost:9|invalid|example\.invalid/.test(url)
      a.externalSite = {
        url,
        status: reachable ? 'connected' : 'unreachable',
        lastPingAt: nowIso(),
        latencyMs: reachable ? 60 + Math.round(Math.random() * 90) : null,
        allowedOrigins: [host],
      }
      return delay(a.externalSite, 900)
    },
    sendToSite: (id, event) => {
      const a = find(db.agents, id, 'Agent')
      if (!a.externalSite || a.externalSite.status !== 'connected')
        throw new ApiError('Aucun site connecté à cet agent', 409)
      return delay({ ok: true, latencyMs: 70 + Math.round(Math.random() * 80), response: `200 OK · ${event} reçu par ${a.externalSite.url}` }, 700)
    },
  },

  projects: {
    list: () => delay(db.projects),
    get: (id) => delay(find(db.projects, id, 'Projet')),
    create: ({ name, description }) => {
      const p = {
        id: uid('prj'),
        name,
        slug: name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-'),
        description,
        stack: [],
        environments: {
          test: { url: '', deployed: false },
          staging: { url: '', deployed: false },
          production: { url: '', deployed: false },
        },
        allowedDomains: [],
        createdAt: nowIso(),
      }
      db.projects.push(p)
      log(ME, 'a créé le projet', name)
      return delay(p)
    },
    update: (id, patch) => delay(Object.assign(find(db.projects, id, 'Projet'), clone(patch))),
    remove: (id) => {
      const p = find(db.projects, id, 'Projet')
      db.projects = db.projects.filter((x) => x.id !== id)
      db.agents.forEach((a) => (a.projectIds = a.projectIds.filter((x) => x !== id)))
      log(ME, 'a supprimé le projet', p.name)
      return delay(undefined)
    },
  },

  skills: {
    list: () =>
      delay(db.skills.map((s) => ({ ...s, installs: db.agents.filter((a) => a.skillIds.includes(s.id)).length }))),
    create: (input) => {
      const s = { ...input, id: uid('skl'), version: '0.1.0', author: ME, installs: 0, builtin: false }
      db.skills.push(s)
      return delay(s)
    },
    remove: (id) => {
      db.skills = db.skills.filter((s) => s.id !== id)
      db.agents.forEach((a) => (a.skillIds = a.skillIds.filter((x) => x !== id)))
      return delay(undefined)
    },
  },

  connectors: {
    list: () => delay(db.connectors),
    toggle: (id, enabled) => delay(Object.assign(find(db.connectors, id, 'Connecteur'), { enabled })),
  },

  traces: {
    list: (f) => delay(f?.agentId ? db.traces.filter((t) => t.agentId === f.agentId) : db.traces),
    get: (id) => delay(find(db.traces, id, 'Trace')),
  },

  logs: {
    list: (f) =>
      delay(db.logs.filter((l) => (!f?.agentId || l.agentId === f.agentId) && (!f?.level || l.level === f.level))),
    subscribe: (onEntry, f) => {
      const pool = seed.liveLogPool.filter(([agentId]) => !f?.agentId || agentId === f.agentId)
      const source = pool.length ? pool : seed.liveLogPool
      const timer = setInterval(() => {
        const [agentId, level, message] = source[Math.floor(Math.random() * source.length)]
        const entry: LogEntry = { id: uid('log'), at: nowIso(), agentId: f?.agentId ?? agentId, level, message }
        db.logs.push(entry)
        onEntry(entry)
      }, 1600 + Math.random() * 1200)
      return () => clearInterval(timer)
    },
  },

  approvals: {
    list: () => delay(db.approvals),
    resolve: (id, decision) => {
      const ap = find(db.approvals, id, 'Validation')
      db.approvals = db.approvals.filter((x) => x.id !== id)
      log(ME, decision === 'approve' ? 'a approuvé' : 'a refusé', ap.action)
      return delay(undefined)
    },
  },

  audit: { list: () => delay(db.audit) },

  evals: {
    list: () => delay(db.evals),
    run: (id) => {
      const ev = find(db.evals, id, 'Suite')
      ev.lastScore = 88 + Math.floor(Math.random() * 13)
      ev.lastRunAt = nowIso()
      return delay(ev, 1600)
    },
  },

  knowledge: {
    list: () => delay(db.knowledge),
    add: ({ name, kind }) => {
      const doc = { id: uid('kb'), name, kind, size: kind === 'website' ? '…' : '1,1 Mo', status: 'indexing' as const, chunks: 0 }
      db.knowledge.push(doc)
      setTimeout(() => Object.assign(doc, { status: 'indexed', chunks: 40 + Math.floor(Math.random() * 200), size: kind === 'website' ? '18 pages' : doc.size }), 2400)
      return delay(doc)
    },
    remove: (id) => {
      db.knowledge = db.knowledge.filter((k) => k.id !== id)
      return delay(undefined)
    },
  },

  memories: {
    list: (agentId) => delay(agentId ? db.memories.filter((m) => m.agentId === agentId) : db.memories),
    remove: (id) => {
      db.memories = db.memories.filter((m) => m.id !== id)
      return delay(undefined)
    },
    clear: (agentId) => {
      db.memories = db.memories.filter((m) => m.agentId !== agentId)
      return delay(undefined)
    },
  },

  templates: { list: () => delay(db.templates) },

  team: {
    list: () => delay(db.team),
    invite: (email, role) => {
      const m = { id: uid('usr'), name: email.split('@')[0], email, role, lastActiveAt: nowIso() }
      db.team.push(m)
      log(ME, 'a invité', `${email} (${role})`)
      return delay(m)
    },
    setRole: (id, role) => delay(Object.assign(find(db.team, id, 'Membre'), { role })),
    remove: (id) => {
      db.team = db.team.filter((m) => m.id !== id)
      return delay(undefined)
    },
  },

  apiKeys: {
    list: () => delay(db.apiKeys),
    create: (name, environment) => {
      const s = secret(environment)
      const key = { id: uid('key'), name, prefix: s.slice(0, 12), environment, createdAt: nowIso(), lastUsedAt: null }
      db.apiKeys.push(key)
      log(ME, 'a créé une clé API', name)
      return delay({ key, secret: s })
    },
    rotate: (id) => {
      const key = find(db.apiKeys, id, 'Clé')
      const s = secret(key.environment)
      key.prefix = s.slice(0, 12)
      key.createdAt = nowIso()
      log(ME, 'a régénéré une clé API', key.name)
      return delay({ key, secret: s })
    },
    revoke: (id) => {
      const key = find(db.apiKeys, id, 'Clé')
      db.apiKeys = db.apiKeys.filter((k) => k.id !== id)
      log(ME, 'a révoqué une clé API', key.name)
      return delay(undefined)
    },
  },

  webhooks: {
    list: () => delay(db.webhooks),
    create: (url, events) => {
      const w = { id: uid('wh'), url, events, enabled: true }
      db.webhooks.push(w)
      return delay(w)
    },
    remove: (id) => {
      db.webhooks = db.webhooks.filter((w) => w.id !== id)
      return delay(undefined)
    },
    test: () => delay({ status: 200, latencyMs: 90 + Math.round(Math.random() * 120) }, 700),
  },

  notifications: {
    list: () => delay(db.notifications),
    markRead: (id) => {
      find(db.notifications, id, 'Notification').read = true
      return delay(undefined, 80)
    },
    markAllRead: () => {
      db.notifications.forEach((n) => (n.read = true))
      return delay(undefined, 120)
    },
  },

  workflows: {
    list: () => delay(db.workflows),
    save: (wf) => {
      const i = db.workflows.findIndex((w) => w.id === wf.id)
      if (i >= 0) db.workflows[i] = clone(wf)
      else db.workflows.push(clone(wf))
      return delay(wf)
    },
  },

  delegations: {
    list: () => delay(db.delegations),
    create: (fromAgentId, toAgentId) => {
      const d = { id: uid('dl'), fromAgentId, toAgentId, enabled: true }
      db.delegations.push(d)
      return delay(d)
    },
    toggle: (id, enabled) => delay(Object.assign(find(db.delegations, id, 'Délégation'), { enabled })),
  },

  schedules: {
    list: () => delay(db.schedules),
    create: (agentId, cron, label) => {
      const s = { id: uid('sch'), agentId, cron, label, enabled: true }
      db.schedules.push(s)
      return delay(s)
    },
    toggle: (id, enabled) => delay(Object.assign(find(db.schedules, id, 'Planification'), { enabled })),
  },

  settings: {
    get: () => delay(db.settings),
    update: (patch) => {
      if (patch.killSwitch !== undefined && patch.killSwitch !== db.settings.killSwitch) {
        db.agents.forEach((a) => {
          if (a.status !== 'draft') a.status = patch.killSwitch ? 'paused' : a.status === 'paused' ? 'active' : a.status
        })
        log(ME, patch.killSwitch ? 'a déclenché l’arrêt d’urgence' : 'a relancé les agents', 'Tous les agents')
      }
      Object.assign(db.settings, clone(patch))
      return delay(db.settings)
    },
  },

  playground: {
    send: (agentId, input) => {
      const a = find(db.agents, agentId, 'Agent')
      const injection = /ignore|oublie (tes|les) instructions|system prompt/i.test(input)
      const reply: ChatMessage = injection
        ? {
            role: 'agent',
            content: 'Demande bloquée par le garde-fou « injection de prompt ». Aucune action exécutée.',
            meta: { durationMs: 310, tokens: 220, cost: 0.0007 },
          }
        : {
            role: 'agent',
            content:
              a.autonomy === 'suggest_only'
                ? `Analyse terminée. Je propose : ouvrir un ticket « ${input.slice(0, 48)} » et prévenir l’équipe. En attente de votre décision.`
                : `Analyse terminée. Action préparée, elle attend une validation humaine avant exécution.`,
            toolCalls: a.tools.slice(0, 2).map((t) => ({
              name: `${t.connectorId.replace('mcp_', '')}.${t.access === 'read' ? 'query' : 'create'}`,
              args: JSON.stringify({ q: input.slice(0, 32), limit: 10 }),
              result: t.access === 'read' ? '10 lignes, 2 erreurs 500' : '{ "id": "TCK-2291", "status": "draft" }',
            })),
            meta: { durationMs: 900 + Math.round(Math.random() * 1200), tokens: 1200 + Math.round(Math.random() * 2400), cost: 0.004 },
          }
      return delay(reply, 900 + Math.random() * 600)
    },
    checks: (agentId) => {
      const a = find(db.agents, agentId, 'Agent')
      const results: CheckResult[] = [
        { id: 'model', label: 'Clé Anthropic et modèle', status: db.settings.anthropicKeySet ? 'ok' : 'fail', detail: a.model },
        {
          id: 'mcp',
          label: 'Connexion aux outils (MCP)',
          status: a.tools.every((t) => db.connectors.find((c) => c.id === t.connectorId)?.enabled) ? 'ok' : 'warn',
          detail: `${a.tools.length} connecteur(s)`,
        },
        { id: 'perm', label: 'Permissions', status: a.permissions.allowedActions.length ? 'ok' : 'warn', detail: `${a.permissions.allowedActions.length} action(s) autorisée(s)` },
        { id: 'guard', label: 'Garde-fous', status: a.guardrails.promptInjection ? 'ok' : 'warn', detail: a.guardrails.humanApproval ? 'Validation humaine active' : 'Sans validation humaine' },
        { id: 'site', label: 'Site externe', status: a.externalSite?.status === 'connected' ? 'ok' : a.externalSite ? 'fail' : 'warn', detail: a.externalSite?.url ?? 'Aucun site connecté' },
        { id: 'cap', label: 'Plafond de coût', status: a.metrics.costToday < a.costCapPerDay * 0.8 ? 'ok' : 'warn', detail: `${a.metrics.costToday.toFixed(2)} $ / ${a.costCapPerDay} $ aujourd’hui` },
      ]
      return delay(results, 1100)
    },
  },
}
