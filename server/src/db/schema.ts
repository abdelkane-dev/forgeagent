import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'
import type {
  AccessLevel,
  AgentRole,
  AgentStatus,
  AgentType,
  Autonomy,
  ClaudeModel,
  Environment,
  Guardrails,
  IntegrationChannel,
  LogLevel,
  PlatformRole,
  PlatformSettings,
  Trigger,
  WorkflowNode,
} from '@shared/types'

/**
 * ForgeAgent schema v2. Two kinds of tables:
 *  - platform tables (users, sessions, catalogues): no agent data, no RLS;
 *  - agent tables: every row carries agent_id, Row-Level Security is enabled and forced
 *    (see drizzle/0002_isolation.sql). The database refuses any row outside the caller's agents.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const agentRef = () =>
  text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' })

export const EMBEDDING_DIM = 256

/* =========================== Platform =========================== */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  platformRole: text('platform_role').$type<PlatformRole>().notNull().default('member'),
  createdAt: createdAt(),
  lastActiveAt: ts('last_active_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)])

/** External sign-in (GitHub, Google) linked to an account. subject = the provider's stable user id. */
export const userIdentities = pgTable('user_identities', {
  provider: text('provider').$type<'github' | 'google'>().notNull(),
  subject: text('subject').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  createdAt: createdAt(),
  lastLoginAt: ts('last_login_at'),
}, (t) => [primaryKey({ columns: [t.provider, t.subject] }), index('user_identities_user_idx').on(t.userId)])

/** Session id = SHA-256 of the cookie token. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user_idx').on(t.userId)])

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  stack: jsonb('stack').$type<string[]>().notNull().default([]),
  environments: jsonb('environments').$type<Record<Environment, { url: string; deployed: boolean }>>().notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('projects_slug_uq').on(t.slug)])

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull().default('0.1.0'),
  author: text('author').notNull(),
  builtin: boolean('builtin').notNull().default(false),
  instructions: text('instructions').notNull().default(''),
  createdAt: createdAt(),
})

/** Connector types. Credentials are never stored here: they are secrets of each agent. */
export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<'mcp'>().notNull().default('mcp'),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  endpoint: text('endpoint').notNull(),
})

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<AgentType>().notNull(),
  description: text('description').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
})

export const platformSettings = pgTable('platform_settings', {
  id: integer('id').primaryKey().default(1),
  data: jsonb('data').$type<Omit<PlatformSettings, 'anthropicKeySet' | 'embeddings' | 'storage'>>().notNull(),
})

/** Per-user notifications. agent_id lets the API drop notifications of agents the user left. */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: text('agent_id'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  href: text('href').notNull(),
  read: boolean('read').notNull().default(false),
  at: createdAt(),
}, (t) => [index('notifications_user_idx').on(t.userId, t.at)])

/** Platform-level events (accounts, projects, maintenance). Agent events go to the agent's audit_log. */
export const platformAudit = pgTable('platform_audit', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
})

/* =========================== Agent space (RLS) =========================== */

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mission: text('mission').notNull(),
  role: text('role').notNull().default(''),
  type: text('type').$type<AgentType>().notNull(),
  subcategory: text('subcategory').notNull().default(''),
  status: text('status').$type<AgentStatus>().notNull().default('starting'),
  autonomy: text('autonomy').$type<Autonomy>().notNull().default('suggest_only'),
  model: text('model').$type<ClaudeModel>().notNull(),
  version: integer('version').notNull().default(1),
  tone: text('tone').notNull().default('Professionnel'),
  language: text('language').notNull().default('Français'),
  persona: text('persona').notNull().default(''),
  triggers: jsonb('triggers').$type<Trigger[]>().notNull().default([]),
  tools: jsonb('tools').$type<{ connectorId: string; access: AccessLevel; enabled: boolean }[]>().notNull().default([]),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
  integrations: jsonb('integrations').$type<IntegrationChannel[]>().notNull().default([]),
  allowedActions: jsonb('allowed_actions').$type<string[]>().notNull().default([]),
  guardrails: jsonb('guardrails').$type<Guardrails>().notNull(),
  costCapPerDay: doublePrecision('cost_cap_per_day').notNull().default(20),
  monthlyBudget: doublePrecision('monthly_budget').notNull().default(300),
  allowedOrigins: jsonb('allowed_origins').$type<string[]>().notNull().default([]),
  memory: jsonb('memory').$type<{ longTerm: boolean; shortTermTurns: number; retentionDays: number }>().notNull(),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('agents_status_idx').on(t.status)])

