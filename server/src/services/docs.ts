import { desc, eq, inArray } from 'drizzle-orm'
import type { AgentDoc } from '@shared/types'
import { schema as s, type Tx, serial } from '../db/client'
import { isSensitive } from '../domain/actions'

/**
 * The agent's own documentation, regenerated (deterministically, no model) each time its
 * configuration, integrations or evaluations change. One row per version.
 */
export async function generateDoc(tx: Tx, agentId: string) {
  const [a] = await tx.select().from(s.agents).where(eq(s.agents.id, agentId))
  if (!a) return
  const [skills, integrations, suites, versions, members, projects] = await serial([
    () => tx.select({ name: s.skills.name }).from(s.agentSkills).innerJoin(s.skills, eq(s.skills.id, s.agentSkills.skillId)).where(eq(s.agentSkills.agentId, agentId)),
    () => tx.select().from(s.integrations).where(eq(s.integrations.agentId, agentId)),
    () => tx.select().from(s.evalSuites).where(eq(s.evalSuites.agentId, agentId)),
    () => tx.select().from(s.agentVersions).where(eq(s.agentVersions.agentId, agentId)).orderBy(desc(s.agentVersions.version)).limit(10),
    () => tx.select({ role: s.agentMembers.role }).from(s.agentMembers).where(eq(s.agentMembers.agentId, agentId)),
    () => tx.select({ name: s.projects.name }).from(s.agentProjects).innerJoin(s.projects, eq(s.projects.id, s.agentProjects.projectId)).where(eq(s.agentProjects.agentId, agentId))])
  const connectorIds = a.tools.map((t) => t.connectorId)
  const connectors = connectorIds.length ? await tx.select().from(s.connectors).where(inArray(s.connectors.id, connectorIds)) : []
  const list = (xs: string[], empty = '_Aucun._') => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : empty)
  const markdown = `# ${a.name}

> ${a.mission}

| | |
|---|---|
| Identifiant | \`${a.id}\` |
| Rôle | ${a.role || '—'} |
| Type | ${a.type} · ${a.subcategory || '—'} |
| Modèle | ${a.model} |
| Autonomie | ${a.autonomy} |
| Version | v${a.version} |
| Projets | ${projects.map((p) => p.name).join(', ') || '—'} |
| Budget | ${a.costCapPerDay} $ / jour · ${a.monthlyBudget} $ / mois |

## Objectif
${a.mission}

${a.persona ? `## Style et règles\n${a.persona}\n` : ''}
## Permissions
Actions autorisées :
${list(a.allowedActions.map((x) => `${x}${isSensitive(x) ? ' (sensible : validation humaine)' : ''}`))}

Actions interdites :
${list(a.guardrails.forbiddenActions)}

Garde-fous : injection de prompt ${a.guardrails.promptInjection ? 'bloquée' : 'non filtrée'}, données personnelles ${a.guardrails.piiMasking ? 'masquées' : 'non masquées'}, validation humaine ${a.guardrails.humanApproval ? 'active' : 'inactive'}, ${a.guardrails.rateLimitPerMin} exécutions/min au plus.

## Outils
${list(connectors.map((c) => `${c.name} (${a.tools.find((t) => t.connectorId === c.id)?.access === 'read_write' ? 'lecture et écriture' : 'lecture seule'})`))}

Skills : ${skills.map((k) => k.name).join(', ') || 'aucune'}.

## Déclencheurs
${list(a.triggers.map((t) => `${t.label} (${t.kind}${t.config ? ` : \`${t.config}\`` : ''})${t.enabled ? '' : ' — désactivé'}`))}

## Intégrations
${list(integrations.map((i) => `${i.name} — ${i.url} (${i.environment}, ${i.status})`))}

Origines autorisées pour le widget : ${a.allowedOrigins.join(', ') || 'aucune'}.

## Évaluations
${list(suites.map((x) => `${x.name}${x.regression ? ' (test de régression avant chaque version)' : ''}`))}

## Équipe
${members.filter((m) => m.role === 'owner').length} propriétaire(s), ${members.filter((m) => m.role === 'editor').length} éditeur(s), ${members.filter((m) => m.role === 'viewer').length} lecteur(s).

## Versions
${list(versions.map((v) => `v${v.version} — ${v.note} (${v.author}, ${v.createdAt.slice(0, 10)})${v.regressionScore != null ? ` · régression ${v.regressionScore} %` : ''}`))}
`
  await tx
    .insert(s.agentDocs)
    .values({ agentId, version: a.version, markdown })
    .onConflictDoUpdate({ target: [s.agentDocs.agentId, s.agentDocs.version], set: { markdown, generatedAt: new Date().toISOString() } })
}

export async function getDocs(tx: Tx, agentId: string): Promise<{ current: AgentDoc | null; history: { version: number; generatedAt: string }[] }> {
  const rows = await tx.select().from(s.agentDocs).where(eq(s.agentDocs.agentId, agentId)).orderBy(desc(s.agentDocs.version))
  return { current: rows[0] ?? null, history: rows.map((r) => ({ version: r.version, generatedAt: r.generatedAt })) }
}

