import { ApiError, type ForgeApi } from './client'
import type { LogEntry } from './types'

/**
 * REST implementation of ForgeApi. Every path is relative to VITE_API_URL
 * (e.g. http://localhost:8787) and versioned under /v1. Auth uses the session
 * cookie of the self-hosted instance (credentials: 'include'): never ship an
 * API key in front-end code. Adjust paths here only; screens never call fetch.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/v1${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Session expired or missing: back to the sign-in page, then here.
    const next = location.pathname + location.search
    if (!location.pathname.startsWith('/login')) location.assign(`/login?next=${encodeURIComponent(next)}`)
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      message = data.message ?? data.error ?? message
    } catch {
      /* body is not JSON */
    }
    throw new ApiError(message, res.status)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const get = <T,>(p: string) => request<T>('GET', p)
const post = <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {})
const patch = <T,>(p: string, b: unknown) => request<T>('PATCH', p, b)
const del = (p: string) => request<void>('DELETE', p)
const qs = (o: Record<string, string | undefined> = {}) => {
  const s = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1])).toString()
  return s ? `?${s}` : ''
}

export const httpApi: ForgeApi = {
  auth: {
    me: () => get('/auth/me'),
    login: (email, password) => post('/auth/login', { email, password }),
    signup: (name, email, password) => post('/auth/signup', { name, email, password }),
    acceptInvite: (email, token, password) => post('/auth/accept-invite', { email, token, password }),
    resetRequest: (email) => post('/auth/reset-request', { email }),
    logout: () => post('/auth/logout'),
  },
  overview: { get: () => get('/overview') },
  agents: {
    list: () => get('/agents'),
    get: (id) => get(`/agents/${id}`),
    create: (draft) => post('/agents', draft),
    update: (id, p, note) => patch(`/agents/${id}`, { ...p, versionNote: note }),
    remove: (id) => del(`/agents/${id}`),
    restoreVersion: (id, version) => post(`/agents/${id}/versions/${version}/restore`),
    duplicate: (id, projectId) => post(`/agents/${id}/duplicate`, { projectId }),
    pingSite: (id, url) => post(`/agents/${id}/site/ping`, { url }),
    sendToSite: (id, event) => post(`/agents/${id}/site/events`, { event }),
  },
  projects: {
    list: () => get('/projects'),
    get: (id) => get(`/projects/${id}`),
    create: (input) => post('/projects', input),
    update: (id, p) => patch(`/projects/${id}`, p),
    remove: (id) => del(`/projects/${id}`),
  },
  skills: {
    list: () => get('/skills'),
    create: (input) => post('/skills', input),
    remove: (id) => del(`/skills/${id}`),
  },
  connectors: {
    list: () => get('/connectors'),
    toggle: (id, enabled) => patch(`/connectors/${id}`, { enabled }),
  },
  traces: {
    list: (f) => get(`/traces${qs({ agentId: f?.agentId })}`),
    get: (id) => get(`/traces/${id}`),
  },
  logs: {
    list: (f) => get(`/logs${qs({ agentId: f?.agentId, level: f?.level })}`),
    subscribe: (onEntry, f) => {
      // Server-Sent Events: one JSON LogEntry per message.
      const es = new EventSource(`${BASE}/v1/logs/stream${qs({ agentId: f?.agentId })}`, { withCredentials: true })
      es.onmessage = (ev) => onEntry(JSON.parse(ev.data) as LogEntry)
      return () => es.close()
    },
  },
  approvals: {
    list: () => get('/approvals'),
    resolve: (id, decision) => post(`/approvals/${id}/${decision}`),
  },
  audit: { list: () => get('/audit') },
  evals: { list: () => get('/evals'), run: (id) => post(`/evals/${id}/run`) },
  knowledge: {
    list: () => get('/knowledge'),
    add: (input) => post('/knowledge', input),
    remove: (id) => del(`/knowledge/${id}`),
  },
  memories: {
    list: (agentId) => get(`/memories${qs({ agentId })}`),
    remove: (id) => del(`/memories/${id}`),
    clear: (agentId) => del(`/agents/${agentId}/memories`),
  },
  templates: { list: () => get('/templates') },
  team: {
    list: () => get('/team'),
    invite: (email, role) => post('/team/invitations', { email, role }),
    setRole: (id, role) => patch(`/team/${id}`, { role }),
    remove: (id) => del(`/team/${id}`),
  },
  apiKeys: {
    list: () => get('/api-keys'),
    create: (name, environment, opts) => post('/api-keys', { name, environment, scope: opts?.scope ?? 'secret', projectId: opts?.projectId ?? null }),
    rotate: (id) => post(`/api-keys/${id}/rotate`),
    revoke: (id) => del(`/api-keys/${id}`),
  },
  webhooks: {
    list: () => get('/webhooks'),
    create: (url, events) => post('/webhooks', { url, events }),
    remove: (id) => del(`/webhooks/${id}`),
    test: (id) => post(`/webhooks/${id}/test`),
  },
  notifications: {
    list: () => get('/notifications'),
    markRead: (id) => post(`/notifications/${id}/read`),
    markAllRead: () => post('/notifications/read-all'),
  },
  workflows: {
    list: () => get('/workflows'),
    save: (wf) => request('PUT', `/workflows/${wf.id}`, wf),
  },
  delegations: {
    list: () => get('/delegations'),
    create: (fromAgentId, toAgentId) => post('/delegations', { fromAgentId, toAgentId }),
    toggle: (id, enabled) => patch(`/delegations/${id}`, { enabled }),
  },
  schedules: {
    list: () => get('/schedules'),
    create: (agentId, cron, label) => post('/schedules', { agentId, cron, label }),
    toggle: (id, enabled) => patch(`/schedules/${id}`, { enabled }),
  },
  settings: { get: () => get('/settings'), update: (p) => patch('/settings', p) },
  internalTeam: {
    agents: () => get('/internal-team/agents'),
    requests: () => get('/internal-team/requests'),
    request: (id) => get(`/internal-team/requests/${id}`),
    create: (input) => post('/internal-team/requests', input),
    sweep: () => post('/internal-team/sweep'),
    queue: () => get('/internal-team/queue'),
  },
  playground: {
    send: (agentId, input, history) => post(`/agents/${agentId}/run`, { input, history, sandbox: true }),
    checks: (agentId) => post(`/agents/${agentId}/checks`),
  },
}