/** Who can reach an agent, and with which role. The only source of truth for access. */
export const agentMembers = pgTable('agent_members', {
  agentId: agentRef(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<AgentRole>().notNull(),
  addedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.userId] }), index('agent_members_user_idx').on(t.userId)])

export const agentProjects = pgTable('agent_projects', {
  agentId: agentRef(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.agentId, t.projectId] })])

export const agentVersions = pgTable('agent_versions', {
  agentId: agentRef(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  note: text('note').notNull(),
  author: text('author').notNull(),
  regressionScore: integer('regression_score'),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.version] })])

export const agentSkills = pgTable('agent_skills', {
  agentId: agentRef(),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  addedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.skillId] })])

/** Generated documentation, one row per agent version. */
export const agentDocs = pgTable('agent_docs', {
  agentId: agentRef(),
  version: integer('version').notNull(),
  markdown: text('markdown').notNull(),
  generatedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.version] })])

/** Secrets encrypted with a key derived for this agent only (HKDF). */
export const agentSecrets = pgTable('agent_secrets', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  name: text('name').notNull(),
  valueEnc: text('value_enc').notNull(),
  createdAt: createdAt(),
  lastUsedAt: ts('last_used_at'),
}, (t) => [uniqueIndex('agent_secrets_name_uq').on(t.agentId, t.name)])

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  environment: text('environment').$type<'live' | 'test'>().notNull(),
  scope: text('scope').$type<'secret' | 'publishable'>().notNull().default('secret'),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
}, (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash), index('api_keys_agent_idx').on(t.agentId)])

export const integrations = pgTable('integrations', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  kind: text('kind').$type<'website' | 'app' | 'service'>().notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  environment: text('environment').$type<'test' | 'production'>().notNull().default('production'),
  status: text('status').$type<'connected' | 'pending' | 'unreachable'>().notNull().default('pending'),
  lastCheckAt: ts('last_check_at'),
  latencyMs: integer('latency_ms'),
  secretName: text('secret_name'),
  createdAt: createdAt(),
}, (t) => [index('integrations_agent_idx').on(t.agentId)])

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  secretEnc: text('secret_enc').notNull(),
  createdAt: createdAt(),
}, (t) => [index('webhooks_agent_idx').on(t.agentId)])

/* ---- knowledge & memory ---- */

export const knowledgeDocs = pgTable('knowledge_docs', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  name: text('name').notNull(),
  kind: text('kind').$type<'pdf' | 'docx' | 'website' | 'markdown' | 'text'>().notNull(),
  size: text('size').notNull().default('…'),
  status: text('status').$type<'indexed' | 'indexing' | 'failed'>().notNull().default('indexing'),
  chunks: integer('chunks').notNull().default(0),
  storageKey: text('storage_key'),
  error: text('error'),
  createdAt: createdAt(),
}, (t) => [index('knowledge_docs_agent_idx').on(t.agentId)])

/** Vector index of the agent's knowledge (pgvector). Protected by RLS like every agent table. */
export const knowledgeChunks = pgTable('knowledge_chunks', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: agentRef(),
  docId: text('doc_id').notNull().references(() => knowledgeDocs.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIM }).notNull(),
}, (t) => [
  index('knowledge_chunks_agent_idx').on(t.agentId),
  index('knowledge_chunks_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
])

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  kind: text('kind').$type<'short' | 'long'>().notNull(),
  sessionId: text('session_id'),
  text: text('text').notNull(),
  createdAt: createdAt(),
}, (t) => [index('memories_agent_idx').on(t.agentId, t.kind, t.createdAt)])

