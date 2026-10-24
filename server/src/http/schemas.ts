import { z } from 'zod'
import { isKnownAction } from '../domain/actions'

/** Input schemas. They mirror src/api/types.ts; every string is bounded and every enum closed. */

const str = (max = 200) => z.string().trim().max(max)
const id = z.string().regex(/^[a-z]+_[a-z0-9]+$/i, 'identifiant invalide').max(40)

export const AgentType = z.enum(['conversational', 'autonomous', 'reactive', 'monitoring', 'data', 'content', 'development', 'decision', 'perception', 'orchestrator'])
export const AgentStatus = z.enum(['active', 'paused', 'error', 'draft'])
export const Autonomy = z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple'])
export const ClaudeModel = z.enum(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
export const Role = z.enum(['admin', 'editor', 'viewer'])
export const Channel = z.enum(['widget', 'rest', 'sdk_js', 'sdk_python', 'mcp_server', 'webhook_out'])

export const Trigger = z.object({
  id: str(40),
  kind: z.enum(['message', 'cron', 'webhook', 'db_event', 'file', 'agent']),
  label: str(120),
  config: str(300),
  enabled: z.boolean(),
})

export const ToolGrant = z.object({ connectorId: id, access: z.enum(['read', 'read_write']), enabled: z.boolean() })

const action = str(120).refine(isKnownAction, 'action inconnue du catalogue')

export const Guardrails = z.object({
  promptInjection: z.boolean(),
  piiMasking: z.boolean(),
  humanApproval: z.boolean(),
  forbiddenActions: z.array(str(120)).max(50),
  rateLimitPerMin: z.number().int().min(1).max(600),
})

export const Permissions = z.object({
  allowedActions: z.array(action).max(30),
  roles: z.array(Role).max(3),
  people: z.array(z.email().max(200)).max(50),
})

export const Memory = z.object({ longTerm: z.boolean(), sharedWithProject: z.boolean(), retentionDays: z.number().int().min(1).max(3650) })

export const AgentDraft = z.object({
  name: str(80).min(3),
  mission: str(4000).min(10),
  role: str(120).default(''),
  type: AgentType,
  subcategory: str(80).default(''),
  autonomy: Autonomy,
  model: ClaudeModel,
  tone: str(40),
  language: str(40),
  persona: str(4000).default(''),
  projectIds: z.array(id).max(20),
  triggers: z.array(Trigger).max(20),
  tools: z.array(ToolGrant).max(30),
  capabilities: z.array(str(80)).max(30),
  skillIds: z.array(id).max(50),
  integrations: z.array(Channel).max(6),
  permissions: Permissions,
  guardrails: Guardrails,
  costCapPerDay: z.number().min(0).max(10_000),
  memory: Memory,
})

/** PATCH: any subset of the draft, plus status. `versionNote` publishes a new version. */
export const AgentPatch = AgentDraft.partial().extend({ status: AgentStatus.optional(), versionNote: str(200).optional() })

export const ProjectInput = z.object({ name: str(80).min(2), description: str(1000).default('') })
const EnvConf = z.object({ url: z.union([z.literal(''), z.url().max(300)]), deployed: z.boolean() })
const domain = str(253).regex(/^(localhost|[a-z0-9-]+(\.[a-z0-9-]+)+)(:\d{2,5})?$/i, 'domaine invalide')
export const ProjectPatch = z
  .object({
    name: str(80).min(2),
    description: str(1000),
    stack: z.array(str(40)).max(20),
    environments: z.object({ test: EnvConf, staging: EnvConf, production: EnvConf }),
    allowedDomains: z.array(domain).max(50),
  })
  .partial()

export const SkillInput = z.object({
  name: str(80).min(2),
  description: str(1000).default(''),
  category: z.enum(['reporting', 'alerting', 'analysis', 'content', 'documents', 'search', 'security']),
})

export const Login = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) })
export const Signup = z.object({ name: str(80).min(2), email: z.email().max(200), password: z.string().min(10).max(200) })

export const RunInput = z.object({
  input: str(8000).min(1),
  history: z.array(z.object({ role: z.enum(['user', 'agent', 'system']), content: str(8000) })).max(40).default([]),
  sandbox: z.boolean().default(false),
})

export const SettingsPatch = z
  .object({
    modelRouting: z.object({ simple: ClaudeModel, complex: ClaudeModel, fallback: ClaudeModel }),
    retentionDays: z.number().int().min(1).max(3650),
    anonymizeTraces: z.boolean(),
    monthlyBudget: z.number().min(0).max(1_000_000),
    budgetAlertPct: z.number().int().min(1).max(100),
    killSwitch: z.boolean(),
    gateway: z.object({ costRouting: z.boolean(), fallback: z.boolean(), cache: z.boolean(), logging: z.boolean() }),
    globalGuardrails: z.object({ promptInjection: z.boolean(), piiMasking: z.boolean(), humanApproval: z.boolean(), rateLimit: z.boolean(), forbiddenList: z.boolean() }),
    otelEndpoint: z.union([z.literal(''), z.url().max(300)]),
    notifications: z.record(str(60), z.boolean()),
    notificationChannel: z.enum(['email', 'chat', 'both']),
    instanceUrl: z.url().max(300),
  })
  .partial()

export const WorkflowInput = z.object({
  id: id,
  name: str(120),
  agentId: id,
  published: z.boolean(),
  nodes: z
    .array(
      z.object({
        id: str(40),
        kind: z.enum(['trigger', 'model', 'condition', 'approval', 'tool', 'subagent', 'output']),
        label: str(120),
        x: z.number().min(0).max(10_000),
        y: z.number().min(0).max(10_000),
        retry: z.boolean(),
      }),
    )
    .max(100),
})

export const CreateAgentRequest = z.object({
  brief: str(2000).min(10),
  projectId: id,
  /** Ceiling set by the user: the team can never grant more than this. */
  maxActions: z.array(action).max(30).default([]),
  autonomyCeiling: Autonomy.default('act_after_approval'),
})

export { id as IdSchema, str }
