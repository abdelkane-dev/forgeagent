import { z } from 'zod'
import { registerSimulation } from '../../src/llm/simulated'
import { AgentPlan } from '../../src/team/plan'
import type { TeamAgent } from '../../src/team/types'

const Input = z.object({
  brief: z.string(),
  projectId: z.string(),
  ceiling: z.object({ maxActions: z.array(z.string()), autonomyCeiling: z.string() }),
  instructions: z.string().default(''),
})

/** Designs the agent configuration. Output is a proposal: clamped in code, then reviewed by security. */
export const architect: TeamAgent<'architect', z.infer<typeof Input>, AgentPlan> = {
  role: 'architect',
  mission: 'Conçoit la configuration de l’agent : rôle, actions, skills, outils et permissions proposées.',
  input: Input,
  output: AgentPlan,
  async run(ctx, input) {
    const [catalog, project] = await Promise.all([ctx.caps.readCatalog(), ctx.caps.readProject(input.projectId)])
    return ctx.think({ ...input, project, catalog }, AgentPlan, { maxTokens: 1500 })
  },
}

/** Offline design: keyword-driven, stays inside the ceiling like a well-behaved model would. */
registerSimulation('architect', (req) => {
  const input = JSON.parse(String(req.messages[0].content)) as z.infer<typeof Input> & {
    project: { name: string } | null
    catalog: { skills: { id: string; name: string }[]; connectors: { id: string }[] }
  }
  const b = input.brief.toLowerCase()
  const kind = /surveill|monitor|erreur|panne|latence/.test(b)
    ? 'monitoring'
    : /fraude|spam|modér|abus/.test(b)
      ? 'decision'
      : /rapport|analy|donnée/.test(b)
        ? 'data'
        : /code|pull request|revue/.test(b)
          ? 'development'
          : 'conversational'
  const wanted: Record<string, string[]> = {
    monitoring: ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte', 'Redémarrer un service'],
    decision: ['Masquer une publication', 'Suspendre un compte', 'Envoyer une alerte'],
    data: ['Lire les journaux applicatifs', 'Envoyer une alerte'],
    development: ['Créer un ticket'],
    conversational: ['Lire les journaux applicatifs'],
  }
  const tools: Record<string, { connectorId: string; access: 'read' | 'read_write' }[]> = {
    monitoring: [{ connectorId: 'mcp_logs', access: 'read' }, { connectorId: 'mcp_tickets', access: 'read' }],
    decision: [{ connectorId: 'mcp_db', access: 'read' }],
    data: [{ connectorId: 'mcp_db', access: 'read' }],
    development: [{ connectorId: 'mcp_git', access: 'read' }],
    conversational: [{ connectorId: 'mcp_db', access: 'read' }],
  }
  const skills = input.catalog.skills.filter((k) => (kind === 'monitoring' ? /alerte|rapport/i : kind === 'decision' ? /fraude/i : /résumé/i).test(k.name)).map((k) => k.id)
  const label = { monitoring: 'Gardien', decision: 'Modérateur', data: 'Analyste', development: 'Relecteur', conversational: 'Assistant' }[kind]
  const plan: AgentPlan = {
    name: `${label} ${input.project?.name ?? ''}`.trim().slice(0, 80),
    role: { monitoring: 'Ingénieur de garde', decision: 'Modération', data: 'Analyste', development: 'Relecteur', conversational: 'Assistant interne' }[kind],
    mission: `${input.brief.slice(0, 600)} Ne jamais agir hors de ses permissions ; toute action sensible attend une validation humaine.`,
    type: kind as AgentPlan['type'],
    subcategory: { monitoring: 'Performance', decision: 'Modération', data: 'Analyse', development: 'Revue de code', conversational: 'Assistant interne' }[kind],
    model: kind === 'decision' ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
    autonomy: 'act_after_approval',
    allowedActions: wanted[kind].filter((a) => input.ceiling.maxActions.includes(a)),
    forbiddenActions: ['Écrire en base de données'],
    skillIds: skills,
    tools: tools[kind].filter((t) => input.catalog.connectors.some((c) => c.id === t.connectorId)),
    triggers: kind === 'monitoring' ? ['cron', 'webhook'] : ['message'],
    integrations: ['rest'],
    costCapPerDay: 20,
    rationale: `Type « ${kind} » déduit du besoin ; actions limitées au plafond ; connecteurs en lecture seule, les tickets passent par perform_action.`,
  }
  return { text: JSON.stringify(plan) }
})
