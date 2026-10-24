import type {
  Agent,
  ApiKey,
  Approval,
  AuditEntry,
  Connector,
  Delegation,
  EvalSuite,
  KnowledgeDoc,
  LogEntry,
  MemoryItem,
  Notification,
  Project,
  Schedule,
  Settings,
  Skill,
  TeamMember,
  Template,
  Trace,
  Webhook,
  Workflow,
} from '../types'

/** Demo data used while no back-end is plugged in. Bonaco Pro is the first target project. */

const now = Date.now()
export const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

const baseGuardrails = {
  promptInjection: true,
  piiMasking: true,
  humanApproval: true,
  forbiddenActions: ['Supprimer des données', 'Modifier les paiements'],
  rateLimitPerMin: 60,
}

export const projects: Project[] = [
  {
    id: 'prj_bonaco',
    name: 'Bonaco Pro',
    slug: 'bonaco-pro',
    description: 'Application métier : surveillance technique, anti-abus et administration.',
    stack: ['Next.js', 'PostgreSQL', 'Node 22'],
    environments: {
      test: { url: 'https://test.bonaco.pro', deployed: true },
      staging: { url: 'https://staging.bonaco.pro', deployed: true },
      production: { url: 'https://app.bonaco.pro', deployed: true },
    },
    allowedDomains: ['bonaco.pro', 'staging.bonaco.pro'],
    createdAt: ago(60 * 24 * 41),
  },
  {
    id: 'prj_console',
    name: 'Outils internes',
    slug: 'outils-internes',
    description: 'Scripts d’équipe, revue de code et documentation.',
    stack: ['Vite', 'Python'],
    environments: {
      test: { url: 'http://localhost:5173', deployed: true },
      staging: { url: '', deployed: false },
      production: { url: '', deployed: false },
    },
    allowedDomains: ['localhost'],
    createdAt: ago(60 * 24 * 9),
  },
]

const versions = (n: number, notes: string[]) =>
  Array.from({ length: n }, (_, i) => ({
    version: n - i,
    createdAt: ago(60 * 24 * i * 3 + 40),
    author: i % 2 ? 'Inès Diallo' : 'Abdoul Karim',
    note: notes[i] ?? 'Création',
  }))

