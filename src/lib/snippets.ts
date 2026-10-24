import type { Snippet } from '@/components/common/code-block'

/** URL of the self-hosted API (VITE_API_URL), or a placeholder in demo mode. */
export const API_HOST = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'https://forge.votre-domaine.dev'

/**
 * Integration snippets for one agent. The widget uses a publishable key (fa_pub_…, Intégrations ›
 * Clés API › type « publiable »), bound to the project and to its allowed domains.
 */
export function agentSnippets(agentId: string, projectSlug = 'bonaco-pro', host = API_HOST, publishableKey = 'fa_pub_…'): Snippet[] {
  return [
    {
      id: 'widget',
      label: 'Widget',
      code: `<!-- Avant </body>. Ajoutez le domaine du site dans Projets › Domaines autorisés -->
<script
  src="${host}/widget.js"
  data-agent="${agentId}"
  data-project="${projectSlug}"
  data-key="${publishableKey}"
  defer
></script>`,
    },
    {
      id: 'rest',
      label: 'REST',
      code: `curl ${host}/v1/agents/${agentId}/run \\
  -H "Authorization: Bearer $FORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Vérifie les erreurs des 10 dernières minutes"}'`,
    },
    {
      id: 'js',
      label: 'JavaScript',
      code: `// Node 18+, Deno, Bun : aucune dépendance
const res = await fetch("${host}/v1/agents/${agentId}/run", {
  method: "POST",
  headers: { Authorization: \`Bearer \${process.env.FORGE_API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ input: "Vérifie les erreurs des 10 dernières minutes" }),
})
const run = await res.json()
console.log(run.content, run.meta.cost)`,
    },
    {
      id: 'python',
      label: 'Python',
      code: `import os, requests

run = requests.post(
    "${host}/v1/agents/${agentId}/run",
    headers={"Authorization": f"Bearer {os.environ['FORGE_API_KEY']}"},
    json={"input": "Vérifie les erreurs des 10 dernières minutes"},
    timeout=90,
).json()
print(run["content"], run["meta"]["cost"])`,
    },
    {
      id: 'mcp',
      label: 'MCP',
      code: `// .mcp.json : exposer l’agent comme serveur MCP
{
  "mcpServers": {
    "forge-${agentId}": {
      "type": "http",
      "url": "${host}/v1/agents/${agentId}/mcp",
      "headers": { "Authorization": "Bearer \${FORGE_API_KEY}" }
    }
  }
}`,
    },
  ]
}
