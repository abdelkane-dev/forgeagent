import type { Agent } from '@/api/types'
import { NativeSelect } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { AGENT_ROLES, L, STATUS } from '@/labels'
import type { useAgentPick } from './use-agent-pick'

export function AgentPicker({ value, agents, onChange }: { value: Agent; agents: Agent[]; onChange: (id: string) => void }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-3">
      <label htmlFor="pick-agent" className="text-[14px] font-medium">
        Agent
      </label>
      <NativeSelect id="pick-agent" className="w-80 max-w-full" value={value.id} onChange={(e) => onChange(e.target.value)}>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {STATUS[a.status].label} · {AGENT_ROLES[a.myRole].label}
          </option>
        ))}
      </NativeSelect>
      <LinkButton to={`/app/agents/${value.id}`} variant="ghost" size="sm">
        Ouvrir son espace
      </LinkButton>
    </div>
  )
}

/** Shared states of the pick: loading, no agent yet. */
export function PickGate({ pick, children }: { pick: ReturnType<typeof useAgentPick>; children: (a: Agent) => React.ReactNode }) {
  if (pick.agents.isPending) return <LoadingBlock />
  if (!pick.agent)
    return <EmptyState title="Aucun agent" description="Vous n’êtes membre d’aucun agent pour l’instant." action={<LinkButton to="/app/agents/new">{L.action.createAgent}</LinkButton>} />
  return (
    <>
      <AgentPicker value={pick.agent} agents={pick.agents.data ?? []} onChange={pick.select} />
      {children(pick.agent)}
    </>
  )
}