export const agents: Agent[] = [
  {
    id: 'agt_8f3k2',
    name: 'Gardien technique',
    mission: 'Surveille erreurs, lenteurs et pannes de Bonaco Pro. Ouvre un ticket et alerte l’équipe selon la gravité. Ne redémarre jamais un service sans validation.',
    role: 'Ingénieur de garde',
    type: 'monitoring',
    subcategory: 'Performance',
    status: 'active',
    autonomy: 'act_after_approval',
    model: 'claude-sonnet-5-5',
    version: 3,
    versions: versions(3, ['Skill « Rapports » ajoutée', 'Plafond de coût abaissé à 30 $', 'Création']),
    tone: 'Direct',
    language: 'Français',
    persona: 'Factuel, cite toujours la ligne de journal en cause.',
    projectIds: ['prj_bonaco'],
    triggers: [
      { id: 'trg_1', kind: 'cron', label: 'Toutes les 5 minutes', config: '*/5 * * * *', enabled: true },
      { id: 'trg_2', kind: 'webhook', label: 'Erreur 5xx détectée', config: '/hooks/agt_8f3k2', enabled: true },
    ],
    tools: [
      { connectorId: 'mcp_logs', access: 'read', enabled: true },
      { connectorId: 'mcp_tickets', access: 'read_write', enabled: true },
      { connectorId: 'mcp_email', access: 'read_write', enabled: true },
    ],
    capabilities: ['Connecteurs MCP', 'Lire les journaux', 'Envoyer des emails'],
    skillIds: ['skl_reports', 'skl_alerts', 'skl_summary'],
    integrations: ['rest', 'webhook_out'],
    permissions: { allowedActions: ['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte'], roles: ['admin', 'editor'], people: ['ines@bonaco.pro'] },
    guardrails: baseGuardrails,
    costCapPerDay: 30,
    memory: { longTerm: true, sharedWithProject: false, retentionDays: 90 },
    externalSite: { url: 'https://app.bonaco.pro', status: 'connected', lastPingAt: ago(2), latencyMs: 84, allowedOrigins: ['https://app.bonaco.pro'] },
    metrics: { runs24h: 1248, successRate: 99.2, costToday: 4.2, p50LatencyMs: 2100, tokens24h: 3_120_400 },
    createdAt: ago(60 * 24 * 38),
    updatedAt: ago(42),
  },
  {
    id: 'agt_2m9qa',
    name: 'Modérateur anti-abus',
    mission: 'Repère spam, fraude et comptes suspects. Propose une sanction graduée, ne l’applique jamais seul.',
    role: 'Modération',
    type: 'decision',
    subcategory: 'Fraude',
    status: 'active',
    autonomy: 'suggest_only',
    model: 'claude-sonnet-5-5',
    version: 2,
    versions: versions(2, ['Nouvelles règles de scoring', 'Création']),
    tone: 'Professionnel',
    language: 'Français',
    persona: 'Prudent. Explique chaque score avec les signaux observés.',
    projectIds: ['prj_bonaco'],
    triggers: [{ id: 'trg_3', kind: 'db_event', label: 'Nouvelle publication', config: 'posts.insert', enabled: true }],
    tools: [
      { connectorId: 'mcp_db', access: 'read', enabled: true },
      { connectorId: 'mcp_chat', access: 'read_write', enabled: true },
    ],
    capabilities: ['Connecteurs MCP', 'Base de connaissances'],
    skillIds: ['skl_fraud'],
    integrations: ['rest'],
    permissions: { allowedActions: ['Masquer une publication', 'Suspendre un compte'], roles: ['admin'], people: [] },
    guardrails: baseGuardrails,
    costCapPerDay: 20,
    memory: { longTerm: true, sharedWithProject: true, retentionDays: 30 },
    externalSite: { url: 'https://app.bonaco.pro', status: 'connected', lastPingAt: ago(6), latencyMs: 112, allowedOrigins: ['https://app.bonaco.pro'] },
    metrics: { runs24h: 892, successRate: 97.4, costToday: 6.1, p50LatencyMs: 800, tokens24h: 1_040_000 },
    createdAt: ago(60 * 24 * 30),
    updatedAt: ago(60 * 20),
  },
  {
    id: 'agt_7x1pd',
    name: 'Assistant d’administration',
    mission: 'Répond aux questions des administrateurs de Bonaco Pro sur la configuration, les rôles et les réglages.',
    role: 'Assistant interne',
    type: 'conversational',
    subcategory: 'Assistant interne',
    status: 'active',
    autonomy: 'suggest_only',
    model: 'claude-haiku-5-5',
    version: 4,
    versions: versions(4, ['Ton plus concis', 'Documentation v2 indexée', 'Ajout du widget', 'Création']),
    tone: 'Pédagogue',
    language: 'Français',
    persona: 'Répond en trois phrases au plus, avec le lien vers la page de réglage.',
    projectIds: ['prj_bonaco'],
    triggers: [{ id: 'trg_4', kind: 'message', label: 'Message dans le widget', config: 'widget', enabled: true }],
    tools: [{ connectorId: 'mcp_db', access: 'read', enabled: true }],
    capabilities: ['Base de connaissances', 'Mémoire long terme'],
    skillIds: ['skl_summary', 'skl_translate'],
    integrations: ['widget', 'sdk_js'],
    permissions: { allowedActions: ['Lire les journaux applicatifs'], roles: ['admin', 'editor', 'viewer'], people: [] },
    guardrails: baseGuardrails,
    costCapPerDay: 15,
    memory: { longTerm: true, sharedWithProject: false, retentionDays: 90 },
    externalSite: { url: 'https://app.bonaco.pro/admin', status: 'connected', lastPingAt: ago(1), latencyMs: 61, allowedOrigins: ['https://app.bonaco.pro'] },
    metrics: { runs24h: 1342, successRate: 98.9, costToday: 8.1, p50LatencyMs: 4600, tokens24h: 5_880_000 },
    createdAt: ago(60 * 24 * 36),
    updatedAt: ago(60 * 3),
  },
  {
    id: 'agt_4r0lw',
    name: 'Rapports hebdo',
    mission: 'Chaque lundi à 8 h, compile l’activité de la semaine et l’envoie à l’équipe produit.',
    role: 'Analyste',
    type: 'autonomous',
    subcategory: 'Rapports',
    status: 'paused',
    autonomy: 'act_alone_simple',
    model: 'claude-haiku-5-5',
    version: 1,
    versions: versions(1, ['Création']),
    tone: 'Professionnel',
    language: 'Français',
    persona: '',
    projectIds: ['prj_bonaco'],
    triggers: [{ id: 'trg_5', kind: 'cron', label: 'Chaque lundi à 08:00', config: '0 8 * * 1', enabled: true }],
    tools: [
      { connectorId: 'mcp_db', access: 'read', enabled: true },
      { connectorId: 'mcp_email', access: 'read_write', enabled: true },
    ],
    capabilities: ['Générer des fichiers', 'Envoyer des emails'],
    skillIds: ['skl_reports'],
    integrations: ['webhook_out'],
    permissions: { allowedActions: ['Envoyer une alerte'], roles: ['admin', 'editor'], people: [] },
    guardrails: { ...baseGuardrails, humanApproval: false },
    costCapPerDay: 5,
    memory: { longTerm: false, sharedWithProject: false, retentionDays: 30 },
    externalSite: null,
    metrics: { runs24h: 0, successRate: 100, costToday: 0, p50LatencyMs: 18_400, tokens24h: 0 },
    createdAt: ago(60 * 24 * 12),
    updatedAt: ago(60 * 24 * 2),
  },
  {
    id: 'agt_5c8vn',
    name: 'Relecteur de code',
    mission: 'Relit chaque pull request des outils internes, signale les failles et propose des tests manquants.',
    role: 'Relecteur',
    type: 'development',
    subcategory: 'Revue de code',
    status: 'error',
    autonomy: 'suggest_only',
    model: 'claude-opus-5-5',
    version: 2,
    versions: versions(2, ['Accès au dépôt en lecture seule', 'Création']),
    tone: 'Direct',
    language: 'English',
    persona: 'Comments inline, never rewrites the whole file.',
    projectIds: ['prj_console'],
    triggers: [{ id: 'trg_6', kind: 'webhook', label: 'Pull request ouverte', config: '/hooks/agt_5c8vn', enabled: true }],
    tools: [{ connectorId: 'mcp_git', access: 'read', enabled: true }],
    capabilities: ['Connecteurs MCP'],
    skillIds: [],
    integrations: ['mcp_server'],
    permissions: { allowedActions: ['Créer un ticket'], roles: ['admin', 'editor'], people: [] },
    guardrails: baseGuardrails,
    costCapPerDay: 25,
    memory: { longTerm: false, sharedWithProject: true, retentionDays: 30 },
    externalSite: null,
    metrics: { runs24h: 37, successRate: 81.1, costToday: 3.9, p50LatencyMs: 12_300, tokens24h: 980_000 },
    createdAt: ago(60 * 24 * 8),
    updatedAt: ago(14),
  },
]

