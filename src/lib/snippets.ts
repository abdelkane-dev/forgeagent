import type { Snippet } from '@/components/common/code-block'

/** Integration snippets for one agent. `host` is the self-hosted ForgeAgent instance. */
export function agentSnippets(agentId: string, projectSlug = 'bonaco-pro', host = 'https://forge.votre-domaine.dev'): Snippet[] {
  return [
    {
      id: 'widget',
      label: 'Widget',
      code: `<!-- Avant </body>. Domaines autorisés : Projets › Domaines -->
<script
  src="${host}/widget.js"
  data-agent="${agentId}"
  data-project="${projectSlug}"
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
      code: `import { ForgeAgent } from "@forgeagent/sdk"

const forge = new ForgeAgent({ apiKey: process.env.FORGE_API_KEY, baseUrl: "${host}" })

const run = await forge.agents.run("${agentId}", {
  input: "Vérifie les erreurs des 10 dernières minutes",
})
console.log(run.output, run.cost)`,
    },
    {
      id: 'python',
      label: 'Python',
      code: `from forgeagent import ForgeAgent

forge = ForgeAgent(api_key=os.environ["FORGE_API_KEY"], base_url="${host}")
run = forge.agents.run("${agentId}", input="Vérifie les erreurs des 10 dernières minutes")
print(run.output, run.cost)`,
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
