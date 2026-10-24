/**
 * Domain types shared by the UI and the API layer.
 * The real back-end must return these shapes (see README > "Brancher le back-end").
 */

export type ID = string
export type ISODate = string

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

export type AgentStatus = 'active' | 'paused' | 'error' | 'draft'

/** suggest_only → the agent proposes; act_after_approval → human validates; act_alone_simple → autonomous on low-risk actions. */
export type Autonomy = 'suggest_only' | 'act_after_approval' | 'act_alone_simple'

export type ClaudeModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5' | 'claude-opus-5-5'

export type TriggerKind = 'message' | 'cron' | 'webhook' | 'db_event' | 'file' | 'agent'

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
  roles: Role[]
  people: string[]
}

export type IntegrationChannel = 'widget' | 'rest' | 'sdk_js' | 'sdk_python' | 'mcp_server' | 'webhook_out'

export interface ExternalSite {
  url: string
  status: 'connected' | 'pending' | 'unreachable'
  lastPingAt: ISODate | null
  latencyMs: number | null
  allowedOrigins: string[]
}

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
  costCapPerDay: number
  memory: { longTerm: boolean; sharedWithProject: boolean; retentionDays: number }
  externalSite: ExternalSite | null
  metrics: AgentMetrics
  createdAt: ISODate
  updatedAt: ISODate
}

export type AgentDraft = Omit<
  Agent,
  'id' | 'status' | 'version' | 'versions' | 'metrics' | 'createdAt' | 'updatedAt' | 'externalSite'
>

export type Environment = 'test' | 'staging' | 'production'

export interface Project {
  id: ID
  name: string
  slug: string
  description: string
  stack: string[]
  environments: Record<Environment, { url: string; deployed: boolean }>
  allowedDomains: string[]
  createdAt: ISODate
}

export interface Skill {
  id: ID
  name: string
  description: string
  category: 'reporting' | 'alerting' | 'analysis' | 'content' | 'documents' | 'search' | 'security'
  version: string
  author: string
  installs: number
  builtin: boolean
}

export interface Connector {
  id: ID
  name: string
  kind: 'mcp'
  description: string
  enabled: boolean
  endpoint: string
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  id: ID
  at: ISODate
  agentId: ID
  level: LogLevel
  message: string
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
  status: 'ok' | 'error'
  input: string
  spans: Span[]
}

export interface Approval {
  id: ID
  agentId: ID
  action: string
  reason: string
  risk: 'low' | 'medium' | 'high'
  requestedAt: ISODate
}

export interface AuditEntry {
  id: ID
  at: ISODate
  actor: string
  action: string
  target: string
}

export interface EvalSuite {
  id: ID
  name: string
  agentId: ID
  cases: number
  lastScore: number | null
  lastRunAt: ISODate | null
}

export interface KnowledgeDoc {
  id: ID
  name: string
  kind: 'pdf' | 'docx' | 'website' | 'markdown'
  size: string
  status: 'indexed' | 'indexing' | 'failed'
  chunks: number
}

export interface MemoryItem {
  id: ID
  agentId: ID
  text: string
  createdAt: ISODate
}

export interface Template {
  id: ID
  name: string
  type: AgentType
  description: string
  capabilities: string[]
}

export type Role = 'admin' | 'editor' | 'viewer'

export interface TeamMember {
  id: ID
  name: string
  email: string
  role: Role
  lastActiveAt: ISODate
}

export interface ApiKey {
  id: ID
  name: string
  prefix: string
  environment: 'live' | 'test'
  createdAt: ISODate
  lastUsedAt: ISODate | null
}

export interface Webhook {
  id: ID
  url: string
  events: string[]
  enabled: boolean
}

export interface Notification {
  id: ID
  title: string
  body: string
  href: string
  read: boolean
  at: ISODate
}

export type WorkflowNodeKind = 'trigger' | 'model' | 'condition' | 'approval' | 'tool' | 'subagent' | 'output'

export interface WorkflowNode {
  id: ID
  kind: WorkflowNodeKind
  label: string
  x: number
  y: number
  retry: boolean
}

export interface Workflow {
  id: ID
  name: string
  agentId: ID
  nodes: WorkflowNode[]
  published: boolean
}

export interface Delegation {
  id: ID
  fromAgentId: ID
  toAgentId: ID
  enabled: boolean
}

export interface Schedule {
  id: ID
  agentId: ID
  cron: string
  label: string
  enabled: boolean
}

export interface Overview {
  activeAgents: number
  runs24h: number
  costToday: number
  successRate: number
  p50LatencyMs: number
  runsByDay: { day: string; runs: number; errors: number }[]
}

export interface Settings {
  modelRouting: { simple: ClaudeModel; complex: ClaudeModel; fallback: ClaudeModel }
  retentionDays: number
  anonymizeTraces: boolean
  monthlyBudget: number
  budgetAlertPct: number
  killSwitch: boolean
  gateway: { costRouting: boolean; fallback: boolean; cache: boolean; logging: boolean }
  globalGuardrails: Omit<Guardrails, 'forbiddenActions' | 'rateLimitPerMin'> & { rateLimit: boolean; forbiddenList: boolean }
  otelEndpoint: string
  notifications: Record<string, boolean>
  notificationChannel: 'email' | 'chat' | 'both'
  instanceUrl: string
  anthropicKeySet: boolean
}

export interface ChatMessage {
  role: 'user' | 'agent' | 'system'
  content: string
  toolCalls?: { name: string; args: string; result: string }[]
  meta?: { durationMs: number; tokens: number; cost: number }
}

export interface CheckResult {
  id: string
  label: string
  status: 'pending' | 'ok' | 'warn' | 'fail'
  detail: string
}