export const connectors: Connector[] = [
  { id: 'mcp_logs', name: 'Journaux applicatifs', kind: 'mcp', description: 'Lecture des logs Bonaco Pro (Loki)', enabled: true, endpoint: 'mcp://logs.bonaco.internal' },
  { id: 'mcp_db', name: 'Base de données', kind: 'mcp', description: 'PostgreSQL, requêtes paramétrées', enabled: true, endpoint: 'mcp://db.bonaco.internal' },
  { id: 'mcp_email', name: 'Email', kind: 'mcp', description: 'Envoi via SMTP transactionnel', enabled: true, endpoint: 'mcp://mail.internal' },
  { id: 'mcp_chat', name: 'Messagerie d’équipe', kind: 'mcp', description: 'Canaux et messages directs', enabled: true, endpoint: 'mcp://chat.internal' },
  { id: 'mcp_tickets', name: 'Gestion de tickets', kind: 'mcp', description: 'Création et suivi des incidents', enabled: true, endpoint: 'mcp://tickets.internal' },
  { id: 'mcp_git', name: 'Dépôt de code', kind: 'mcp', description: 'Pull requests, diffs, commentaires', enabled: true, endpoint: 'mcp://git.internal' },
  { id: 'mcp_files', name: 'Stockage de fichiers', kind: 'mcp', description: 'Buckets S3 compatibles', enabled: false, endpoint: 'mcp://files.internal' },
  { id: 'mcp_calendar', name: 'Calendrier', kind: 'mcp', description: 'Créneaux et rappels', enabled: false, endpoint: 'mcp://calendar.internal' },
]

