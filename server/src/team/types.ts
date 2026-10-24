import type { z } from 'zod'
import type { TeamRole } from '../db/schema'
import type { Capabilities } from './capabilities'

export type { TeamRole }

/** What a specialist receives: only the capabilities its role grants, plus accounting hooks. */
export interface TeamContext<R extends TeamRole = TeamRole> {
  requestId: string
  taskId: string
  role: R
  caps: Pick<Capabilities, (typeof ROLE_CAPABILITIES)[R][number]>
  /** Calls the role's model with its prompt.md and validates the JSON answer. */
  think<T>(user: unknown, schema: z.ZodType<T>, opts?: { maxTokens?: number }): Promise<T>
  event(type: string, payload?: Record<string, unknown>): Promise<void>
}

export interface TeamAgent<R extends TeamRole, I, O> {
  role: R
  label: string
  mission: string
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(ctx: TeamContext<R>, input: I): Promise<O>
}

/**
 * Least privilege, enforced by construction: a role's context only contains the functions listed here.
 * The orchestrator cannot write anything; only the builder can create an agent; only the tester can run one.
 */
export const ROLE_CAPABILITIES = {
  orchestrator: ['readRequest'],
  architect: ['readCatalog', 'readProject'],
  builder: ['readCatalog', 'createAgentFromPlan'],
  security: ['readCatalog'],
  tester: ['runChecks', 'runSandbox'],
  supervisor: ['readAgentHealth', 'readRecentErrors', 'notify'],
} as const satisfies Record<TeamRole, readonly (keyof Capabilities)[]>
