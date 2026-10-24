import {
  Activity,
  BookOpen,
  Bot,
  Boxes,
  Cable,
  ChartColumn,
  CircleDollarSign,
  FlaskConical,
  FolderKanban,
  LayoutGrid,
  Library,
  ListChecks,
  type LucideIcon,
  Plus,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Users,
  Workflow,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** "g" + key shortcut */
  key?: string
  keywords?: string
}

export const NAV: { group: string | null; items: NavItem[] }[] = [
  { group: null, items: [{ to: '/app', label: 'Tableau de bord', icon: LayoutGrid, key: 'd', keywords: 'accueil overview' }] },
  {
    group: 'Construire',
    items: [
      { to: '/app/agents', label: 'Agents', icon: Boxes, key: 'a', keywords: 'liste' },
      { to: '/app/agents/new', label: 'Créer un agent', icon: Plus, key: 'n', keywords: 'nouveau assistant' },
      { to: '/app/workflows', label: 'Workflows', icon: Workflow, key: 'w', keywords: 'orchestration a2a cron' },
      { to: '/app/skills', label: 'Skills', icon: Sparkles, key: 'k', keywords: 'compétences' },
      { to: '/app/knowledge', label: 'Connaissances', icon: Library, keywords: 'documents mémoire rag' },
      { to: '/app/templates', label: 'Modèles d’agents', icon: ListChecks, keywords: 'templates' },
    ],
  },
  {
    group: 'Déployer',
    items: [
      { to: '/app/projects', label: 'Projets', icon: FolderKanban, key: 'p', keywords: 'bonaco environnements' },
      { to: '/app/integrations', label: 'Intégrations', icon: Cable, key: 'i', keywords: 'widget api sdk mcp clés' },
      { to: '/app/playground', label: 'Environnement de test', icon: SquareTerminal, key: 't', keywords: 'sandbox simulateur' },
      { to: '/app/evals', label: 'Évaluations', icon: FlaskConical, keywords: 'tests red team' },
    ],
  },
  {
    group: 'Opérer',
    items: [
      { to: '/app/observability', label: 'Observabilité', icon: Activity, key: 'o', keywords: 'traces logs' },
      { to: '/app/internal-team', label: 'Équipe interne', icon: Bot, key: 'e', keywords: 'orchestrateur architecte sécurité testeur superviseur multi-agents' },
      { to: '/app/security', label: 'Sécurité', icon: ShieldCheck, key: 's', keywords: 'garde-fous arrêt validations' },
      { to: '/app/audit', label: 'Journal d’audit', icon: ScrollText, keywords: 'historique' },
      { to: '/app/usage', label: 'Coûts et usage', icon: CircleDollarSign, key: 'u', keywords: 'budget facturation' },
    ],
  },
  {
    group: 'Organisation',
    items: [
      { to: '/app/team', label: 'Équipe et accès', icon: Users, keywords: 'rôles membres' },
      { to: '/app/settings', label: 'Paramètres', icon: Settings, keywords: 'modèles clés webhooks' },
      { to: '/docs', label: 'Documentation', icon: BookOpen, keywords: 'aide guide' },
    ],
  },
]

export const NAV_FLAT = NAV.flatMap((g) => g.items)

export const STATS_ICON = ChartColumn
