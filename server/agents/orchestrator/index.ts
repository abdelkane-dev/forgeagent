import { z } from 'zod'
import { registerSimulation } from '../../src/llm/simulated'
import type { TeamAgent } from '../../src/team/types'

const Next = z.enum(['architect', 'security', 'builder', 'tester', 'supervisor', 'done'])

const Input = z.object({
  kind: z.string(),
  history: z.array(z.object({ role: z.string(), status: z.string(), summary: z.string() })),
  allowedNext: z.array(Next).min(1),
})
const Output = z.object({ next: Next, instructions: z.string().max(300).default('') })

/** Decides the next step. Its choice is only a suggestion: the engine enforces the allowed transitions. */
export const orchestrator: TeamAgent<'orchestrator', z.infer<typeof Input>, z.infer<typeof Output>> = {
  role: 'orchestrator',
  mission: 'Découpe chaque demande en tâches, les assigne aux spécialistes et assemble les résultats.',
  input: Input,
  output: Output,
  async run(ctx, input) {
    await ctx.caps.readRequest()
    return ctx.think(input, Output, { maxTokens: 300 })
  },
}

registerSimulation('orchestrator', (req) => {
  const input = JSON.parse(String(req.messages[0].content)) as z.infer<typeof Input>
  const next = input.allowedNext[0]
  const brief: Record<string, string> = {
    architect: 'Conçois la configuration minimale répondant au besoin, dans le plafond fixé.',
    security: 'Examine le plan : moindre privilège, actions sensibles, interdictions.',
    builder: 'Construis l’agent à partir du plan validé et rédige sa personnalité.',
    tester: 'Lance les vérifications et un scénario en bac à sable.',
    supervisor: 'Ajoute l’agent à la surveillance continue.',
    done: 'Demande terminée.',
  }
  return { text: JSON.stringify({ next, instructions: brief[next] }) }
})
