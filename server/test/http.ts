import { expect } from 'vitest'
import { createApp } from '../src/app'
import { PASSWORD } from './helpers'

export const app = createApp()
export const ORIGIN = 'http://localhost:5173'

export async function login(email: string) {
  const r = await app.request('/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, password: PASSWORD }) })
  expect(r.status).toBe(200)
  return r.headers.get('set-cookie')!.split(';')[0]
}

export const call = (cookie: string, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) =>
  app.request(path, { method, headers: { cookie, origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })

export const bearer = (key: string, method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { authorization: `Bearer ${key}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })

/** Creates a key through the API and returns its secret (shown once). */
export async function newKey(cookie: string, agentId: string, environment: 'live' | 'test', scope: 'secret' | 'publishable' = 'secret') {
  const r = await call(cookie, 'POST', `/v1/agents/${agentId}/keys`, { name: `${scope}-${environment}-${Date.now()}`, environment, scope })
  expect(r.status).toBe(201)
  return (await r.json()).secret as string
}
