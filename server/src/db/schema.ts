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
} from 'drizzle-orm/pg-core'
import type {
  AccessLevel,
  AgentPermissions,
  AgentStatus,
  AgentType,
  Autonomy,
  ClaudeModel,
  Environment,
  Guardrails,
  IntegrationChannel,
  LogLevel,
  Role,
  Settings,
  Trigger,
  WorkflowNode,
} from '@shared/types'

/**
 * ForgeAgent schema. Column shapes follow src/api/types.ts (the front-end contract);
 * nested configuration is stored as typed jsonb so the API returns it unchanged.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })
const createdAt = () => ts('created_at').notNull().defaultNow()

/* ---------- Identity & access ---------- */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').$type<Role>().notNull().default('viewer'),
  createdAt: createdAt(),
  lastActiveAt: ts('last_active_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)])

/** Session id = SHA-256 of the cookie token: a leaked table cannot be replayed. */
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: createdAt(),
  userAgent: text('user_agent'),
}, (t) => [index('sessions_user_idx').on(t.userId)])

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  /** HMAC-SHA256(KEY_PEPPER, secret). The secret itself is never stored. */
  keyHash: text('key_hash').notNull(),
  environment: text('environment').$type<'live' | 'test'>().notNull(),
  scope: text('scope').$type<'secret' | 'publishable'>().notNull().default('secret'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
}, (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash), index('api_keys_project_idx').on(t.projectId)])

/* ---------- Projects & agents ---------- */

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  stack: jsonb('stack').$type<string[]>().notNull().default([]),
  environments: jsonb('environments').$type<Record<Environment, { url: string; deployed: boolean }>>().notNull(),
  allowedDomains: jsonb('allowed_domains').$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('projects_slug_uq').on(t.slug)])

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mission: text('mission').notNull(),
  role: text('role').notNull().default(''),
  type: text('type').$type<AgentType>().notNull(),
  subcategory: text('subcategory').notNull().default(''),
  status: text('status').$type<AgentStatus>().notNull().default('active'),
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
  permissions: jsonb('permissions').$type<AgentPermissions>().notNull(),
  guardrails: jsonb('guardrails').$type<Guardrails>().notNull(),
  costCapPerDay: doublePrecision('cost_cap_per_day').notNull().default(20),
  memory: jsonb('memory').$type<{ longTerm: boolean; sharedWithProject: boolean; retentionDays: number }>().notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('agents_status_idx').on(t.status)])

/** "Projets gérés": many-to-many between agents and projects. */
export const agentProjects = pgTable('agent_projects', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.agentId, t.projectId] }), index('agent_projects_project_idx').on(t.projectId)])

export const agentVersions = pgTable('agent_versions', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  note: text('note').notNull(),
  author: text('author').notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.version] })])

export const skills = pgTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  version: text('version').notNull().default('0.1.0'),
  author: text('author').notNull(),
  builtin: boolean('builtin').notNull().default(false),
  /** Instructions appended to the agent's system prompt when the skill is attached. */
  instructions: text('instructions').notNull().default(''),
  createdAt: createdAt(),
})

export const agentSkills = pgTable('agent_skills', {
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
  addedAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.agentId, t.skillId] }), index('agent_skills_skill_idx').on(t.skillId)])

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<'mcp'>().notNull().default('mcp'),
  description: text('description').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  endpoint: text('endpoint').notNull(),
  /** AES-256-GCM encrypted credentials (see lib/crypto.ts). */
  credentialsEnc: text('credentials_enc'),
})

/** External site connected to an agent (the front's ExternalSite). */
export const integrations = pgTable('integrations', {
  agentId: text('agent_id').primaryKey().references(() => agents.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  status: text('status').$type<'connected' | 'pending' | 'unreachable'>().notNull(),
  lastPingAt: ts('last_ping_at'),
  latencyMs: integer('latency_ms'),
  allowedOrigins: jsonb('allowed_origins').$type<string[]>().notNull().default([]),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  secretEnc: text('secret_enc').notNull(),
  createdAt: createdAt(),
})

/* ---------- Execution ---------- */

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  source: text('source').$type<'api' | 'widget' | 'playground' | 'trigger' | 'team' | 'eval'>().notNull(),
  sandbox: boolean('sandbox').notNull().default(false),
  status: text('status').$type<'running' | 'ok' | 'error' | 'blocked'>().notNull().default('running'),
  input: text('input').notNull(),
  output: text('output'),
  error: text('error'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  cost: doublePrecision('cost').notNull().default(0),
  durationMs: integer('duration_ms').notNull().default(0),
  startedAt: ts('started_at').notNull().defaultNow(),
}, (t) => [index('runs_agent_started_idx').on(t.agentId, t.startedAt), index('runs_started_idx').on(t.startedAt)])

