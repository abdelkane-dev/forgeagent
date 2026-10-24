/**
 * Domain types shared by the console and the API (server/ imports this file).
 * v2: every agent is an isolated space. Everything that belongs to an agent carries `agentId`
 * and is only reachable through /v1/agents/:agentId/… by its members.
 */

export type ID = string
export type ISODate = string

/* ---------- Identity & access ---------- */

/** Role on the platform. Admins maintain the instance; their access to an agent's data is audited in that agent. */
export type PlatformRole = 'admin' | 'member'

/** Role on ONE agent. Being a member of agent A gives nothing on agent B. */
export type AgentRole = 'owner' | 'editor' | 'viewer'

/** Sign-in methods enabled on the instance. signup: first = no account yet (the first becomes admin). */
export interface AuthProviders {
  password: boolean
  github: boolean
  google: boolean
  signup: 'first' | 'open' | 'invite'
  /** Demo accounts still using the seed password (local demos only). */
  demo?: { password: string; accounts: { email: string; label: string }[] } | null
}

export interface User {
  id: ID
  name: string
  email: string
  platformRole: PlatformRole
}

export interface AgentMember {
  userId: ID
  name: string
  email: string
  role: AgentRole
  addedAt: ISODate
  /** Invitation not accepted yet (account created by invitation). */
  invited?: boolean
}

/* ---------- Agents ---------- */

export type AgentType =
  | 'conversational'
  | 'autonomous'
  | 'reactive'
  | 'monitoring'
  | 'data'
  | 'content'
  | 'development'
  | 'decision'
  | 'perception'
  | 'orchestrator'

/** inactive = paused · starting = being built or tested · validated = tests passed, ready · active = in production · error */
export type AgentStatus = 'inactive' | 'starting' | 'active' | 'validated' | 'error'

/** suggest_only → the agent proposes; act_after_approval → human validates; act_alone_simple → autonomous on low-risk actions. */
export type Autonomy = 'suggest_only' | 'act_after_approval' | 'act_alone_simple'

export type ClaudeModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'

export type TriggerKind = 'message' | 'cron' | 'webhook' | 'db_event' | 'file'

export interface Trigger {
  id: ID
  kind: TriggerKind
  label: string
  /** cron expression, webhook path, table name… depending on kind */
  config: string
  enabled: boolean
}

export type AccessLevel = 'read' | 'read_write'

export interface ToolGrant {
  connectorId: ID
  access: AccessLevel
  enabled: boolean
}

export interface Guardrails {
  promptInjection: boolean
  piiMasking: boolean
  humanApproval: boolean
  forbiddenActions: string[]
  rateLimitPerMin: number
}

export interface AgentPermissions {
  allowedActions: string[]
}

export type IntegrationChannel = 'widget' | 'rest' | 'sdk_js' | 'sdk_python' | 'mcp_server' | 'webhook_out'

export interface AgentMetrics {
  runs24h: number
  successRate: number
  costToday: number
  p50LatencyMs: number
  tokens24h: number
}

export interface AgentVersion {
  version: number
  createdAt: ISODate
  author: string
  note: string
  /** Regression score measured before publication, when the agent has evaluation suites. */
  regressionScore?: number | null
}

export interface Agent {
  id: ID
  name: string
  mission: string
  role: string
  type: AgentType
  subcategory: string
  status: AgentStatus
  autonomy: Autonomy
  model: ClaudeModel
  version: number
  versions: AgentVersion[]
  tone: string
  language: string
  persona: string
  projectIds: ID[]
  triggers: Trigger[]
  tools: ToolGrant[]
  capabilities: string[]
  skillIds: ID[]
  integrations: IntegrationChannel[]
  permissions: AgentPermissions
  guardrails: Guardrails
  /** Budgets of this agent only. */
  costCapPerDay: number
  monthlyBudget: number
  /** Origins allowed to embed this agent's widget (CORS). */
  allowedOrigins: string[]
  memory: { longTerm: boolean; shortTermTurns: number; retentionDays: number }
  metrics: AgentMetrics
  /** Role of the current user on this agent. */
  myRole: AgentRole
  createdAt: ISODate
  updatedAt: ISODate
}

export interface AgentDraft {
  name: string
  mission: string
  role: string
  type: AgentType
  subcategory: string
  autonomy: Autonomy
  model: ClaudeModel
  tone: string
  language: string
  persona: string
  projectIds: ID[]
  triggers: Trigger[]
  tools: ToolGrant[]
  capabilities: string[]
  skillIds: ID[]
  integrations: IntegrationChannel[]
  permissions: AgentPermissions
  guardrails: Guardrails
  costCapPerDay: number
  monthlyBudget: number
  allowedOrigins: string[]
  memory: { longTerm: boolean; shortTermTurns: number; retentionDays: number }
  /** Initial members besides the creator (who becomes owner). Existing accounts only. */
  members?: { email: string; role: AgentRole }[]
}

/* ---------- Platform catalogues (shared, contain no agent data) ---------- */

export type Environment = 'test' | 'staging' | 'production'

