import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '.'
import type { ID, LogLevel } from './types'

/** React Query bindings for ForgeApi. Screens use these hooks, never `api` directly for reads. */

export const keys = {
  overview: ['overview'],
  agents: ['agents'],
  agent: (id: ID) => ['agents', id],
  projects: ['projects'],
  project: (id: ID) => ['projects', id],
  skills: ['skills'],
  connectors: ['connectors'],
  traces: (agentId?: ID) => ['traces', agentId ?? 'all'],
  trace: (id: ID) => ['trace', id],
  logs: (agentId?: ID, level?: LogLevel) => ['logs', agentId ?? 'all', level ?? 'all'],
  approvals: ['approvals'],
  audit: ['audit'],
  evals: ['evals'],
  knowledge: ['knowledge'],
  memories: (agentId?: ID) => ['memories', agentId ?? 'all'],
  templates: ['templates'],
  team: ['team'],
  apiKeys: ['apiKeys'],
  webhooks: ['webhooks'],
  notifications: ['notifications'],
  workflows: ['workflows'],
  delegations: ['delegations'],
  schedules: ['schedules'],
  settings: ['settings'],
} as const

export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: api.overview.get })
export const useAgents = () => useQuery({ queryKey: keys.agents, queryFn: api.agents.list })
export const useAgent = (id: ID) => useQuery({ queryKey: keys.agent(id), queryFn: () => api.agents.get(id) })
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects.list })
export const useProject = (id: ID) => useQuery({ queryKey: keys.project(id), queryFn: () => api.projects.get(id) })
export const useSkills = () => useQuery({ queryKey: keys.skills, queryFn: api.skills.list })
export const useConnectors = () => useQuery({ queryKey: keys.connectors, queryFn: api.connectors.list })
export const useTraces = (agentId?: ID) =>
  useQuery({ queryKey: keys.traces(agentId), queryFn: () => api.traces.list({ agentId }) })
export const useLogs = (agentId?: ID, level?: LogLevel) =>
  useQuery({ queryKey: keys.logs(agentId, level), queryFn: () => api.logs.list({ agentId, level }) })
export const useApprovals = () => useQuery({ queryKey: keys.approvals, queryFn: api.approvals.list })
export const useAudit = () => useQuery({ queryKey: keys.audit, queryFn: api.audit.list })
export const useEvals = () => useQuery({ queryKey: keys.evals, queryFn: api.evals.list })
export const useKnowledge = () =>
  useQuery({
    queryKey: keys.knowledge,
    queryFn: api.knowledge.list,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'indexing') ? 1200 : false),
  })
export const useMemories = (agentId?: ID) =>
  useQuery({ queryKey: keys.memories(agentId), queryFn: () => api.memories.list(agentId) })
export const useTemplates = () => useQuery({ queryKey: keys.templates, queryFn: api.templates.list })
export const useTeam = () => useQuery({ queryKey: keys.team, queryFn: api.team.list })
export const useApiKeys = () => useQuery({ queryKey: keys.apiKeys, queryFn: api.apiKeys.list })
export const useWebhooks = () => useQuery({ queryKey: keys.webhooks, queryFn: api.webhooks.list })
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: api.notifications.list })
export const useWorkflows = () => useQuery({ queryKey: keys.workflows, queryFn: api.workflows.list })
export const useDelegations = () => useQuery({ queryKey: keys.delegations, queryFn: api.delegations.list })
export const useSchedules = () => useQuery({ queryKey: keys.schedules, queryFn: api.schedules.list })
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: api.settings.get })

/**
 * Mutation helper: invalidates the given keys on success, shows a toast,
 * and reports errors in a toast so no screen fails silently.
 */
export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: {
    invalidate?: QueryKey[]
    success?: string | ((r: TResult, a: TArgs) => string)
    onSuccess?: (r: TResult, a: TArgs) => void
  } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, a) => {
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }))
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r, a) : opts.success)
      opts.onSuccess?.(r, a)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action impossible'),
  })
}