export const skills: Skill[] = [
  { id: 'skl_reports', name: 'Rapports d’activité', description: 'Compile une période en rapport structuré avec chiffres et tendances.', category: 'reporting', version: '1.4.0', author: 'ForgeAgent', installs: 2, builtin: true },
  { id: 'skl_alerts', name: 'Alertes graduées', description: 'Choisit le canal et le destinataire selon la gravité et l’heure.', category: 'alerting', version: '2.0.1', author: 'ForgeAgent', installs: 1, builtin: true },
  { id: 'skl_fraud', name: 'Détection de fraude', description: 'Repère les schémas suspects : vélocité, réutilisation, empreintes.', category: 'security', version: '0.9.2', author: 'Communauté', installs: 1, builtin: false },
  { id: 'skl_summary', name: 'Résumé', description: 'Résume conversations, journaux et fils de discussion.', category: 'analysis', version: '1.1.0', author: 'ForgeAgent', installs: 2, builtin: true },
  { id: 'skl_extract', name: 'Extraction de documents', description: 'Lit factures, formulaires et PDF scannés, renvoie du JSON.', category: 'documents', version: '1.0.3', author: 'ForgeAgent', installs: 0, builtin: true },
  { id: 'skl_publish', name: 'Publication planifiée', description: 'Programme et publie du contenu sur plusieurs canaux.', category: 'content', version: '0.6.0', author: 'Communauté', installs: 0, builtin: false },
  { id: 'skl_translate', name: 'Traduction', description: 'Traduit en 40 langues en gardant le ton et le glossaire.', category: 'content', version: '1.2.0', author: 'ForgeAgent', installs: 1, builtin: true },
  { id: 'skl_search', name: 'Recherche web', description: 'Collecte des sources à jour et les cite.', category: 'search', version: '1.0.0', author: 'ForgeAgent', installs: 0, builtin: true },
]

const spans = (fail = false) => [
  { id: 's1', name: 'Déclencheur · webhook 5xx', kind: 'trigger' as const, startMs: 0, durationMs: 40 },
  { id: 's2', name: 'Modèle · planification', kind: 'model' as const, startMs: 40, durationMs: 620, detail: 'claude-sonnet-5-5 · 1 840 tokens' },
  { id: 's3', name: 'Outil · logs.query', kind: 'tool' as const, startMs: 660, durationMs: 480, detail: 'service=api level>=error since=10m' },
  { id: 's4', name: 'Modèle · décision', kind: 'model' as const, startMs: 1140, durationMs: 590, detail: 'gravité : haute' },
  fail
    ? { id: 's5', name: 'Outil · tickets.create — délai dépassé', kind: 'tool' as const, startMs: 1730, durationMs: 1200, detail: 'TimeoutError après 1 200 ms' }
    : { id: 's5', name: 'Sortie · alerte envoyée', kind: 'output' as const, startMs: 1730, durationMs: 370, detail: '#incidents · 2 destinataires' },
]

export const traces: Trace[] = [
  { id: 'tr_4021', agentId: 'agt_8f3k2', at: ago(3), durationMs: 2100, tokens: 3120, cost: 0.011, status: 'ok', input: 'Erreur 500 sur /api/invoices', spans: spans() },
  { id: 'tr_4020', agentId: 'agt_2m9qa', at: ago(9), durationMs: 800, tokens: 1040, cost: 0.004, status: 'ok', input: 'Publication #88213', spans: spans().slice(0, 4) },
  { id: 'tr_4019', agentId: 'agt_7x1pd', at: ago(17), durationMs: 4600, tokens: 5880, cost: 0.021, status: 'ok', input: 'Comment ajouter un rôle Éditeur ?', spans: spans() },
  { id: 'tr_4018', agentId: 'agt_8f3k2', at: ago(26), durationMs: 2930, tokens: 2210, cost: 0.008, status: 'error', input: 'Latence p95 > 2 s sur /search', spans: spans(true) },
  { id: 'tr_4017', agentId: 'agt_5c8vn', at: ago(31), durationMs: 12_300, tokens: 26_400, cost: 0.31, status: 'error', input: 'PR #142 · refactor auth', spans: spans(true) },
  { id: 'tr_4016', agentId: 'agt_7x1pd', at: ago(44), durationMs: 3900, tokens: 4710, cost: 0.017, status: 'ok', input: 'Où changer le logo ?', spans: spans() },
  { id: 'tr_4015', agentId: 'agt_2m9qa', at: ago(58), durationMs: 760, tokens: 990, cost: 0.004, status: 'ok', input: 'Compte #4821', spans: spans().slice(0, 4) },
]