export interface Project {
  id: ID
  name: string
  slug: string
  description: string
  stack: string[]
  environments: Record<Environment, { url: string; deployed: boolean }>
  createdAt: ISODate
}

export interface Skill {
  id: ID
  name: string
  description: string
  category: 'reporting' | 'alerting' | 'analysis' | 'content' | 'documents' | 'search' | 'security'
  version: string
  author: string
  builtin: boolean
}

/** A connector type. Credentials are never here: they are secrets of each agent. */
export interface Connector {
  id: ID
  name: string
  kind: 'mcp'
  description: string
  enabled: boolean
  endpoint: string
}

export interface Template {
  id: ID
  name: string
  type: AgentType
  description: string
  capabilities: string[]
}

export interface PlatformSettings {
  killSwitch: boolean
  globalGuardrails: { promptInjection: boolean; piiMasking: boolean; humanApproval: boolean; rateLimit: boolean }
  defaultModel: ClaudeModel
  retentionDays: number
  instanceUrl: string
  anthropicKeySet: boolean
  embeddings: string
  storage: string
}

export interface Notification {
  id: ID
  agentId: ID | null
  title: string
  body: string
  href: string
  read: boolean
  at: ISODate
}

/* ---------- Agent space: knowledge & memory ---------- */

export interface KnowledgeDoc {
  id: ID
  agentId: ID
  name: string
  kind: 'pdf' | 'docx' | 'website' | 'markdown' | 'text'
  size: string
  status: 'indexed' | 'indexing' | 'failed'
  chunks: number
  error?: string | null
  /** File stored under agents/<agentId>/… in object storage. */
  hasFile: boolean
  createdAt: ISODate
}

export interface KnowledgeHit {
  docId: ID
  docName: string
  chunk: string
  score: number
}

export interface MemoryItem {
  id: ID
  agentId: ID
  kind: 'short' | 'long'
  text: string
  sessionId?: string | null
  createdAt: ISODate
}

/* ---------- Agent space: integration ---------- */

export interface ExternalSite {
  url: string
  status: 'connected' | 'pending' | 'unreachable'
  lastPingAt: ISODate | null
  latencyMs: number | null
  allowedOrigins: string[]
}

export interface AgentIntegration {
  id: ID
  agentId: ID
  kind: 'website' | 'app' | 'service'
  name: string
  url: string
  environment: 'test' | 'production'
  status: 'connected' | 'pending' | 'unreachable'
  lastCheckAt: ISODate | null
  latencyMs: number | null
  /** Name of the agent secret holding this integration's credentials, if any. */
  secretName: string | null
}

export interface AgentSecret {
  id: ID
  agentId: ID
  name: string
  createdAt: ISODate
  lastUsedAt: ISODate | null
}

export interface ApiKey {
  id: ID
  agentId: ID
  name: string
  prefix: string
  environment: 'live' | 'test'
  /** secret: server-to-server (Bearer). publishable: widget key, limited to this agent's allowed origins. */
  scope: 'secret' | 'publishable'
  createdAt: ISODate
  lastUsedAt: ISODate | null
}

export interface Webhook {
  id: ID
  agentId: ID
  url: string
  events: string[]
  enabled: boolean
}

/* ---------- Agent space: test & evaluation ---------- */

export interface EvalSuite {
  id: ID
  agentId: ID
  name: string
  cases: number
  /** Run before every new version is published. */
  regression: boolean
  lastScore: number | null
  lastRunAt: ISODate | null
}

export interface EvalCase {
  id: ID
  suiteId: ID
  input: string
  /** Keywords (comma separated) the answer must contain. */
  expect: string
}

export interface EvalRun {
  id: ID
  agentId: ID
  suiteId: ID
  version: number
  kind: 'manual' | 'regression' | 'team'
  score: number
  passed: number
  total: number
  at: ISODate
  results: { caseId: ID; input: string; passed: boolean; output: string }[]
}

export interface CheckResult {
  id: string
  label: string
  status: 'pending' | 'ok' | 'warn' | 'fail'
  detail: string
}

/* ---------- Agent space: workflows ---------- */

export type WorkflowNodeKind = 'trigger' | 'model' | 'condition' | 'approval' | 'tool' | 'output'

export interface WorkflowNode {
  id: ID
  kind: WorkflowNodeKind
  label: string
  /** model: instruction; condition: keyword; tool: tool name; output: message template */
  config?: string
  x: number
  y: number
  retry: boolean
}

export interface Workflow {
  id: ID
  agentId: ID
  name: string
  version: number
  published: boolean
  trigger: { kind: 'manual' | 'cron' | 'webhook'; config: string }
  nodes: WorkflowNode[]
  updatedAt: ISODate
}

export interface WorkflowRun {
  id: ID
  agentId: ID
  workflowId: ID
  version: number
  status: 'running' | 'ok' | 'error' | 'waiting_approval'
  trigger: string
  startedAt: ISODate
  durationMs: number
  steps: { nodeId: ID; label: string; status: 'ok' | 'error' | 'skipped' | 'waiting'; attempts: number; output: string }[]
}

/* ---------- Agent space: activity, audit, costs, docs ---------- */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: ID
  at: ISODate
  agentId: ID
  level: LogLevel
  message: string
  environment?: 'test' | 'production'
  traceId?: ID
}

