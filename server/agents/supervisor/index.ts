import { z } from 'zod'
import { registerSimulation } from '../../src/llm/simulated'
import type { TeamAgent } from '../../src/team/types'

const Input = z.object({ mode: z.enum(['register', 'sweep']), agentId: z.string().optional() })
const Triage = z.object({ diagnosis: z.string().max(400), proposal: z.string().max(400), severity: z.enum(['low', 'medium', 'high']) })
const Output = z.object({
  watching: z.number(),
  anomalies: z.array(z.object({ agentId: z.string(), name: z.string(), signal: z.string() }).extend(Triage.shape)),
})

/**
 * Continuous monitoring. Anomaly detection is deterministic (thresholds); the model only
 * triages the error logs of agents already flagged, with the small, fast model.
 */
export const supervisor: TeamAgent<'supervisor', z.infer<typeof Input>, z.infer<typeof Output>> = {
  role: 'supervisor',
  label: 'Superviseur',
  mission: 'Surveille en continu les agents actifs (logs, erreurs, coûts), détecte les anomalies et propose des corrections.',
  input: Input,
  output: Output,
  async run(ctx, input) {
    const health = await ctx.caps.readAgentHealth()
    const scope = input.mode === 'register' && input.agentId ? health.filter((h) => h.id === input.agentId) : health
    const flagged = scope
      .map((h) => {
        const signals: string[] = []
        if (h.status === 'error') signals.push('agent en erreur')
        if (h.runs >= 5 && h.errors / h.runs > 0.1) signals.push(`taux d’erreur ${Math.round((h.errors / h.runs) * 100)} %`)
        if (h.cap > 0 && h.cost >= h.cap * 0.8) signals.push(`coût à ${Math.round((h.cost / h.cap) * 100)} % du plafond`)
        return { ...h, signal: signals.join(', ') }
      })
      .filter((h) => h.signal)
    const anomalies: z.infer<typeof Output>['anomalies'] = []
    for (const h of flagged.slice(0, 5)) {
      const errors = await ctx.caps.readRecentErrors(h.id)
      const t = await ctx.think({ agent: h.name, signal: h.signal, recentLogs: errors }, Triage, { maxTokens: 300 })
      anomalies.push({ agentId: h.id, name: h.name, signal: h.signal, ...t })
      await ctx.caps.notify(`Superviseur : ${h.name}`, `${h.signal}. ${t.proposal}`, `/app/agents/${h.id}?tab=logs`)
    }
    return { watching: scope.length, anomalies }
  },
}

registerSimulation('supervisor', (req) => {
  const { signal, recentLogs } = JSON.parse(String(req.messages[0].content)) as { signal: string; recentLogs: string[] }
  const token = recentLogs.find((l) => /jeton|token|401/i.test(l))
  const timeout = recentLogs.find((l) => /expir|délai|timeout/i.test(l))
  return {
    text: JSON.stringify(
      token
        ? { diagnosis: 'Jeton d’accès au connecteur expiré.', proposal: 'Régénérer le jeton du connecteur concerné puis relancer l’agent.', severity: 'high' }
        : timeout
          ? { diagnosis: 'Un outil répond trop lentement (délais dépassés).', proposal: 'Augmenter le délai de l’outil ou activer la reprise automatique.', severity: 'medium' }
          : { diagnosis: `Anomalie : ${signal}.`, proposal: 'Vérifier les dernières traces et abaisser le plafond si nécessaire.', severity: signal.includes('coût') ? 'medium' : 'low' },
    ),
  }
})
