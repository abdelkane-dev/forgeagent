import type { Role } from '@shared/types'

/**
 * Role matrix: the same one the console shows in Équipe et accès.
 * Deterministic and code-only: no model is ever asked whether something is allowed.
 */
export type Permission =
  | 'agents.write'
  | 'agents.run'
  | 'deploy'
  | 'approvals.resolve'
  | 'keys.manage'
  | 'team.manage'
  | 'killswitch'
  | 'settings.write'
  | 'projects.write'
  | 'skills.write'
  | 'sensitive.grant'

const MATRIX: Record<Permission, Role[]> = {
  'agents.write': ['admin', 'editor'],
  'agents.run': ['admin', 'editor', 'viewer'],
  deploy: ['admin', 'editor'],
  'approvals.resolve': ['admin'],
  'keys.manage': ['admin'],
  'team.manage': ['admin'],
  killswitch: ['admin', 'editor'],
  'settings.write': ['admin'],
  'projects.write': ['admin', 'editor'],
  'skills.write': ['admin', 'editor'],
  /** Granting a sensitive action to an agent. Editors can only grant non-sensitive ones. */
  'sensitive.grant': ['admin'],
}

export const can = (role: Role, p: Permission) => MATRIX[p].includes(role)