const LOG_LINES: [string, LogEntry['level'], string][] = [
  ['agt_8f3k2', 'info', 'cron */5 déclenché, 3 services vérifiés'],
  ['agt_8f3k2', 'warn', 'latence p95 /search = 2 140 ms (seuil 2 000 ms)'],
  ['agt_7x1pd', 'info', 'widget · message reçu (session ws_91ad)'],
  ['agt_2m9qa', 'info', 'posts.insert #88213 → score 0,12 (sain)'],
  ['agt_8f3k2', 'error', 'tickets.create a expiré après 1 200 ms, nouvel essai dans 30 s'],
  ['agt_5c8vn', 'error', 'git.diff refusé : jeton expiré pour le dépôt outils-internes'],
  ['agt_2m9qa', 'warn', 'compte #4821 · 14 publications en 3 min, action proposée'],
  ['agt_7x1pd', 'debug', 'recherche kb « rôle éditeur » → 4 extraits, 812 tokens'],
  ['agt_8f3k2', 'info', 'alerte envoyée à #incidents (gravité haute)'],
]

export const logs: LogEntry[] = LOG_LINES.map(([agentId, level, message], i) => ({
  id: `log_${i}`,
  at: ago(LOG_LINES.length - i),
  agentId,
  level,
  message,
  traceId: i % 3 === 0 ? 'tr_4021' : undefined,
}))

export const liveLogPool = LOG_LINES

export const approvals: Approval[] = [
  { id: 'apr_1', agentId: 'agt_8f3k2', action: 'Redémarrer le service search-api', reason: 'Latence p95 au-dessus du seuil depuis 12 min', risk: 'high', requestedAt: ago(4) },
  { id: 'apr_2', agentId: 'agt_2m9qa', action: 'Suspendre le compte #4821', reason: '14 publications identiques en 3 minutes', risk: 'medium', requestedAt: ago(11) },
  { id: 'apr_3', agentId: 'agt_2m9qa', action: 'Masquer 12 publications signalées', reason: 'Liens vers un domaine de hameçonnage connu', risk: 'medium', requestedAt: ago(37) },
]

export const audit: AuditEntry[] = [
  { id: 'aud_1', at: ago(18), actor: 'Gardien technique', action: 'a envoyé une alerte', target: '#incidents · gravité haute' },
  { id: 'aud_2', at: ago(42), actor: 'Abdoul Karim', action: 'a déployé la v3', target: 'Gardien technique · production' },
  { id: 'aud_3', at: ago(70), actor: 'Inès Diallo', action: 'a approuvé', target: 'Suspension du compte #4710' },
  { id: 'aud_4', at: ago(95), actor: 'Système', action: 'plafond de coût atteint à 80 %', target: 'Modérateur anti-abus' },
  { id: 'aud_5', at: ago(150), actor: 'Abdoul Karim', action: 'a régénéré une clé API', target: 'Clé de production' },
  { id: 'aud_6', at: ago(212), actor: 'Inès Diallo', action: 'a ajouté une skill', target: 'Rapports d’activité → Rapports hebdo' },
  { id: 'aud_7', at: ago(60 * 26), actor: 'Abdoul Karim', action: 'a invité', target: 'theo@bonaco.pro (Lecteur)' },
]

