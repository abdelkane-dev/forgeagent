import type { ReactNode } from 'react'
import type { Agent, AgentRole } from '@/api/types'
import { AGENT_ROLES } from '@/labels'
import { can } from './shared'

/** Shown instead of a form when the role on this agent does not allow it. */
export function RoleNote({ agent, min, children }: { agent: Agent; min: AgentRole; children?: ReactNode }) {
  if (can(agent, min)) return null
  return (
    <p className="mb-4 rounded-md bg-secondary/60 px-3 py-2 text-[13.5px] text-muted-foreground">
      {children ?? `Réservé au rôle ${AGENT_ROLES[min].label.toLowerCase()} ou plus.`} Votre rôle sur cet agent : {AGENT_ROLES[agent.myRole].label}.
    </p>
  )
}