/** One step of a run (the front's Span): trigger, model call, tool call, approval, output. */
export const runSteps = pgTable('run_steps', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  name: text('name').notNull(),
  kind: text('kind').$type<'trigger' | 'model' | 'tool' | 'approval' | 'output'>().notNull(),
  startMs: integer('start_ms').notNull(),
  durationMs: integer('duration_ms').notNull(),
  detail: text('detail'),
  data: jsonb('data').$type<Record<string, unknown>>(),
}, (t) => [index('run_steps_run_idx').on(t.runId, t.idx)])

export const logs = pgTable('logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  level: text('level').$type<LogLevel>().notNull(),
  message: text('message').notNull(),
  runId: text('run_id').references(() => runs.id, { onDelete: 'set null' }),
}, (t) => [index('logs_agent_at_idx').on(t.agentId, t.at), index('logs_at_idx').on(t.at)])

/** Configuration tests ("Vérifications") with their results. */
export const configChecks = pgTable('config_checks', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  at: createdAt(),
  ok: boolean('ok').notNull(),
  results: jsonb('results').$type<{ id: string; label: string; status: string; detail: string }[]>().notNull(),
}, (t) => [index('config_checks_agent_idx').on(t.agentId, t.at)])

export const approvals = pgTable('approvals', {
  id: text('id').primaryKey(),
  source: text('source').$type<'agent' | 'team'>().notNull().default('agent'),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  requestId: text('request_id').references(() => teamRequests.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  risk: text('risk').$type<'low' | 'medium' | 'high'>().notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull().default('pending'),
  requestedAt: createdAt(),
  resolvedBy: text('resolved_by'),
  resolvedAt: ts('resolved_at'),
}, (t) => [index('approvals_status_idx').on(t.status)])

/** Append-only: a trigger in the migration rejects UPDATE and DELETE. */
export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  at: ts('at').notNull().defaultNow(),
  actor: text('actor').notNull(),
  actorType: text('actor_type').$type<'user' | 'agent' | 'team' | 'system'>().notNull(),
  action: text('action').notNull(),
  target: text('target').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
}, (t) => [index('audit_at_idx').on(t.at)])

/* ---------- Knowledge, evals, misc ---------- */

export const evals = pgTable('evals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  cases: jsonb('cases').$type<{ input: string; expect: string }[]>().notNull().default([]),
  lastScore: integer('last_score'),
  lastRunAt: ts('last_run_at'),
})

export const knowledgeDocs = pgTable('knowledge_docs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').$type<'pdf' | 'docx' | 'website' | 'markdown'>().notNull(),
  size: text('size').notNull(),
  status: text('status').$type<'indexed' | 'indexing' | 'failed'>().notNull(),
  chunks: integer('chunks').notNull().default(0),
  /** Extracted plain text, searched by keyword at run time (agents with « Base de connaissances »). */
  content: text('content'),
  error: text('error'),
  createdAt: createdAt(),
})

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: createdAt(),
}, (t) => [index('memories_agent_idx').on(t.agentId)])

export const templates = pgTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').$type<AgentType>().notNull(),
  description: text('description').notNull(),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  href: text('href').notNull(),
  read: boolean('read').notNull().default(false),
  at: createdAt(),
}, (t) => [index('notifications_at_idx').on(t.at)])

export const workflows = pgTable('workflows', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  nodes: jsonb('nodes').$type<WorkflowNode[]>().notNull(),
  published: boolean('published').notNull().default(false),
})

export const delegations = pgTable('delegations', {
  id: text('id').primaryKey(),
  fromAgentId: text('from_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  toAgentId: text('to_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(true),
}, (t) => [uniqueIndex('delegations_pair_uq').on(t.fromAgentId, t.toAgentId)])

export const schedules = pgTable('schedules', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  cron: text('cron').notNull(),
  label: text('label').notNull(),
  enabled: boolean('enabled').notNull().default(true),
})

/** Single-row instance settings. */
export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  data: jsonb('data').$type<Settings>().notNull(),
})

/* ---------- Internal team (multi-agent engine) ---------- */

export type TeamRole = 'orchestrator' | 'architect' | 'builder' | 'security' | 'tester' | 'supervisor'
export type TeamTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'vetoed' | 'cancelled'
export type TeamRequestStatus = 'running' | 'awaiting_approval' | 'done' | 'failed' | 'vetoed' | 'stopped'

export const teamRequests = pgTable('team_requests', {
  id: text('id').primaryKey(),
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
}, (t) => [index('team_requests_created_idx').on(t.createdAt)])

export const teamTasks = pgTable('team_tasks', {
  id: text('id').primaryKey(),
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
}, (t) => [index('team_tasks_request_idx').on(t.requestId, t.createdAt), index('team_tasks_status_idx').on(t.status)])

/** Every exchange between internal agents, in order: lets a request be replayed step by step. */
export const teamEvents = pgTable('team_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  requestId: text('request_id').notNull().references(() => teamRequests.id, { onDelete: 'cascade' }),
  taskId: text('task_id'),
  at: ts('at').notNull().defaultNow(),
  fromRole: text('from_role').notNull(),
  toRole: text('to_role'),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
}, (t) => [index('team_events_request_idx').on(t.requestId, t.id)])
