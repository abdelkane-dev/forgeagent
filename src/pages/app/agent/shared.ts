import { api } from '@/api'
import { keys, useAction } from '@/api/hooks'
import type { Agent, AgentDraft, AgentRole } from '@/api/types'

const RANK: Record<AgentRole, number> = { viewer: 0, editor: 1, owner: 2 }

/** Same rule as the server: the role on THIS agent decides. The UI only hides what the API would refuse. */
export const can = (agent: Agent, min: AgentRole) => RANK[agent.myRole] >= RANK[min]

/** Patches the agent. Pass a note to publish a new version (regression suites run first). */
export function useUpdate(agent: Agent) {
  return useAction(({ patch, note }: { patch: Partial<AgentDraft>; note?: string }) => api.agents.update(agent.id, patch, note), {
    invalidate: [keys.agent(agent.id), keys.agents, keys.of(agent.id, 'docs'), keys.of(agent.id, 'audit')],
    success: (a, v) => (v.note !== undefined ? `v${a.version} publiée` : 'Modification enregistrée'),
  })
}

/** One base64 string from a File (knowledge uploads). */
export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
