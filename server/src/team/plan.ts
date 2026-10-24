import { z } from 'zod'
import { ACTION_NAMES } from '../domain/actions'
import { AgentType, Autonomy, ClaudeModel, Channel } from '../http/schemas'

/** The architect's proposal. Model output: validated here, then clamped in code before any use. */
export const AgentPlan = z.object({
  name: z.string().min(3).max(80),
  role: z.string().max(120),
  mission: z.string().min(10).max(2000),
  type: AgentType,
  subcategory: z.string().max(80).default(''),
  model: ClaudeModel,
  autonomy: Autonomy,
  allowedActions: z.array(z.string()).max(20),
  forbiddenActions: z.array(z.string().max(120)).max(20).default([]),
  skillIds: z.array(z.string()).max(20).default([]),
  tools: z.array(z.object({ connectorId: z.string(), access: z.enum(['read', 'read_write']) })).max(10).default([]),
  triggers: z.array(z.enum(['message', 'cron', 'webhook', 'db_event', 'file', 'agent'])).max(6).default(['message']),
  integrations: z.array(Channel).max(6).default(['rest']),
  costCapPerDay: z.number().min(1).max(500).default(20),
  rationale: z.string().max(1000).default(''),
})
export type AgentPlan = z.infer<typeof AgentPlan>

export interface Ceiling {
  maxActions: string[]
  autonomyCeiling: z.infer<typeof Autonomy>
}

const AUTONOMY_RANK = { suggest_only: 0, act_after_approval: 1, act_alone_simple: 2 } as const

/**
 * Deterministic clamp: whatever the model proposed, the plan never exceeds the user's ceiling.
 * Returns the clamped plan and the list of what was removed (for the security report).
 */
export function clampPlan(plan: AgentPlan, ceiling: Ceiling, known: { skills: string[]; connectors: string[] }) {
  const removed: string[] = []
  const allowedActions = plan.allowedActions.filter((a) => {
    const ok = ACTION_NAMES.includes(a) && ceiling.maxActions.includes(a) && !plan.forbiddenActions.includes(a)
    if (!ok) removed.push(`action « ${a} »`)
    return ok
  })
  let autonomy = plan.autonomy
  if (AUTONOMY_RANK[autonomy] > AUTONOMY_RANK[ceiling.autonomyCeiling]) {
    removed.push(`autonomie « ${autonomy} » ramenée à « ${ceiling.autonomyCeiling} »`)
    autonomy = ceiling.autonomyCeiling
  }
  const skillIds = plan.skillIds.filter((id) => known.skills.includes(id) || (removed.push(`skill inconnue ${id}`), false))
  const tools = plan.tools.filter((t) => known.connectors.includes(t.connectorId) || (removed.push(`connecteur inconnu ${t.connectorId}`), false))
  return { plan: { ...plan, allowedActions, autonomy, skillIds, tools }, removed }
}
