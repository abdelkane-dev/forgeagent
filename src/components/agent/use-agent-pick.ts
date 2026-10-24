import { useSearchParams } from 'react-router'
import { useAgents } from '@/api/hooks'

/** Picks ONE of the user's agents (kept in ?agent=). Pages then work in that agent's space only. */
export function useAgentPick() {
  const agents = useAgents()
  const [params, setParams] = useSearchParams()
  const id = params.get('agent')
  const agent = agents.data?.find((a) => a.id === id) ?? agents.data?.[0] ?? null
  return { agents, agent, select: (agentId: string) => setParams({ agent: agentId }) }
}
