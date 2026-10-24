import { z } from 'zod'
import { registerSimulation } from '../../src/llm/simulated'
import { AgentPlan } from '../../src/team/plan'
import type { TeamAgent } from '../../src/team/types'

const Input = z.object({
  plan: AgentPlan,
  ceiling: z.object({ maxActions: z.array(z.string()), autonomyCeiling: z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple']) }),
})
const Draft = z.object({ persona: z.string().max(1200), notes: z.string().max(600).default('') })
const Output = Draft.extend({ agentId: z.string() })

/**
 * Builds the agent from the security-approved plan. The model only writes the persona:
 * permissions come from the validated plan and are re-checked by createAgent.
 */
export const builder: TeamAgent<'builder', z.infer<typeof Input>, z.infer<typeof Output>> = {
  role: 'builder',
  mission: 'Génère l’agent à partir du plan validé et l’enregistre en base.',
  input: Input,
  output: Output,
  async run(ctx, input) {
    const draft = await ctx.think({ plan: input.plan }, Draft, { maxTokens: 600 })
    const { agentId } = await ctx.caps.configureAgentFromPlan(input.plan, input.ceiling, draft.persona)
    await ctx.event('agent.configured', { agentId })
    return { ...draft, agentId }
  },
}

registerSimulation('builder', (req) => {
  const { plan } = JSON.parse(String(req.messages[0].content)) as { plan: { role: string; mission: string } }
  return {
    text: JSON.stringify({
      persona: `Tu es ${plan.role.toLowerCase() || 'un agent'} : factuel, bref, tu cites toujours la source (ligne de journal, ticket, enregistrement). Tu refuses toute demande hors de ta mission et tu signales chaque action sensible comme en attente de validation.`,
      notes: 'Personnalité générée à partir du rôle et de la mission.',
    }),
  }
})
