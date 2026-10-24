import { ApiError, type ForgeApi } from './client'
import type { LogEntry } from './types'

const A = (id: string) => `/agents/${encodeURIComponent(id)}`

/**
 * REST implementation of ForgeApi. Every path is relative to VITE_API_URL
 * (e.g. http://localhost:8787) and versioned under /v1. Auth uses the session
 * cookie of the self-hosted instance (credentials: 'include'): never ship an
 * API key in front-end code. Adjust paths here only; screens never call fetch.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    // Network error, API stopped, or this page's origin missing from CONSOLE_ORIGINS (CORS).
    throw new ApiError(`API injoignable (${BASE}). Lancez « docker compose up -d » et ouvrez la console sur une origine listée dans CONSOLE_ORIGINS.`, 0)
  }
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
const put = <T,>(p: string, b: unknown) => request<T>('PUT', p, b)
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
    providers: () => get('/auth/providers'),
    oauthUrl: (provider, next) => `${BASE}/v1/auth/oauth/${provider}/start${qs({ next })}`,
  },
  overview: { get: () => get('/overview') },
  approvals: {
    mine: () => get('/approvals'),
    list: (id) => get(`${A(id)}/approvals`),
    resolve: (id, approvalId, decision) => post(`${A(id)}/approvals/${approvalId}/${decision}`),
  },
  agents: {
    list: () => get('/agents'),
    get: (id) => get(A(id)),
    create: (draft) => post('/agents', draft),
    update: (id, p, note) => patch(A(id), { ...p, ...(note ? { versionNote: note } : {}) }),
    setStatus: (id, status) => post(`${A(id)}/status`, { status }),
    restoreVersion: (id, version) => post(`${A(id)}/versions/${version}/restore`),
    duplicate: (id) => post(`${A(id)}/duplicate`),
    exportData: (id) => get(`${A(id)}/export`),
    remove: (id) => del(A(id)),
  },
  runtime: {
    send: (id, input, history, environment = 'test') =>
      post(`${A(id)}/run`, { input, environment, history: history.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })) }),
    checks: (id) => post(`${A(id)}/checks`),
  },
  members: {
    list: (id) => get(`${A(id)}/members`),
    add: (id, email, role) => post(`${A(id)}/members`, { email, role }),
    setRole: (id, userId, role) => patch(`${A(id)}/members/${userId}`, { role }),
    remove: (id, userId) => del(`${A(id)}/members/${userId}`),
  },
  keys: {
    list: (id) => get(`${A(id)}/keys`),
    create: (id, name, environment, scope) => post(`${A(id)}/keys`, { name, environment, scope }),
    rotate: (id, keyId) => post(`${A(id)}/keys/${keyId}/rotate`),
    revoke: (id, keyId) => del(`${A(id)}/keys/${keyId}`),
  },
  secrets: {
    list: (id) => get(`${A(id)}/secrets`),
    put: (id, name, value) => put(`${A(id)}/secrets`, { name, value }),
    remove: (id, name) => del(`${A(id)}/secrets/${encodeURIComponent(name)}`),
  },
  integrations: {
    list: (id) => get(`${A(id)}/integrations`),
    create: (id, input) => post(`${A(id)}/integrations`, input),
    remove: (id, iid) => del(`${A(id)}/integrations/${iid}`),
    check: (id, iid) => post(`${A(id)}/integrations/${iid}/check`),
    sendEvent: (id, event) => post(`${A(id)}/site/events`, { event }),
  },
  webhooks: {
    list: (id) => get(`${A(id)}/webhooks`),
    create: (id, url, events) => post(`${A(id)}/webhooks`, { url, events }),
    remove: (id, wid) => del(`${A(id)}/webhooks/${wid}`),
    test: (id, wid) => post(`${A(id)}/webhooks/${wid}/test`),
  },
  knowledge: {
    list: (id) => get(`${A(id)}/knowledge`),
    add: (id, input) => post(`${A(id)}/knowledge`, input),
    remove: (id, docId) => del(`${A(id)}/knowledge/${docId}`),
    search: (id, q) => get(`${A(id)}/knowledge/search${qs({ q })}`),
  },
  memories: {
    list: (id) => get(`${A(id)}/memories`),
    add: (id, text) => post(`${A(id)}/memories`, { text }),
    remove: (id, mid) => del(`${A(id)}/memories/${mid}`),
    clear: (id) => del(`${A(id)}/memories`),
  },
  evals: {
    suites: (id) => get(`${A(id)}/evals`),
    createSuite: (id, input) => post(`${A(id)}/evals`, input),
    removeSuite: (id, suiteId) => del(`${A(id)}/evals/${suiteId}`),
    cases: (id, suiteId) => get(`${A(id)}/evals/${suiteId}/cases`),
    addCase: (id, suiteId, input, expect) => post(`${A(id)}/evals/${suiteId}/cases`, { input, expect }),
    run: (id, suiteId) => post(`${A(id)}/evals/${suiteId}/run`),
    runs: (id, suiteId) => get(`${A(id)}/evals/runs${qs({ suiteId })}`),
  },
  workflows: {
    list: (id) => get(`${A(id)}/workflows`),
    save: (id, wf) => put(`${A(id)}/workflows`, wf),
    remove: (id, wid) => del(`${A(id)}/workflows/${wid}`),
    run: (id, wid, input, test) => post(`${A(id)}/workflows/${wid}/run`, { input, test }),
    runs: (id, workflowId) => get(`${A(id)}/workflows/runs${qs({ workflowId })}`),
  },
  audit: { list: (id) => get(`${A(id)}/audit`) },
  usage: { get: (id) => get(`${A(id)}/usage`) },
  docs: { get: (id) => get(`${A(id)}/docs`), regenerate: (id) => post(`${A(id)}/docs`) },
  logs: {
    list: (id, f) => get(`${A(id)}/logs${qs({ level: f?.level, environment: f?.environment })}`),
    subscribe: (id, onEntry) => {
      // Server-Sent Events on this agent's own channel: one JSON LogEntry per message.
      const es = new EventSource(`${BASE}/v1${A(id)}/logs/stream`, { withCredentials: true })
      es.onmessage = (ev) => onEntry(JSON.parse(ev.data) as LogEntry)
      return () => es.close()
    },
  },
  traces: { list: (id) => get(`${A(id)}/traces`), get: (id, tid) => get(`${A(id)}/traces/${tid}`) },
  forge: {
    agents: () => get('/forge/agents'),
    requests: () => get('/forge/requests'),
    agentRequests: (id) => get(`${A(id)}/forge/requests`),
    request: (id, requestId) => get(`${A(id)}/forge/requests/${requestId}`),
    create: (input) => post('/forge/requests', input),
    supervise: (id) => post(`${A(id)}/forge/supervise`),
  },
  projects: {
    list: () => get('/projects'),
    get: (id) => get(`/projects/${id}`),
    create: (input) => post('/projects', input),
    update: (id, p) => patch(`/projects/${id}`, p),
    remove: (id) => del(`/projects/${id}`),
  },
  skills: { list: () => get('/skills'), create: (input) => post('/skills', input), remove: (id) => del(`/skills/${id}`) },
  connectors: { list: () => get('/connectors'), toggle: (id, enabled) => patch(`/connectors/${id}`, { enabled }) },
  templates: { list: () => get('/templates') },
  notifications: {
    list: () => get('/notifications'),
    markRead: (id) => post(`/notifications/${id}/read`),
    markAllRead: () => post('/notifications/read-all'),
  },
  platform: { settings: () => get('/platform/settings'), updateSettings: (p) => patch('/platform/settings', p) },
  admin: {
    users: () => get('/admin/users'),
    invite: (email, platformRole) => post('/admin/users', { email, platformRole }),
    setRole: (id, platformRole) => patch(`/admin/users/${id}`, { platformRole }),
    removeUser: (id) => del(`/admin/users/${id}`),
    agents: () => get('/admin/agents'),
    audit: () => get('/admin/audit'),
  },
}
