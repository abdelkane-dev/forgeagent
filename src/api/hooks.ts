import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '.'
import type { ID, LogLevel } from './types'

/**
 * React Query bindings for ForgeApi. Screens use these hooks, never `api` directly for reads.
 * Every agent's data is cached under ['agent', agentId, …]: invalidating one agent never touches another.
 */

export const keys = {
  me: ['me'],
  overview: ['overview'],
  myApprovals: ['approvals', 'mine'],
  agents: ['agents'],
  agent: (id: ID) => ['agent', id] as const,
  of: (id: ID, what: string, ...rest: (string | undefined)[]) => ['agent', id, what, ...rest] as const,
  projects: ['projects'],
  project: (id: ID) => ['projects', id],
  skills: ['skills'],
  connectors: ['connectors'],
  templates: ['templates'],
  notifications: ['notifications'],
  platform: ['platform', 'settings'],
  forge: ['forge'],
  admin: (what: string) => ['admin', what],
} as const

const useAgentQuery = <T,>(id: ID | undefined, what: string, fn: (id: ID) => Promise<T>, extra: (string | undefined)[] = [], opts: { refetchInterval?: number | false } = {}) =>
  useQuery({ queryKey: keys.of(id ?? '', what, ...extra), queryFn: () => fn(id!), enabled: !!id, ...opts })

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.auth.me, retry: false, staleTime: 60_000 })
export const useOverview = () => useQuery({ queryKey: keys.overview, queryFn: api.overview.get })
export const useMyApprovals = () => useQuery({ queryKey: keys.myApprovals, queryFn: api.approvals.mine })
export const useAgents = () => useQuery({ queryKey: keys.agents, queryFn: api.agents.list })
export const useAgent = (id: ID | undefined) =>
  useQuery({
    queryKey: keys.agent(id ?? ''),
    queryFn: () => api.agents.get(id!),
    enabled: !!id,
    retry: false,
    // While La Forge builds the agent, follow its state live.
    refetchInterval: (q) => (q.state.data?.status === 'starting' ? 2000 : false),
  })

export const useMembers = (id?: ID) => useAgentQuery(id, 'members', api.members.list)
export const useKeys = (id?: ID) => useAgentQuery(id, 'keys', api.keys.list)
export const useSecrets = (id?: ID) => useAgentQuery(id, 'secrets', api.secrets.list)
export const useIntegrations = (id?: ID) => useAgentQuery(id, 'integrations', api.integrations.list)
export const useWebhooks = (id?: ID) => useAgentQuery(id, 'webhooks', api.webhooks.list)
export const useKnowledge = (id?: ID) =>
  useQuery({
    queryKey: keys.of(id ?? '', 'knowledge'),
    queryFn: () => api.knowledge.list(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'indexing') ? 1200 : false),
  })
export const useMemories = (id?: ID) => useAgentQuery(id, 'memories', api.memories.list)
export const useEvalSuites = (id?: ID) => useAgentQuery(id, 'evals', api.evals.suites)
export const useEvalCases = (id: ID | undefined, suiteId: ID | undefined) =>
  useQuery({ queryKey: keys.of(id ?? '', 'evals', 'cases', suiteId), queryFn: () => api.evals.cases(id!, suiteId!), enabled: !!id && !!suiteId })
export const useEvalRuns = (id?: ID, suiteId?: ID) => useAgentQuery(id, 'evals', (a) => api.evals.runs(a, suiteId), ['runs', suiteId])
export const useWorkflows = (id?: ID) => useAgentQuery(id, 'workflows', api.workflows.list)
export const useWorkflowRuns = (id?: ID) => useAgentQuery(id, 'workflows', (a) => api.workflows.runs(a), ['runs'], { refetchInterval: 4000 })
export const useAudit = (id?: ID) => useAgentQuery(id, 'audit', api.audit.list)
export const useUsage = (id?: ID) => useAgentQuery(id, 'usage', api.usage.get)
export const useDocs = (id?: ID) => useAgentQuery(id, 'docs', api.docs.get)
export const useLogs = (id?: ID, level?: LogLevel) => useAgentQuery(id, 'logs', (a) => api.logs.list(a, { level }), [level])
export const useTraces = (id?: ID) => useAgentQuery(id, 'traces', api.traces.list)
export const useAgentApprovals = (id?: ID) => useAgentQuery(id, 'approvals', api.approvals.list)
export const useAgentRequests = (id?: ID) => useAgentQuery(id, 'forge', api.forge.agentRequests, [], { refetchInterval: 3000 })

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects.list })
export const useProject = (id: ID) => useQuery({ queryKey: keys.project(id), queryFn: () => api.projects.get(id) })
export const useSkills = () => useQuery({ queryKey: keys.skills, queryFn: api.skills.list })
export const useConnectors = () => useQuery({ queryKey: keys.connectors, queryFn: api.connectors.list })
export const useTemplates = () => useQuery({ queryKey: keys.templates, queryFn: api.templates.list })
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: api.notifications.list })
export const usePlatformSettings = () => useQuery({ queryKey: keys.platform, queryFn: api.platform.settings })

export const useForgeAgents = () => useQuery({ queryKey: [...keys.forge, 'agents'], queryFn: api.forge.agents, refetchInterval: 3000 })
export const useForgeRequests = () => useQuery({ queryKey: [...keys.forge, 'requests'], queryFn: api.forge.requests, refetchInterval: 3000 })
export const useForgeRequest = (agentId: ID | null, requestId: ID | null) =>
  useQuery({
    queryKey: [...keys.forge, 'request', agentId, requestId],
    queryFn: () => api.forge.request(agentId!, requestId!),
    enabled: !!agentId && !!requestId,
    refetchInterval: (q) => (q.state.data?.request.status === 'running' ? 1000 : false),
  })

export const useAdminUsers = () => useQuery({ queryKey: keys.admin('users'), queryFn: api.admin.users })
export const useAdminAgents = () => useQuery({ queryKey: keys.admin('agents'), queryFn: api.admin.agents })
export const useAdminAudit = () => useQuery({ queryKey: keys.admin('audit'), queryFn: api.admin.audit })

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
