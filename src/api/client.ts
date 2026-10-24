import type {
  AdminAgentRow,
  AdminUser,
  Agent,
  AgentDocs,
  AgentDraft,
  AgentIntegration,
  AgentMember,
  AgentRole,
  AgentSecret,
  AgentStatus,
  ApiKey,
  Approval,
  AuditEntry,
  ChatMessage,
  CheckResult,
  Connector,
  CreateAgentRequestInput,
  EvalCase,
  EvalRun,
  EvalSuite,
  ID,
  IntegrationInput,
  KnowledgeDoc,
  KnowledgeHit,
  LogEntry,
  LogLevel,
  MemoryItem,
  Notification,
  Overview,
  PlatformAuditEntry,
  PlatformRole,
  PlatformSettings,
  Project,
  Skill,
  TeamAgentInfo,
  TeamEvent,
  TeamRequest,
  TeamTask,
  Template,
  Trace,
  UsageSummary,
  User,
  Webhook,
  Workflow,
  WorkflowRun,
} from './types'

/**
 * The single contract between the UI and any back-end.
 * `mock/` implements it in memory; `http.ts` implements it over REST, one method per route.
 * Every agent-scoped method takes the agent id first: it maps to /v1/agents/:agentId/…,
 * and a user who is not a member of that agent gets "Agent introuvable".
 */
