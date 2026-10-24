import type {
  AgentStatus,
  AgentType,
  Environment,
  Autonomy,
  ClaudeModel,
  IntegrationChannel,
  LogLevel,
  Role,
  TriggerKind,
  WorkflowNodeKind,
} from '@/api/types'

/** French UI labels for every enum of the domain. Code stays in English. */

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
  orchestrator: { label: 'Orchestrateur', hint: 'Pilote et coordonne d’autres agents', subcategories: ['Équipe d’agents', 'Workflows', 'Supervision'] },
}

export const AGENT_TYPE_ORDER = Object.keys(AGENT_TYPES) as AgentType[]

export const STATUS: Record<AgentStatus, { label: string; tone: 'ok' | 'muted' | 'danger' | 'warn' }> = {
  active: { label: 'Actif', tone: 'ok' },
  paused: { label: 'En pause', tone: 'muted' },
  error: { label: 'En erreur', tone: 'danger' },
  draft: { label: 'Brouillon', tone: 'warn' },
}

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
  agent: 'Autre agent (A2A)',
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
  'Sous-agents (A2A)',
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
  sdk_js: { label: 'SDK JavaScript', hint: 'Node, Deno, Bun, navigateur' },
  sdk_python: { label: 'SDK Python', hint: 'Scripts, workers, notebooks' },
  mcp_server: { label: 'Serveur MCP', hint: 'Exposé à d’autres agents' },
  webhook_out: { label: 'Webhook sortant', hint: 'Pousse les résultats vers une URL' },
}

export const ROLES: Record<Role, string> = { admin: 'Administrateur', editor: 'Éditeur', viewer: 'Lecteur' }

export const LOG_LEVELS: Record<LogLevel, string> = { debug: 'debug', info: 'info', warn: 'warn', error: 'error' }

export const NODE_KINDS: Record<WorkflowNodeKind, string> = {
  trigger: 'Déclencheur',
  model: 'Modèle',
  condition: 'Condition',
  approval: 'Validation humaine',
  tool: 'Outil',
  subagent: 'Sous-agent (A2A)',
  output: 'Sortie',
}

export const ENV_LABEL: Record<Environment, string> = { test: 'Test', staging: 'Préproduction', production: 'Production' }
