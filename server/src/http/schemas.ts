import { z } from 'zod'
import { isKnownAction } from '../domain/actions'

/** Input schemas. They mirror src/api/types.ts; every string is bounded and every enum closed. */

const str = (max = 200) => z.string().trim().max(max)
const id = z.string().regex(/^[a-z]+_[a-z0-9]+$/i, 'identifiant invalide').max(40)

export const AgentType = z.enum(['conversational', 'autonomous', 'reactive', 'monitoring', 'data', 'content', 'development', 'decision', 'perception', 'orchestrator'])
export const AgentStatus = z.enum(['inactive', 'starting', 'active', 'validated', 'error'])
export const Autonomy = z.enum(['suggest_only', 'act_after_approval', 'act_alone_simple'])
export const ClaudeModel = z.enum(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'])
export const AgentRole = z.enum(['owner', 'editor', 'viewer'])
export const PlatformRole = z.enum(['admin', 'member'])
export const Channel = z.enum(['widget', 'rest', 'sdk_js', 'sdk_python', 'mcp_server', 'webhook_out'])

export const Trigger = z.object({
  id: str(40),
  kind: z.enum(['message', 'cron', 'webhook', 'db_event', 'file']),
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

export const Permissions = z.object({ allowedActions: z.array(action).max(30) })

export const Memory = z.object({ longTerm: z.boolean(), shortTermTurns: z.number().int().min(0).max(50), retentionDays: z.number().int().min(1).max(3650) })

const origin = z.string().trim().max(300).regex(/^https?:\/\/[a-z0-9.-]+(:\d{2,5})?$/i, 'origine invalide (https://domaine[:port])')

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
  monthlyBudget: z.number().min(0).max(1_000_000).default(300),
  allowedOrigins: z.array(origin).max(30).default([]),
  memory: Memory,
  members: z.array(z.object({ email: z.email().max(200), role: AgentRole })).max(20).optional(),
})

/** PATCH: any subset of the draft. `versionNote` publishes a new version (after the regression gate). */
export const AgentPatch = AgentDraft.omit({ members: true }).partial().extend({ versionNote: str(200).optional() })

export const ProjectInput = z.object({ name: str(80).min(2), description: str(1000).default('') })
const EnvConf = z.object({ url: z.union([z.literal(''), z.url().max(300)]), deployed: z.boolean() })
export const ProjectPatch = z
  .object({
    name: str(80).min(2),
    description: str(1000),
    stack: z.array(str(40)).max(20),
    environments: z.object({ test: EnvConf, staging: EnvConf, production: EnvConf }),
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
  /** test = sandbox environment (simulated tools, not budgeted). */
  environment: z.enum(['test', 'production']).default('production'),
  sessionId: str(80).optional(),
})

export const SettingsPatch = z
  .object({
    killSwitch: z.boolean(),
    globalGuardrails: z.object({ promptInjection: z.boolean(), piiMasking: z.boolean(), humanApproval: z.boolean(), rateLimit: z.boolean() }),
    defaultModel: ClaudeModel,
    retentionDays: z.number().int().min(1).max(3650),
    instanceUrl: z.url().max(300),
  })
  .partial()

export const WorkflowInput = z.object({
  id: id.optional(),
  name: str(120).min(2),
  published: z.boolean(),
  trigger: z.object({ kind: z.enum(['manual', 'cron', 'webhook']), config: str(200) }),
  nodes: z
    .array(
      z.object({
        id: str(40),
        kind: z.enum(['trigger', 'model', 'condition', 'approval', 'tool', 'output']),
        label: str(120),
        config: str(2000).optional(),
        x: z.number().min(0).max(10_000),
        y: z.number().min(0).max(10_000),
        retry: z.boolean(),
      }),
    )
    .max(100),
})

const secretName = z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'nom en MAJUSCULES_AVEC_TIRETS_BAS')

export const MemberInput = z.object({ email: z.email().max(200), role: AgentRole })
export const KeyInput = z.object({ name: str(80).min(2), environment: z.enum(['live', 'test']), scope: z.enum(['secret', 'publishable']).default('secret') })
export const SecretInput = z.object({ name: secretName, value: z.string().min(1).max(8000) })
export const IntegrationInput = z.object({
  kind: z.enum(['website', 'app', 'service']),
  name: str(80).min(2),
  url: z.url().max(300),
  environment: z.enum(['test', 'production']),
  secretName: secretName.nullable().optional(),
})
export const WebhookInput = z.object({ url: z.url().max(300), events: z.array(z.enum(['run.completed', 'run.failed', 'approval.requested', 'approval.resolved', 'agent.updated', 'workflow.completed'])).min(1).max(10) })
export const KnowledgeInput = z.object({
  name: str(300).min(1),
  kind: z.enum(['pdf', 'docx', 'website', 'markdown', 'text']),
  /** Plain text content (markdown, text) or URL (website). */
  content: z.string().max(200_000).optional(),
  /** Uploaded file, base64 (stored under agents/<agentId>/ in object storage). */
  file: z.string().max(14_000_000).optional(),
})
export const EvalCaseInput = z.object({ input: str(4000).min(1), expect: str(500) })
export const SuiteInput = z.object({ name: str(120).min(2), regression: z.boolean().default(true), cases: z.array(EvalCaseInput).max(50).default([]) })

export const CreateAgentRequest = z.object({
  brief: str(4000).min(10),
  projectId: id,
  /** Ceiling set by the user: the team can never grant more than this. */
  maxActions: z.array(action).max(30).default([]),
  autonomyCeiling: Autonomy.default('act_after_approval'),
})

export { id as IdSchema, str }
