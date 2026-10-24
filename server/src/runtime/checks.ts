import { inArray, sql } from 'drizzle-orm'
import type { CheckResult } from '@shared/types'
import { db, schema as s } from '../db/client'
import { isSensitive } from '../domain/actions'
import { newId } from '../lib/crypto'
import { llm } from '../llm'
import { getAgent } from '../services/agents'
import { getSettings } from '../services/settings'

/**
 * Configuration test ("Vérifications"): deterministic checks of everything an agent needs
 * to run, stored in config_checks so the history is kept.
 */
export async function runChecks(agentId: string): Promise<CheckResult[]> {
  const agent = await getAgent(agentId)
  const settings = await getSettings()
  const connectors = agent.tools.length ? await db.select().from(s.connectors).where(inArray(s.connectors.id, agent.tools.map((t) => t.connectorId))) : []
  const disabled = agent.tools.filter((t) => t.enabled && !connectors.find((c) => c.id === t.connectorId)?.enabled)
  const sensitiveNoGuard = agent.permissions.allowedActions.filter(isSensitive).length > 0 && !agent.guardrails.humanApproval
  const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const [spend] = await db.select({ c: sql<number>`coalesce(sum(${s.runs.cost}), 0)::float8` }).from(s.runs).where(sql`${s.runs.agentId} = ${agentId} and ${s.runs.startedAt} >= ${since} and ${s.runs.sandbox} = false`)

  const results: CheckResult[] = [
    {
      id: 'model',
      label: 'Clé Anthropic et modèle',
      status: llm.name === 'anthropic' ? 'ok' : 'warn',
      detail: llm.name === 'anthropic' ? agent.model : `${agent.model} · mode simulé (ANTHROPIC_API_KEY absente)`,
    },
    {
      id: 'mcp',
      label: 'Connexion aux outils (MCP)',
      status: disabled.length ? 'warn' : 'ok',
      detail: disabled.length ? `${disabled.length} connecteur(s) désactivé(s) sur l’instance` : `${agent.tools.length} connecteur(s)`,
    },
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
      status: agent.externalSite?.status === 'connected' ? 'ok' : agent.externalSite ? 'fail' : 'warn',
      detail: agent.externalSite ? `${agent.externalSite.url} · ${agent.externalSite.status}` : 'Aucun site connecté',
    },
    {
      id: 'cap',
      label: 'Plafond de coût',
      status: spend.c < agent.costCapPerDay * 0.8 ? 'ok' : 'warn',
      detail: `${spend.c.toFixed(2)} $ / ${agent.costCapPerDay} $ aujourd’hui`,
    },
    { id: 'kill', label: 'Arrêt d’urgence', status: settings.killSwitch ? 'fail' : 'ok', detail: settings.killSwitch ? 'Actif : les exécutions réelles sont bloquées' : 'Inactif' },
  ]
  await db.insert(s.configChecks).values({ id: newId('chk'), agentId, ok: results.every((r) => r.status !== 'fail'), results })
  return results
}