export const evals: EvalSuite[] = [
  { id: 'ev_1', name: 'Régression · Gardien technique', agentId: 'agt_8f3k2', cases: 42, lastScore: 100, lastRunAt: ago(60 * 5) },
  { id: 'ev_2', name: 'Anti-abus · cas limites', agentId: 'agt_2m9qa', cases: 60, lastScore: 93, lastRunAt: ago(60 * 22) },
  { id: 'ev_3', name: 'Injection de prompt (red team)', agentId: 'agt_7x1pd', cases: 35, lastScore: 97, lastRunAt: ago(60 * 30) },
  { id: 'ev_4', name: 'Assistant · questions fréquentes', agentId: 'agt_7x1pd', cases: 80, lastScore: 96, lastRunAt: ago(60 * 48) },
  { id: 'ev_5', name: 'Revue · failles connues', agentId: 'agt_5c8vn', cases: 24, lastScore: null, lastRunAt: null },
]

export const knowledge: KnowledgeDoc[] = [
  { id: 'kb_1', name: 'Guide administrateur Bonaco Pro.pdf', kind: 'pdf', size: '2,4 Mo', status: 'indexed', chunks: 312 },
  { id: 'kb_2', name: 'Politique de modération.docx', kind: 'docx', size: '180 Ko', status: 'indexed', chunks: 41 },
  { id: 'kb_3', name: 'https://docs.bonaco.pro', kind: 'website', size: '42 pages', status: 'indexed', chunks: 508 },
  { id: 'kb_4', name: 'runbook-incidents.md', kind: 'markdown', size: '22 Ko', status: 'indexed', chunks: 19 },
]

export const memories: MemoryItem[] = [
  { id: 'mem_1', agentId: 'agt_8f3k2', text: 'Préfère les alertes par email en dehors des heures de bureau.', createdAt: ago(60 * 24 * 4) },
  { id: 'mem_2', agentId: 'agt_8f3k2', text: 'Le seuil d’alerte sur le taux d’erreur est fixé à 2 %.', createdAt: ago(60 * 24 * 9) },
  { id: 'mem_3', agentId: 'agt_4r0lw', text: 'Les rapports partent le lundi, jamais pendant les congés de l’équipe.', createdAt: ago(60 * 24 * 11) },
]

export const templates: Template[] = [
  { id: 'tpl_1', name: 'Gardien technique', type: 'monitoring', description: 'Surveille erreurs, lenteurs et pannes, ouvre des tickets.', capabilities: ['Lire les journaux', 'Connecteurs MCP'] },
  { id: 'tpl_2', name: 'Modérateur anti-abus', type: 'decision', description: 'Repère spam et fraude, propose une action graduée.', capabilities: ['Base de connaissances'] },
  { id: 'tpl_3', name: 'Assistant de documentation', type: 'conversational', description: 'Répond aux questions à partir de votre documentation.', capabilities: ['Base de connaissances', 'Mémoire long terme'] },
  { id: 'tpl_4', name: 'Analyste de données', type: 'data', description: 'Nettoie, résume et suit vos indicateurs.', capabilities: ['Appeler une API', 'Générer des fichiers'] },
  { id: 'tpl_5', name: 'Rédacteur de notes de version', type: 'content', description: 'Transforme les commits en notes de version lisibles.', capabilities: ['Connecteurs MCP'] },
  { id: 'tpl_6', name: 'Relecteur de code', type: 'development', description: 'Relit et teste les pull requests.', capabilities: ['Connecteurs MCP'] },
  { id: 'tpl_7', name: 'Lecteur de documents', type: 'perception', description: 'Extrait les données de factures et formulaires.', capabilities: ['Générer des fichiers'] },
  { id: 'tpl_8', name: 'Chef d’orchestre', type: 'orchestrator', description: 'Coordonne plusieurs agents sur un même incident.', capabilities: ['Sous-agents (A2A)'] },
]

export const team: TeamMember[] = [
  { id: 'usr_1', name: 'Abdoul Karim', email: 'abdoul@bonaco.pro', role: 'admin', lastActiveAt: ago(1) },
  { id: 'usr_2', name: 'Inès Diallo', email: 'ines@bonaco.pro', role: 'editor', lastActiveAt: ago(35) },
  { id: 'usr_3', name: 'Théo Martin', email: 'theo@bonaco.pro', role: 'viewer', lastActiveAt: ago(60 * 26) },
]