/* ---- execution ---- */

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  source: text('source').$type<'api' | 'widget' | 'playground' | 'trigger' | 'team' | 'eval' | 'workflow' | 'mcp'>().notNull(),
  environment: text('environment').$type<'test' | 'production'>().notNull(),
  status: text('status').$type<'running' | 'ok' | 'error' | 'blocked'>().notNull().default('running'),
  input: text('input').notNull(),
  output: text('output'),
  error: text('error'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  version: integer('version').notNull().default(1),
  startedAt: ts('started_at').notNull().defaultNow(),
}, (t) => [index('runs_agent_started_idx').on(t.agentId, t.startedAt)])

export const runSteps = pgTable('run_steps', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  name: text('name').notNull(),
  kind: text('kind').$type<'trigger' | 'model' | 'tool' | 'approval' | 'output'>().notNull(),
  startMs: integer('start_ms').notNull(),
  durationMs: integer('duration_ms').notNull(),
  detail: text('detail'),
}, (t) => [index('run_steps_run_idx').on(t.runId, t.idx)])

export const logs = pgTable('logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: agentRef(),
  at: ts('at').notNull().defaultNow(),
  level: text('level').$type<LogLevel>().notNull(),
  environment: text('environment').$type<'test' | 'production'>().notNull().default('production'),
  message: text('message').notNull(),
  runId: text('run_id'),
}, (t) => [index('logs_agent_at_idx').on(t.agentId, t.at)])

export const configChecks = pgTable('config_checks', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  at: createdAt(),
  ok: boolean('ok').notNull(),
  results: jsonb('results').$type<{ id: string; label: string; status: string; detail: string }[]>().notNull(),
})

export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  source: text('source').$type<'agent' | 'team' | 'workflow'>().notNull().default('agent'),
  requestId: text('request_id'),
  workflowRunId: text('workflow_run_id'),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  risk: text('risk').$type<'low' | 'medium' | 'high'>().notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  requestedAt: createdAt(),
  resolvedBy: text('resolved_by'),
  resolvedAt: ts('resolved_at'),
}, (t) => [index('approvals_agent_status_idx').on(t.agentId, t.status)])

/** The agent's own append-only journal (trigger in 0002_isolation.sql). */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: agentRef(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  actorType: text('actor_type').$type<'user' | 'agent' | 'team' | 'system' | 'platform'>().notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  result: text('result').$type<'ok' | 'refused' | 'error'>(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
}, (t) => [index('audit_agent_at_idx').on(t.agentId, t.at)])

/** Every token spent for an agent, whatever spent it (its runs, its evaluations, the internal team…). */
export const usageCosts = pgTable('usage_costs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: agentRef(),
  at: ts('at').notNull().defaultNow(),
  source: text('source').$type<'run' | 'team' | 'eval' | 'workflow' | 'embedding'>().notNull(),
  environment: text('environment').$type<'test' | 'production'>().notNull().default('production'),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  refId: text('ref_id'),
}, (t) => [index('usage_agent_at_idx').on(t.agentId, t.at)])

/* ---- evaluation ---- */

export const evalSuites = pgTable('eval_suites', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  name: text('name').notNull(),
  regression: boolean('regression').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index('eval_suites_agent_idx').on(t.agentId)])

export const evalCases = pgTable('eval_cases', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  suiteId: text('suite_id').notNull().references(() => evalSuites.id, { onDelete: 'cascade' }),
  input: text('input').notNull(),
  expect: text('expect').notNull().default(''),
})

export const evalRuns = pgTable('eval_runs', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  suiteId: text('suite_id').notNull().references(() => evalSuites.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  kind: text('kind').$type<'manual' | 'regression' | 'team'>().notNull(),
  score: integer('score').notNull(),
  passed: integer('passed').notNull(),
  total: integer('total').notNull(),
  results: jsonb('results').$type<{ caseId: string; input: string; passed: boolean; output: string }[]>().notNull(),
  at: createdAt(),
}, (t) => [index('eval_runs_suite_idx').on(t.suiteId, t.at)])

/* ---- workflows ---- */

