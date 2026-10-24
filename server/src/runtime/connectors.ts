import type { ToolDef } from '../llm'

/**
 * Connector tools exposed to user agents. Each granted connector yields a read tool,
 * plus a write tool when the grant is read_write.
 *
 * Execution is simulated with realistic, deterministic payloads: real MCP transports
 * plug in here (one executor per connector endpoint) without touching the runtime.
 */

const SHORT: Record<string, string> = {
  mcp_logs: 'logs',
  mcp_db: 'db',
  mcp_email: 'email',
  mcp_chat: 'chat',
  mcp_tickets: 'tickets',
  mcp_git: 'git',
  mcp_files: 'files',
  mcp_calendar: 'calendar',
}

export const toolPrefix = (connectorId: string) => SHORT[connectorId] ?? connectorId.replace(/^mcp_/, '')

export function connectorTools(grants: { connectorId: string; access: 'read' | 'read_write'; name: string; description: string }[]): ToolDef[] {
  return grants.flatMap((g) => {
    const p = toolPrefix(g.connectorId)
    const read: ToolDef = {
      name: `${p}_query`,
      description: `Lecture via le connecteur « ${g.name} » (${g.description}).`,
      input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Ce qu’il faut lire ou chercher' } }, required: ['query'] },
    }
    const write: ToolDef = {
      name: `${p}_write`,
      description: `Écriture via le connecteur « ${g.name} ». Soumis aux règles d’autonomie et de validation humaine.`,
      input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
    }
    return g.access === 'read_write' ? [read, write] : [read]
  })
}

/** Deterministic connector responses (sandbox and simulated mode). */
export function executeConnector(tool: string, input: Record<string, unknown>): string {
  const q = String(input.query ?? input.content ?? '').slice(0, 80)
  const [prefix, op] = tool.split('_')
  if (op === 'write') {
    const out: Record<string, string> = {
      tickets: '{"id":"TCK-2291","status":"open"}',
      email: '{"status":"sent","recipients":2}',
      chat: '{"status":"posted","channel":"#incidents"}',
      db: '{"rowsAffected":1}',
    }
    return out[prefix] ?? '{"status":"ok"}'
  }
  const out: Record<string, string> = {
    logs: `214 lignes pour « ${q} » · 37 erreurs « pool exhausted » depuis 14:02 · service api`,
    db: `10 lignes · compte #4821 : 14 publications en 3 min, créé il y a 2 h`,
    tickets: '3 tickets ouverts · TCK-2288 latence /search (priorité haute)',
    email: '2 messages non lus dans la boîte incidents@',
    chat: '#incidents : dernière alerte il y a 26 min',
    git: 'PR #142 · 4 fichiers modifiés · auth/session.ts +38 −12',
    files: '3 fichiers correspondants dans s3://bonaco/entrants',
    calendar: 'Prochaine astreinte : Inès Diallo, ce soir 19:00',
  }
  return out[prefix] ?? `Aucun résultat pour « ${q} »`
}
