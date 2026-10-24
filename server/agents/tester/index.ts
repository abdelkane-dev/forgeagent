import { z } from 'zod'
import { registerSimulation } from '../../src/llm/simulated'
import type { TeamAgent } from '../../src/team/types'

const Input = z.object({ agentId: z.string(), mission: z.string() })
const Scenario = z.object({ scenario: z.string().min(3).max(500), expectation: z.string().max(500).default('') })
const Output = z.object({
  passed: z.boolean(),
  checks: z.array(z.object({ id: z.string(), label: z.string(), status: z.string(), detail: z.string() })),
  scenario: z.string(),
  expectation: z.string(),
  sandbox: z.object({ status: z.string(), content: z.string(), tokens: z.number() }),
})

/** Runs the configuration checks and one sandbox scenario. The pass/fail verdict is computed in code. */
export const tester: TeamAgent<'tester', z.infer<typeof Input>, z.infer<typeof Output>> = {
  role: 'tester',
  label: 'Testeur',
  mission: 'Lance l’environnement de test, vérifie connexion et configuration, produit un rapport.',
  input: Input,
  output: Output,
  async run(ctx, input) {
    const checks = await ctx.caps.runChecks(input.agentId)
    const s = await ctx.think({ mission: input.mission }, Scenario, { maxTokens: 300 })
    const sandbox = await ctx.caps.runSandbox(input.agentId, s.scenario)
    const passed = !checks.some((c) => c.status === 'fail') && sandbox.status !== 'error'
    return { passed, checks, scenario: s.scenario, expectation: s.expectation, sandbox }
  },
}

registerSimulation('tester', (req) => {
  const { mission } = JSON.parse(String(req.messages[0].content)) as { mission: string }
  const scenario = /surveill|erreur|panne/i.test(mission)
    ? 'Erreur 500 sur /api/invoices depuis 5 minutes'
    : /fraude|spam|modér/i.test(mission)
      ? 'Utilisateur suspect : 14 publications en 3 minutes'
      : 'Résume l’activité de la dernière heure'
  return { text: JSON.stringify({ scenario, expectation: 'L’agent analyse, appelle ses outils en lecture et propose une action sans l’exécuter.' }) }
})
