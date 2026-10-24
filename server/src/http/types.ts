import type { PlatformRole } from '@shared/types'

export type Principal =
  | { kind: 'user'; id: string; name: string; email: string; platformRole: PlatformRole; sessionId: string }
  /** A secret API key belongs to ONE agent and can only reach that agent. */
  | { kind: 'key'; keyId: string; agentId: string; scope: 'secret' | 'publishable'; environment: 'live' | 'test' }

export type AppEnv = { Variables: { principal: Principal | null; requestId: string } }
