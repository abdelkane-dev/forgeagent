import type { z } from 'zod'
import type { TeamRole } from '../db/schema'
import type { Capabilities } from './capabilities'

export type { TeamRole }

/**
 * What a specialist receives: the capabilities of its role only, bound to ONE target agent
 * by a signed, short-lived capability token. It cannot name another agent.
 */
export interface TeamContext<R extends TeamRole = TeamRole> {
  requestId: string
  taskId: string
  /** The single agent this task works on. */
  agentId: string
  role: R
  caps: Pick<Capabilities, (typeof ROLE_CAPABILITIES)[R][number]>
  /** Calls the role's model with its prompt.md and validates the JSON answer. */
  think<T>(user: unknown, schema: z.ZodType<T>, opts?: { maxTokens?: number }): Promise<T>
  event(type: string, payload?: Record<string, unknown>): Promise<void>
}

export interface TeamAgent<R extends TeamRole, I, O> {
  role: R
  mission: string
  input: z.ZodType<I>
  output: z.ZodType<O>
  run(ctx: TeamContext<R>, input: I): Promise<O>
}

/** Least privilege, enforced by construction: a role's context only contains these functions. */
export const ROLE_CAPABILITIES = {
  orchestrator: ['readRequest'],
  architect: ['readCatalog', 'readProject'],
  builder: ['readCatalog', 'configureAgentFromPlan'],
  security: ['readCatalog'],
  tester: ['runChecks', 'runSandbox', 'runEvaluation'],
  supervisor: ['readAgentHealth', 'readRecentErrors', 'notify'],
} as const satisfies Record<TeamRole, readonly (keyof Capabilities)[]>