export const workflows = pgTable('workflows', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  published: boolean('published').notNull().default(false),
  trigger: jsonb('trigger').$type<{ kind: 'manual' | 'cron' | 'webhook'; config: string }>().notNull(),
  nodes: jsonb('nodes').$type<WorkflowNode[]>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('workflows_agent_idx').on(t.agentId)])

export const workflowVersions = pgTable('workflow_versions', {
  agentId: agentRef(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.workflowId, t.version] })])

export const workflowRuns = pgTable('workflow_runs', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  status: text('status').$type<'running' | 'ok' | 'error' | 'waiting_approval'>().notNull().default('running'),
  trigger: text('trigger').notNull(),
  input: text('input').notNull().default(''),
  cursor: integer('cursor').notNull().default(0),
  steps: jsonb('steps').$type<{ nodeId: string; label: string; status: 'ok' | 'error' | 'skipped' | 'waiting'; attempts: number; output: string }[]>().notNull().default([]),
  startedAt: ts('started_at').notNull().defaultNow(),
  durationMs: integer('duration_ms').notNull().default(0),
}, (t) => [index('workflow_runs_wf_idx').on(t.workflowId, t.startedAt)])

/* ---- internal team: every request and task targets ONE agent ---- */

export type TeamRole = 'orchestrator' | 'architect' | 'builder' | 'security' | 'tester' | 'supervisor'
export type TeamTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'vetoed' | 'cancelled'
export type TeamRequestStatus = 'running' | 'awaiting_approval' | 'done' | 'failed' | 'vetoed' | 'stopped'

export const teamRequests = pgTable('team_requests', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  kind: text('kind').$type<'create_agent' | 'supervise'>().notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  status: text('status').$type<TeamRequestStatus>().notNull().default('running'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  error: text('error'),
  steps: integer('steps').notNull().default(0),
  agentCalls: integer('agent_calls').notNull().default(0),
  tokens: integer('tokens').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  createdBy: text('created_by'),
  createdAt: createdAt(),
  finishedAt: ts('finished_at'),
}, (t) => [index('team_requests_agent_idx').on(t.agentId, t.createdAt)])

export const teamTasks = pgTable('team_tasks', {
  id: text('id').primaryKey(),
  agentId: agentRef(),
  requestId: text('request_id').notNull().references(() => teamRequests.id, { onDelete: 'cascade' }),
  parentId: text('parent_id'),
  role: text('role').$type<TeamRole>().notNull(),
  status: text('status').$type<TeamTaskStatus>().notNull().default('queued'),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  inputHash: text('input_hash').notNull(),
  tokens: integer('tokens').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  model: text('model'),
  error: text('error'),
  createdAt: createdAt(),
  startedAt: ts('started_at'),
  finishedAt: ts('finished_at'),
}, (t) => [index('team_tasks_request_idx').on(t.requestId, t.createdAt), index('team_tasks_agent_idx').on(t.agentId, t.status)])

export const teamEvents = pgTable('team_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  agentId: agentRef(),
  requestId: text('request_id').notNull().references(() => teamRequests.id, { onDelete: 'cascade' }),
  taskId: text('task_id'),
  at: ts('at').notNull().defaultNow(),
  fromRole: text('from_role').notNull(),
  toRole: text('to_role'),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
}, (t) => [index('team_events_request_idx').on(t.requestId, t.id)])

/** Tables protected by RLS, in dependency order. Used by the isolation migration check and the purge. */
export const AGENT_TABLES = [
  'agents',
  'agent_members',
  'agent_projects',
  'agent_versions',
  'agent_skills',
  'agent_docs',
  'agent_secrets',
  'api_keys',
  'integrations',
  'webhooks',
  'knowledge_docs',
  'knowledge_chunks',
  'memories',
  'runs',
  'run_steps',
  'logs',
  'config_checks',
  'approvals',
  'audit_log',
  'usage_costs',
  'eval_suites',
  'eval_cases',
  'eval_runs',
  'workflows',
  'workflow_versions',
  'workflow_runs',
  'team_requests',
  'team_tasks',
  'team_events',
] as const
