import type { Hono } from 'hono'
import type { AppEnv } from '../http/types'
import { adminRoutes } from './admin'
import { agentSpaceRoutes } from './agent-space'
import { agentRoutes } from './agents'
import { authRoutes } from './auth'
import { forgeRoutes } from './forge'
import { platformRoutes } from './platform'

export function registerRoutes(app: Hono<AppEnv>) {
  authRoutes(app)
  platformRoutes(app)
  agentRoutes(app)
  agentSpaceRoutes(app)
  forgeRoutes(app)
  adminRoutes(app)
}