export interface Span {
  id: ID
  name: string
  kind: 'trigger' | 'model' | 'tool' | 'approval' | 'output'
  startMs: number
  durationMs: number
  detail?: string
}

export interface Trace {
  id: ID
  agentId: ID
  at: ISODate
  durationMs: number
  tokens: number
  cost: number
  status: 'ok' | 'error' | 'blocked' | 'running'
  environment: 'test' | 'production'
  input: string
  spans: Span[]
}

export interface Approval {
  id: ID
  agentId: ID
  /** agent = action proposed by the agent; team = decision requested by the internal team; workflow = approval step */
  source: 'agent' | 'team' | 'workflow'
  requestId?: ID
  action: string
  reason: string
  risk: 'low' | 'medium' | 'high'
  requestedAt: ISODate
}

export interface AuditEntry {
  id: ID
  agentId: ID
  at: ISODate
  actor: string
  actorType: 'user' | 'agent' | 'team' | 'system' | 'platform'
  action: string
  target: string
  result: 'ok' | 'refused' | 'error' | null
}

export interface UsageSummary {
  agentId: ID
  today: number
  month: number
  budget: { daily: number; monthly: number }
  runs: { today: number; month: number }
  avgCostPerRun: number
  byModel: { model: string; tokens: number; cost: number }[]
  bySource: { source: 'run' | 'team' | 'eval' | 'workflow' | 'embedding'; cost: number; tokens: number }[]
  byDay: { day: string; cost: number; runs: number }[]
}

export interface AgentDoc {
  agentId: ID
  version: number
  markdown: string
  generatedAt: ISODate
}

export interface ChatMessage {
  role: 'user' | 'agent' | 'system'
  content: string
  toolCalls?: { name: string; args: string; result: string }[]
  meta?: { durationMs: number; tokens: number; cost: number }
}

/* ---------- Dashboard (only the user's agents) ---------- */

export interface Overview {
  agents: number
  activeAgents: number
  runs24h: number
  costToday: number
  successRate: number
  p50LatencyMs: number
  pendingApprovals: number
  runsByDay: { day: string; runs: number; errors: number }[]
}

/* ---------- Internal team (La Forge) ---------- */

export type TeamRole = 'orchestrator' | 'architect' | 'builder' | 'security' | 'tester' | 'supervisor'

export interface TeamAgentInfo {
  role: TeamRole
  model: string
  /** Supervisor only: model used when an anomaly is detected. */
  escalationModel: string | null
  /** Server capabilities this role can use (least privilege). */
  capabilities: string[]
  status: 'idle' | 'queued' | 'working'
  /** Current task, only if it targets one of the user's agents. */
  currentTask: { requestId: ID; agentId: ID; agentName: string; startedAt: ISODate | null } | null
  tasksDone: number
  tasksFailed: number
  tokens: number
  cost: number
  lastActivityAt: ISODate | null
}

export type TeamRequestStatus = 'running' | 'awaiting_approval' | 'done' | 'failed' | 'vetoed' | 'stopped'

export interface TeamRequest {
  id: ID
  /** The single agent this request works on. */
  agentId: ID
  agentName: string
  kind: 'create_agent' | 'supervise'
  input: Record<string, unknown>
  status: TeamRequestStatus
  result: Record<string, unknown> | null
  error: string | null
  steps: number
  agentCalls: number
  tokens: number
  cost: number
  createdBy: ID | null
  createdAt: ISODate
  finishedAt: ISODate | null
}

export interface TeamTask {
  id: ID
  requestId: ID
  agentId: ID
  parentId: ID | null
  role: TeamRole
  status: 'queued' | 'running' | 'done' | 'failed' | 'vetoed' | 'cancelled'
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  tokens: number
  cost: number
  durationMs: number
  model: string | null
  error: string | null
  createdAt: ISODate
  startedAt: ISODate | null
  finishedAt: ISODate | null
}

export interface TeamEvent {
  id: number
  requestId: ID
  agentId: ID
  taskId: ID | null
  at: ISODate
  fromRole: string
  toRole: string | null
  type: string
  payload: Record<string, unknown> | null
}

export interface CreateAgentRequestInput {
  brief: string
  projectId: ID
  maxActions: string[]
  autonomyCeiling: Autonomy
}

/** Platform admin view of an agent: metadata only, never its data. */
export interface AdminAgentRow {
  id: ID
  name: string
  status: AgentStatus
  owners: string[]
  members: number
  createdAt: ISODate
}

/** Platform account, as the platform admin sees it. */
export interface AdminUser {
  id: ID
  name: string
  email: string
  platformRole: PlatformRole
  invited: boolean
  lastActiveAt: ISODate
}

export interface PlatformAuditEntry {
  id: ID
  at: ISODate
  actor: string
  action: string
  target: string
}

export interface AgentDocs {
  current: AgentDoc | null
  history: { version: number; generatedAt: ISODate }[]
}

export interface IntegrationInput {
  kind: AgentIntegration['kind']
  name: string
  url: string
  environment: 'test' | 'production'
  secretName?: string | null
}
