import type {
  AgentRole,
  AgentStatus,
  AgentType,
  Autonomy,
  ClaudeModel,
  Environment,
  IntegrationChannel,
  LogLevel,
  PlatformRole,
  TeamRole,
  TriggerKind,
  WorkflowNodeKind,
} from '@/api/types'

/**
 * Every label of the interface lives here (FORGE_THEME.md §1). Change a word once, it changes everywhere.
 * Rule: the forge theme is in the visuals and the brand; labels stay plain and explicit.
 * Only `action.createAgent`, `nav.forge` and the internal team display names carry the theme.
 */

export const L = {
  nav: {
    dashboard: 'Tableau de bord',
    agents: 'Agents',
    skills: 'Skills',
    test: 'Test',
    integration: 'Intégration',
    logs: 'Logs',
    projects: 'Projets',
    settings: 'Paramètres',
    forge: 'La Forge',
    docs: 'Documentation',
    notifications: 'Notifications',
    templates: 'Modèles d’agents',
  },
  action: {
    createAgent: 'Forger un agent',
    test: 'Tester',
    activate: 'Activer',
    pause: 'Mettre en pause',
    save: 'Enregistrer',
    publish: 'Publier',
    delete: 'Supprimer',
    export: 'Exporter',
    cancel: 'Annuler',
    retry: 'Réessayer',
  },
  agentTabs: {
    overview: 'Aperçu',
    knowledge: 'Connaissances et mémoire',
    integration: 'Intégration',
    tests: 'Test et évaluation',
    workflows: 'Workflows',
    audit: 'Audit',
    usage: 'Coûts et usage',
    access: 'Équipe et accès',
    docs: 'Documentation',
    settings: 'Paramètres',
  },
  forge: {
    title: 'La Forge',
    description: 'L’équipe interne qui conçoit, sécurise, construit, teste et surveille vos agents. Vous ne voyez que le travail effectué sur vos agents.',
    newRequest: 'Forger un agent',
  },
} as const

/* ---------- Agent states (FORGE_THEME §2) ---------- */

export const STATUS: Record<AgentStatus, { label: string; hint: string }> = {
  inactive: { label: 'Inactif', hint: 'En pause : aucune exécution réelle.' },
  starting: { label: 'Démarrage', hint: 'En construction ou en test.' },
  active: { label: 'Actif', hint: 'En production.' },
  validated: { label: 'Validé', hint: 'Tests réussis, prêt à être activé.' },
  error: { label: 'Erreur', hint: 'Une exécution ou un test a échoué.' },
}

export const STATUS_ORDER: AgentStatus[] = ['active', 'validated', 'starting', 'inactive', 'error']

/* ---------- Roles ---------- */

export const AGENT_ROLES: Record<AgentRole, { label: string; hint: string }> = {
  owner: { label: 'Propriétaire', hint: 'Tous les droits, dont la gestion des accès et la suppression.' },
  editor: { label: 'Éditeur', hint: 'Configure, teste et publie. Ne gère ni les accès ni la suppression.' },
  viewer: { label: 'Lecteur', hint: 'Consulte et teste en bac à sable.' },
}

export const PLATFORM_ROLES: Record<PlatformRole, string> = { admin: 'Administrateur de la plateforme', member: 'Membre' }

/* ---------- Internal team display layer (FORGE_THEME §3) ---------- */

export const TEAM: Record<TeamRole, { name: string; role: string; motto: string; accent: string; mission: string }> = {
  orchestrator: {
    name: 'Le Maître de Forge',
    role: 'Orchestrateur',
    motto: 'Chaque pièce à sa place.',
    accent: 'var(--crest-amber)',
    mission: 'Découpe chaque demande, assigne les tâches, assemble les résultats et décide de la suite.',
  },
  architect: {
    name: 'Le Dessinateur',
    role: 'Architecte',
    motto: 'Mesurer deux fois, forger une fois.',
    accent: 'var(--crest-brass)',
    mission: 'Conçoit la configuration, le plan et les permissions proposées.',
  },
  builder: {
    name: 'Le Forgeron',
    role: 'Constructeur',
    motto: 'Le métal suit le plan.',
    accent: 'var(--crest-ember)',
    mission: 'Génère l’agent à partir du plan validé et l’enregistre.',
  },
  security: {
    name: 'La Sentinelle',
    role: 'Sécurité',
    motto: 'Rien ne passe sans contrôle.',
    accent: 'var(--crest-steel)',
    mission: 'Examine chaque plan et chaque action ; peut refuser ou exiger une validation humaine.',
  },
  tester: {
    name: 'Le Trempeur',
    role: 'Testeur',
    motto: 'L’épreuve révèle la lame.',
    accent: 'var(--crest-quench)',
    mission: 'Lance l’environnement de test et l’évaluation de l’agent, produit un rapport.',
  },
  supervisor: {
    name: 'Le Veilleur de Feu',
    role: 'Superviseur',
    motto: 'Le feu ne dort jamais.',
    accent: 'var(--crest-fire)',
    mission: 'Surveille les agents actifs (logs, erreurs, coûts, dérives) et propose des corrections.',
  },
}

export const TEAM_ORDER: TeamRole[] = ['orchestrator', 'architect', 'security', 'builder', 'tester', 'supervisor']

/* ---------- Domain labels ---------- */