export const apiKeys: ApiKey[] = [
  { id: 'key_1', name: 'Production · Bonaco Pro', prefix: 'fa_live_8f3k', environment: 'live', createdAt: ago(60 * 24 * 30), lastUsedAt: ago(1) },
  { id: 'key_2', name: 'Tests locaux', prefix: 'fa_test_2a9c', environment: 'test', createdAt: ago(60 * 24 * 6), lastUsedAt: ago(60 * 5) },
]

export const webhooks: Webhook[] = [
  { id: 'wh_1', url: 'https://app.bonaco.pro/hooks/forgeagent', events: ['run.completed', 'approval.requested'], enabled: true },
]

export const notifications: Notification[] = [
  { id: 'ntf_1', title: '3 actions attendent votre validation', body: 'Gardien technique, Modérateur anti-abus', href: '/app/security', read: false, at: ago(4) },
  { id: 'ntf_2', title: 'Relecteur de code est en erreur', body: 'Jeton du dépôt expiré', href: '/app/agents/agt_5c8vn', read: false, at: ago(14) },
  { id: 'ntf_3', title: 'Plafond de coût atteint à 80 %', body: 'Modérateur anti-abus', href: '/app/usage', read: false, at: ago(95) },
  { id: 'ntf_4', title: 'Évaluation terminée : 100 %', body: 'Régression · Gardien technique', href: '/app/evals', read: true, at: ago(60 * 5) },
]

export const workflows: Workflow[] = [
  {
    id: 'wf_1',
    name: 'Incident 5xx',
    agentId: 'agt_8f3k2',
    published: true,
    nodes: [
      { id: 'n1', kind: 'trigger', label: 'Webhook : erreur 5xx', x: 24, y: 24, retry: false },
      { id: 'n2', kind: 'model', label: 'Évaluer la gravité', x: 284, y: 24, retry: true },
      { id: 'n3', kind: 'condition', label: 'Gravité haute ?', x: 544, y: 24, retry: false },
      { id: 'n4', kind: 'approval', label: 'Valider le redémarrage', x: 24, y: 164, retry: false },
      { id: 'n5', kind: 'tool', label: 'Redémarrer search-api', x: 284, y: 164, retry: true },
      { id: 'n6', kind: 'output', label: 'Alerte #incidents', x: 544, y: 164, retry: false },
    ],
  },
]

export const delegations: Delegation[] = [
  { id: 'dl_1', fromAgentId: 'agt_8f3k2', toAgentId: 'agt_4r0lw', enabled: true },
  { id: 'dl_2', fromAgentId: 'agt_2m9qa', toAgentId: 'agt_7x1pd', enabled: false },
]

export const schedules: Schedule[] = [
  { id: 'sch_1', agentId: 'agt_4r0lw', cron: '0 8 * * 1', label: 'Chaque lundi à 08:00', enabled: true },
  { id: 'sch_2', agentId: 'agt_8f3k2', cron: '*/5 * * * *', label: 'Toutes les 5 minutes', enabled: true },
]

export const settings: Settings = {
  modelRouting: { simple: 'claude-haiku-5-5', complex: 'claude-opus-5-5', fallback: 'claude-sonnet-5-5' },
  retentionDays: 90,
  anonymizeTraces: true,
  monthlyBudget: 400,
  budgetAlertPct: 80,
  killSwitch: false,
  gateway: { costRouting: true, fallback: true, cache: true, logging: true },
  globalGuardrails: { promptInjection: true, piiMasking: true, humanApproval: true, rateLimit: true, forbiddenList: true },
  otelEndpoint: '',
  notifications: {
    'approval.requested': true,
    'budget.threshold': true,
    'run.failed': true,
    'report.weekly': false,
    'version.deployed': true,
  },
  notificationChannel: 'email',
  instanceUrl: 'http://localhost:8787',
  anthropicKeySet: true,
}

export const runsByDay = [
  { day: 'ven. 18', runs: 2810, errors: 31 },
  { day: 'sam. 19', runs: 1960, errors: 12 },
  { day: 'dim. 20', runs: 1720, errors: 9 },
  { day: 'lun. 21', runs: 3390, errors: 48 },
  { day: 'mar. 22', runs: 3150, errors: 40 },
  { day: 'mer. 23', runs: 3604, errors: 52 },
  { day: 'jeu. 24', runs: 3482, errors: 45 },
]
