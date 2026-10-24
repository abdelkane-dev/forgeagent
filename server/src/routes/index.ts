import type { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import { adminRoutes } from './admin'
import { agentRoutes } from './agents'
import { authRoutes } from './auth'
import { internalTeamRoutes } from './internal-team'
import { opsRoutes } from './ops'
import { resourceRoutes } from './resources'

export function registerRoutes(app: Hono<AppEnv>) {
  authRoutes(app)
  agentRoutes(app)
  resourceRoutes(app)
  opsRoutes(app)
  adminRoutes(app)
  internalTeamRoutes(app)
}
