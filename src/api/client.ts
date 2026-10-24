import type {
  Agent,
  AgentDraft,
  ApiKey,
  Approval,
  AuditEntry,
  ChatMessage,
  CheckResult,
  Connector,
  Delegation,
  EvalSuite,
  ExternalSite,
  ID,
  KnowledgeDoc,
  LogEntry,
  LogLevel,
  MemoryItem,
  Notification,
  Overview,
  Project,
  Role,
  Schedule,
  Settings,
  Skill,
  TeamMember,
  Template,
  Trace,
  Webhook,
  Workflow,
  User,
  TeamAgentInfo,
  TeamRequest,
  TeamTask,
  TeamEvent,
  CreateAgentRequestInput,
} from './types'

/**
 * The single contract between the UI and any back-end.
 * `mock.ts` implements it in memory; `http.ts` implements it over REST.
 * Swap with VITE_API_URL (see src/api/index.ts).
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
  overview: { get(): Promise<Overview> }
  agents: {
    list(): Promise<Agent[]>
    get(id: ID): Promise<Agent>
    create(draft: AgentDraft): Promise<Agent>
    update(id: ID, patch: Partial<Agent>, note?: string): Promise<Agent>
    remove(id: ID): Promise<void>
    restoreVersion(id: ID, version: number): Promise<Agent>
    duplicate(id: ID, projectId: ID): Promise<Agent>
    /** Checks that the external site answers and that the widget/SDK is installed. */
    pingSite(id: ID, url: string): Promise<ExternalSite>
    /** Sends a test event from the agent to the external site (e.g. a DOM action, an API call). */
    sendToSite(id: ID, event: string): Promise<{ ok: boolean; latencyMs: number; response: string }>
  }
  projects: {
    list(): Promise<Project[]>
    get(id: ID): Promise<Project>
    create(input: Pick<Project, 'name' | 'description'>): Promise<Project>
    update(id: ID, patch: Partial<Project>): Promise<Project>
    remove(id: ID): Promise<void>
  }
  skills: {
    list(): Promise<Skill[]>
    create(input: Pick<Skill, 'name' | 'description' | 'category'>): Promise<Skill>
    remove(id: ID): Promise<void>
  }
  connectors: { list(): Promise<Connector[]>; toggle(id: ID, enabled: boolean): Promise<Connector> }
  traces: { list(filter?: { agentId?: ID }): Promise<Trace[]>; get(id: ID): Promise<Trace> }
  logs: {
    list(filter?: { agentId?: ID; level?: LogLevel }): Promise<LogEntry[]>
    /** Live tail. Returns an unsubscribe function. */
    subscribe(onEntry: (e: LogEntry) => void, filter?: { agentId?: ID }): () => void
  }
  approvals: { list(): Promise<Approval[]>; resolve(id: ID, decision: 'approve' | 'reject'): Promise<void> }
  audit: { list(): Promise<AuditEntry[]> }
  evals: { list(): Promise<EvalSuite[]>; run(id: ID): Promise<EvalSuite> }
  knowledge: {
    list(): Promise<KnowledgeDoc[]>
    add(input: Pick<KnowledgeDoc, 'name' | 'kind'> & { content?: string }): Promise<KnowledgeDoc>
    remove(id: ID): Promise<void>
  }
  memories: { list(agentId?: ID): Promise<MemoryItem[]>; remove(id: ID): Promise<void>; clear(agentId: ID): Promise<void> }
  templates: { list(): Promise<Template[]> }
  team: {
    list(): Promise<TeamMember[]>
    invite(email: string, role: Role): Promise<TeamMember>
    setRole(id: ID, role: Role): Promise<TeamMember>
    remove(id: ID): Promise<void>
  }
  apiKeys: {
    list(): Promise<ApiKey[]>
    /** The full secret is returned once, at creation or rotation. */
    create(name: string, environment: ApiKey['environment'], opts?: { scope?: 'secret' | 'publishable'; projectId?: ID | null }): Promise<{ key: ApiKey; secret: string }>
    rotate(id: ID): Promise<{ key: ApiKey; secret: string }>
    revoke(id: ID): Promise<void>
  }
  webhooks: {
    list(): Promise<Webhook[]>
    create(url: string, events: string[]): Promise<Webhook & { signingSecret?: string }>
    remove(id: ID): Promise<void>
    test(id: ID): Promise<{ status: number; latencyMs: number }>
  }
  notifications: { list(): Promise<Notification[]>; markRead(id: ID): Promise<void>; markAllRead(): Promise<void> }
  workflows: { list(): Promise<Workflow[]>; save(wf: Workflow): Promise<Workflow> }
  delegations: {
    list(): Promise<Delegation[]>
    create(fromAgentId: ID, toAgentId: ID): Promise<Delegation>
    toggle(id: ID, enabled: boolean): Promise<Delegation>
  }
  schedules: {
    list(): Promise<Schedule[]>
    create(agentId: ID, cron: string, label: string): Promise<Schedule>
    toggle(id: ID, enabled: boolean): Promise<Schedule>
  }
  settings: { get(): Promise<Settings>; update(patch: Partial<Settings>): Promise<Settings> }
  internalTeam: {
    agents(): Promise<TeamAgentInfo[]>
    requests(): Promise<TeamRequest[]>
    request(id: ID): Promise<{ request: TeamRequest; tasks: TeamTask[]; events: TeamEvent[] }>
    create(input: CreateAgentRequestInput): Promise<TeamRequest>
    sweep(): Promise<{ requestId: ID | null }>
    queue(): Promise<Record<string, { waiting: number; active: number }>>
  }
  playground: {
    send(agentId: ID, input: string, history: ChatMessage[]): Promise<ChatMessage>
    checks(agentId: ID): Promise<CheckResult[]>
  }
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status = 500) {
    super(message)
    this.status = status
  }
}
