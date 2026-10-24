import type { Role } from '@shared/types'

export type Principal =
  | { kind: 'user'; id: string; name: string; email: string; role: Role; sessionId: string }
  | { kind: 'key'; keyId: string; scope: 'secret' | 'publishable'; projectId: string | null; environment: 'live' | 'test' }

export type AppEnv = { Variables: { principal: Principal | null; requestId: string } }
