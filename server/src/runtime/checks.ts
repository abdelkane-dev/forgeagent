import { and, eq, inArray } from 'drizzle-orm'
import type { CheckResult } from '@shared/types'
import { asAgent, schema as s } from '../db/client'
import { isSensitive } from '../domain/actions'
import { newId } from '../lib/crypto'
import { llm } from '../llm'
import { getAgent } from '../services/agents'
import { getPlatformSettings } from '../services/settings'
import { spent } from '../services/usage'

/**
 * Configuration test of ONE agent: deterministic checks of everything it needs to run,
 * stored in its config_checks history.
 */
export async function runChecks(agentId: string): Promise<CheckResult[]> {
  const platform = await getPlatformSettings()
  return asAgent(agentId, async (tx) => {
    const agent = await getAgent(tx, agentId)
    const connectors = agent.tools.length ? await tx.select().from(s.connectors).where(inArray(s.connectors.id, agent.tools.map((t) => t.connectorId))) : []
    const disabled = agent.tools.filter((t) => t.enabled && !connectors.find((c) => c.id === t.connectorId)?.enabled)
    const sensitiveNoGuard = agent.permissions.allowedActions.some(isSensitive) && !agent.guardrails.humanApproval
    const sites = await tx.select().from(s.integrations).where(and(eq(s.integrations.agentId, agentId), eq(s.integrations.kind, 'website')))
    const money = await spent(tx, agentId)
    const results: CheckResult[] = [
      { id: 'model', label: 'Clé Anthropic et modèle', status: llm.name === 'anthropic' ? 'ok' : 'warn', detail: llm.name === 'anthropic' ? agent.model : `${agent.model} · mode simulé (ANTHROPIC_API_KEY absente)` },
      { id: 'mcp', label: 'Connexion aux outils (MCP)', status: disabled.length ? 'warn' : 'ok', detail: disabled.length ? `${disabled.length} connecteur(s) désactivé(s)` : `${agent.tools.length} connecteur(s)` },
      { id: 'perm', label: 'Permissions', status: agent.permissions.allowedActions.length ? 'ok' : 'warn', detail: `${agent.permissions.allowedActions.length} action(s) autorisée(s)` },
      {
        id: 'guard',
        label: 'Garde-fous',
        status: !agent.guardrails.promptInjection || sensitiveNoGuard ? 'warn' : 'ok',
        detail: sensitiveNoGuard ? 'Actions sensibles sans validation humaine (elle reste imposée à l’exécution)' : agent.guardrails.humanApproval ? 'Validation humaine active' : 'Sans validation humaine',
      },
      {
        id: 'site',
        label: 'Site externe',
        status: sites.some((x) => x.status === 'connected') ? 'ok' : sites.length ? 'fail' : 'warn',
        detail: sites.length ? sites.map((x) => `${x.url} · ${x.status}`).join(', ') : 'Aucun site intégré',
      },
      {
        id: 'budget',
        label: 'Budget',
        status: money.today < agent.costCapPerDay * 0.8 && money.month < agent.monthlyBudget * 0.8 ? 'ok' : 'warn',
        detail: `${money.today.toFixed(2)} $ / ${agent.costCapPerDay} $ aujourd’hui · ${money.month.toFixed(2)} $ / ${agent.monthlyBudget} $ ce mois`,
      },
      { id: 'kill', label: 'Arrêt d’urgence', status: platform.killSwitch ? 'fail' : 'ok', detail: platform.killSwitch ? 'Actif : les exécutions réelles sont bloquées' : 'Inactif' },
    ]
    await tx.insert(s.configChecks).values({ id: newId('chk'), agentId, ok: results.every((r) => r.status !== 'fail'), results })
    return results
  })
}
