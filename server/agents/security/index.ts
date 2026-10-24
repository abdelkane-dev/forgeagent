import { z } from 'zod'
import { isKnownAction, isSensitive } from '../../src/domain/actions'
import { registerSimulation } from '../../src/llm/simulated'
import { AgentPlan, clampPlan } from '../../src/team/plan'
import type { TeamAgent } from '../../src/team/types'

const Input = z.object({
  plan: AgentPlan,
  ceiling: z.object({ maxActions: z.array(z.string()), autonomyCeiling: z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple']) }),
})
/** revise = send the plan back to the architect (only the model can ask for it). */
const Verdict = z.enum(['approve', 'revise', 'needs_human', 'veto'])
const Review = z.object({ verdict: Verdict, reasons: z.array(z.string()).max(20).default([]), risks: z.array(z.string()).max(20).default([]) })
const Output = Review.extend({ plan: AgentPlan, findings: z.array(z.string()), modelVerdict: Verdict })

const RANK = { approve: 0, revise: 1, needs_human: 2, veto: 3 } as const
const MALICIOUS = /(exfiltr|vol(er)? des donn|contourn|bypass|désactiv(er)? (les )?garde|keylog|ransom|phishing|hameçonn)/i

/**
 * Security reviewer with a veto. The server's deterministic findings come first;
 * the model can only make the verdict stricter, never more lenient.
 */
export const security: TeamAgent<'security', z.infer<typeof Input>, z.infer<typeof Output>> = {
  role: 'security',
  mission: 'Examine chaque plan et chaque action avant exécution ; peut refuser ou exiger une validation humaine.',
  input: Input,
  output: Output,
  async run(ctx, input) {
    const catalog = await ctx.caps.readCatalog()
    const { plan, removed } = clampPlan(input.plan, input.ceiling, { skills: catalog.skills.map((k) => k.id), connectors: catalog.connectors.map((c) => c.id) })
    const findings = removed.map((r) => `retiré : ${r}`)
    let codeVerdict: z.infer<typeof Verdict> = 'approve'
    const unknown = input.plan.allowedActions.filter((a) => !isKnownAction(a))
    if (unknown.length) findings.push(`actions hors catalogue : ${unknown.join(', ')}`)
    const sensitive = plan.allowedActions.filter(isSensitive)
    if (sensitive.length) {
      findings.push(`actions sensibles : ${sensitive.join(', ')}`)
      codeVerdict = 'needs_human'
    }
    if (plan.tools.some((t) => t.access === 'read_write')) {
      findings.push('accès en écriture à un connecteur')
      codeVerdict = 'needs_human'
    }
    if (MALICIOUS.test(`${plan.mission} ${plan.rationale}`)) {
      findings.push('mission potentiellement malveillante')
      codeVerdict = 'veto'
    }
    const review = await ctx.think({ plan, ceiling: input.ceiling, findings }, Review, { maxTokens: 800 })
    const verdict = RANK[review.verdict] > RANK[codeVerdict] ? review.verdict : codeVerdict
    await ctx.event('security.verdict', { codeVerdict, modelVerdict: review.verdict, verdict })
    return { ...review, verdict, plan, findings, modelVerdict: review.verdict }
  },
}

registerSimulation('security', (req) => {
  const input = JSON.parse(String(req.messages[0].content)) as { plan: { mission: string }; findings: string[] }
  const verdict = MALICIOUS.test(input.plan.mission) ? 'veto' : input.findings.some((f) => f.startsWith('actions sensibles') || f.includes('écriture')) ? 'needs_human' : 'approve'
  return {
    text: JSON.stringify({
      verdict,
      reasons: verdict === 'approve' ? ['Moindre privilège respecté'] : verdict === 'veto' ? ['Mission incompatible avec la politique de sécurité'] : ['Actions sensibles : validation humaine requise'],
      risks: input.findings,
    }),
  }
})