export interface ForgeApi {
  auth: {
    me(): Promise<User>
    login(email: string, password: string): Promise<User>
    signup(name: string, email: string, password: string): Promise<User>
    acceptInvite(email: string, token: string, password: string): Promise<User>
    resetRequest(email: string): Promise<void>
    logout(): Promise<void>
  }
  /** Dashboard of MY agents only. */
  overview: { get(): Promise<Overview> }
  /** Pending approvals across my agents. */
  approvals: {
    mine(): Promise<Approval[]>
    list(agentId: ID): Promise<Approval[]>
    resolve(agentId: ID, id: ID, decision: 'approve' | 'reject'): Promise<void>
  }
  agents: {
    list(): Promise<Agent[]>
    get(agentId: ID): Promise<Agent>
    create(draft: AgentDraft): Promise<Agent>
    /** With a note: regression suites are replayed first, then a new version is published. */
    update(agentId: ID, patch: Partial<AgentDraft>, note?: string): Promise<Agent>
    setStatus(agentId: ID, status: AgentStatus): Promise<Agent>
    restoreVersion(agentId: ID, version: number): Promise<Agent>
    duplicate(agentId: ID): Promise<Agent>
    exportData(agentId: ID): Promise<Record<string, unknown>>
    /** Purge: database rows, vectors, files and secrets. Owner only. */
    remove(agentId: ID): Promise<void>
  }
  runtime: {
    send(agentId: ID, input: string, history: ChatMessage[], environment?: 'test' | 'production'): Promise<ChatMessage & { runId?: ID; status?: string }>
    checks(agentId: ID): Promise<CheckResult[]>
  }
  members: {
    list(agentId: ID): Promise<AgentMember[]>
    add(agentId: ID, email: string, role: AgentRole): Promise<{ member: AgentMember; inviteUrl?: string }>
    setRole(agentId: ID, userId: ID, role: AgentRole): Promise<void>
    remove(agentId: ID, userId: ID): Promise<void>
  }
  keys: {
    list(agentId: ID): Promise<ApiKey[]>
    /** The full secret is returned once, at creation or rotation. */
    create(agentId: ID, name: string, environment: ApiKey['environment'], scope: ApiKey['scope']): Promise<{ key: ApiKey; secret: string }>
    rotate(agentId: ID, keyId: ID): Promise<{ key: ApiKey; secret: string }>
    revoke(agentId: ID, keyId: ID): Promise<void>
  }
  secrets: {
    list(agentId: ID): Promise<AgentSecret[]>
    put(agentId: ID, name: string, value: string): Promise<AgentSecret>
    remove(agentId: ID, name: string): Promise<void>
  }
  integrations: {
    list(agentId: ID): Promise<AgentIntegration[]>
    create(agentId: ID, input: IntegrationInput): Promise<AgentIntegration>
    remove(agentId: ID, id: ID): Promise<void>
    check(agentId: ID, id: ID): Promise<AgentIntegration>
    sendEvent(agentId: ID, event: string): Promise<{ ok: boolean; latencyMs: number; response: string }>
  }
  webhooks: {
    list(agentId: ID): Promise<Webhook[]>
    create(agentId: ID, url: string, events: string[]): Promise<Webhook & { signingSecret?: string }>
    remove(agentId: ID, id: ID): Promise<void>
    test(agentId: ID, id: ID): Promise<{ status: number; latencyMs: number }>
  }
  knowledge: {
    list(agentId: ID): Promise<KnowledgeDoc[]>
    add(agentId: ID, input: { name: string; kind: KnowledgeDoc['kind']; content?: string; file?: string }): Promise<KnowledgeDoc>
    remove(agentId: ID, id: ID): Promise<void>
    search(agentId: ID, q: string): Promise<KnowledgeHit[]>
  }
  memories: {
    list(agentId: ID): Promise<MemoryItem[]>
    add(agentId: ID, text: string): Promise<MemoryItem>
    remove(agentId: ID, id: ID): Promise<void>
    clear(agentId: ID): Promise<void>
  }
  evals: {
    suites(agentId: ID): Promise<EvalSuite[]>
    createSuite(agentId: ID, input: { name: string; regression: boolean; cases: { input: string; expect: string }[] }): Promise<EvalSuite>
    removeSuite(agentId: ID, suiteId: ID): Promise<void>
    cases(agentId: ID, suiteId: ID): Promise<EvalCase[]>
    addCase(agentId: ID, suiteId: ID, input: string, expect: string): Promise<EvalCase>
    run(agentId: ID, suiteId: ID): Promise<EvalRun>
    runs(agentId: ID, suiteId?: ID): Promise<EvalRun[]>
  }
  workflows: {
    list(agentId: ID): Promise<Workflow[]>
    save(agentId: ID, wf: Omit<Workflow, 'id' | 'agentId' | 'version' | 'updatedAt'> & { id?: ID }): Promise<Workflow>
    remove(agentId: ID, id: ID): Promise<void>
    run(agentId: ID, id: ID, input: string, test: boolean): Promise<{ runId: ID }>
    runs(agentId: ID, workflowId?: ID): Promise<WorkflowRun[]>
  }
  audit: { list(agentId: ID): Promise<AuditEntry[]> }
  usage: { get(agentId: ID): Promise<UsageSummary> }
  docs: { get(agentId: ID): Promise<AgentDocs>; regenerate(agentId: ID): Promise<AgentDocs> }
  logs: {
    list(agentId: ID, filter?: { level?: LogLevel; environment?: 'test' | 'production' }): Promise<LogEntry[]>
    /** Live tail of ONE agent. Returns an unsubscribe function. */
    subscribe(agentId: ID, onEntry: (e: LogEntry) => void): () => void
  }
  traces: { list(agentId: ID): Promise<Trace[]>; get(agentId: ID, id: ID): Promise<Trace> }
  forge: {
    agents(): Promise<TeamAgentInfo[]>
    requests(): Promise<TeamRequest[]>
    agentRequests(agentId: ID): Promise<TeamRequest[]>
    request(agentId: ID, requestId: ID): Promise<{ request: TeamRequest; tasks: TeamTask[]; events: TeamEvent[] }>
    create(input: CreateAgentRequestInput): Promise<TeamRequest>
    supervise(agentId: ID): Promise<{ requestId: ID }>
  }
  projects: {
    list(): Promise<Project[]>
    get(id: ID): Promise<Project>
    create(input: Pick<Project, 'name' | 'description'>): Promise<Project>
    update(id: ID, patch: Partial<Pick<Project, 'name' | 'description' | 'stack' | 'environments'>>): Promise<Project>
    remove(id: ID): Promise<void>
  }
  skills: {
    list(): Promise<Skill[]>
    create(input: Pick<Skill, 'name' | 'description' | 'category'>): Promise<Skill>
    remove(id: ID): Promise<void>
  }
  connectors: { list(): Promise<Connector[]>; toggle(id: ID, enabled: boolean): Promise<Connector> }
  templates: { list(): Promise<Template[]> }
  notifications: { list(): Promise<Notification[]>; markRead(id: ID): Promise<void>; markAllRead(): Promise<void> }
  platform: {
    settings(): Promise<PlatformSettings>
    updateSettings(patch: Partial<PlatformSettings>): Promise<PlatformSettings>
  }
  /** Platform administration: accounts and agent metadata, never agent data. */
  admin: {
    users(): Promise<AdminUser[]>
    invite(email: string, platformRole: PlatformRole): Promise<{ id: ID; inviteUrl: string }>
    setRole(id: ID, platformRole: PlatformRole): Promise<void>
    removeUser(id: ID): Promise<void>
    agents(): Promise<AdminAgentRow[]>
    audit(): Promise<PlatformAuditEntry[]>
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}