export const AGENT_TYPES: Record<AgentType, { label: string; hint: string; subcategories: string[] }> = {
  conversational: { label: 'Conversationnel', hint: 'Chat, support, assistants internes', subcategories: ['Support', 'Assistant interne', 'Accueil', 'FAQ'] },
  autonomous: { label: 'Autonome', hint: 'Tâches longues en arrière-plan', subcategories: ['Recherche', 'Rapports', 'Veille', 'Tri de données'] },
  reactive: { label: 'Réactif', hint: 'Réagit aux événements et webhooks', subcategories: ['Emails', 'Formulaires', 'Événements', 'Fichiers'] },
  monitoring: { label: 'Surveillance', hint: 'Monitoring, alertes, disponibilité', subcategories: ['Performance', 'Sécurité', 'Disponibilité', 'Coûts'] },
  data: { label: 'Données', hint: 'Analyse, nettoyage, extraction', subcategories: ['Nettoyage', 'Analyse', 'Prévision', 'Extraction'] },
  content: { label: 'Contenu', hint: 'Textes, images, publications', subcategories: ['Rédaction', 'Images', 'Réseaux sociaux', 'Traduction'] },
  development: { label: 'Développement', hint: 'Code, tests, déploiement', subcategories: ['Revue de code', 'Tests', 'Déploiement', 'Documentation'] },
  decision: { label: 'Décision', hint: 'Scoring, modération, routage', subcategories: ['Modération', 'Scoring', 'Routage', 'Fraude'] },
  perception: { label: 'Perception', hint: 'Vision, voix, documents', subcategories: ['Vision', 'Voix', 'Documents', 'Vidéo'] },
  orchestrator: { label: 'Orchestrateur', hint: 'Coordonne ses propres workflows', subcategories: ['Workflows', 'Supervision'] },
}

export const AGENT_TYPE_ORDER = Object.keys(AGENT_TYPES) as AgentType[]

export const AUTONOMY: Record<Autonomy, { label: string; hint: string }> = {
  suggest_only: { label: 'Suggère seulement', hint: 'Propose une action, un humain l’exécute.' },
  act_after_approval: { label: 'Agit après validation', hint: 'Prépare l’action et attend votre accord.' },
  act_alone_simple: { label: 'Agit seul (cas simples)', hint: 'Exécute seul les actions à faible risque.' },
}

export const MODELS: Record<ClaudeModel, { label: string; hint: string; inPerM: number; outPerM: number }> = {
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5', hint: 'Rapide et économique', inPerM: 1, outPerM: 5 },
  'claude-sonnet-5-5': { label: 'Claude Sonnet 5.5', hint: 'Équilibré, recommandé', inPerM: 3, outPerM: 15 },
  'claude-opus-5-5': { label: 'Claude Opus 5.5', hint: 'Raisonnement complexe', inPerM: 5, outPerM: 25 },
}

export const TRIGGERS: Record<TriggerKind, string> = {
  message: 'Message entrant',
  cron: 'Planning (cron)',
  webhook: 'Webhook',
  db_event: 'Événement en base',
  file: 'Fichier reçu',
}

export const CAPABILITIES = [
  'Connecteurs MCP',
  'Base de connaissances',
  'Mémoire long terme',
  'Envoyer des emails',
  'Appeler une API',
  'Écrire en base',
  'Lire les journaux',
  'Générer des fichiers',
  'Navigation web',
]

export const ACTIONS = [
  'Lire les journaux applicatifs',
  'Créer un ticket',
  'Envoyer une alerte',
  'Suspendre un compte',
  'Masquer une publication',
  'Modifier un réglage',
  'Redémarrer un service',
  'Envoyer un email groupé',
  'Écrire en base de données',
  'Agir sur le site externe',
]

export const INTEGRATIONS: Record<IntegrationChannel, { label: string; hint: string }> = {
  widget: { label: 'Widget web', hint: 'Une balise script sur votre site' },
  rest: { label: 'API REST', hint: 'Appel HTTP depuis votre back-end' },
  sdk_js: { label: 'JavaScript', hint: 'Node, Deno, Bun' },
  sdk_python: { label: 'Python', hint: 'Scripts, workers, notebooks' },
  mcp_server: { label: 'Serveur MCP', hint: 'Exposé à d’autres outils' },
  webhook_out: { label: 'Webhook sortant', hint: 'Pousse les résultats vers une URL' },
}

export const LOG_LEVELS: Record<LogLevel, string> = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' }

export const NODE_KINDS: Record<WorkflowNodeKind, string> = {
  trigger: 'Déclencheur',
  model: 'Modèle',
  condition: 'Condition',
  approval: 'Validation humaine',
  tool: 'Outil',
  output: 'Sortie',
}

export const ENV_LABEL: Record<Environment, string> = { test: 'Test', staging: 'Préproduction', production: 'Production' }

export const USAGE_SOURCES: Record<'run' | 'team' | 'eval' | 'workflow' | 'embedding', string> = {
  run: 'Exécutions',
  team: 'Équipe interne',
  eval: 'Évaluations',
  workflow: 'Workflows',
  embedding: 'Indexation',
}

export const ACTOR_TYPES: Record<'user' | 'agent' | 'team' | 'system' | 'platform', string> = {
  user: 'Utilisateur',
  agent: 'Agent',
  team: 'Équipe interne',
  system: 'Système',
  platform: 'Administration plateforme',
}
