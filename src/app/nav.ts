import type { ComponentType } from 'react'
import { BookOpen, Boxes, Cable, ChartColumn, FlaskConical, FolderKanban, LayoutGrid, ScrollText, Settings, Sparkles } from 'lucide-react'
import { ForgeGlyph } from '@/components/brand/logo'
import { L } from '@/labels'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  /** "g" + key shortcut */
  key?: string
  keywords?: string
}

/** Navigation labels come from src/labels.ts (FORGE_THEME §1). */
export const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { to: '/app', label: L.nav.dashboard, icon: LayoutGrid, key: 'd', keywords: 'accueil vue d’ensemble' },
      { to: '/app/agents', label: L.nav.agents, icon: Boxes, key: 'a', keywords: 'liste espace agent' },
      { to: '/app/skills', label: L.nav.skills, icon: Sparkles, key: 'k', keywords: 'compétences' },
      { to: '/app/test', label: L.nav.test, icon: FlaskConical, key: 't', keywords: 'bac à sable évaluation essai' },
      { to: '/app/integration', label: L.nav.integration, icon: Cable, key: 'i', keywords: 'widget api sdk mcp clés site' },
      { to: '/app/logs', label: L.nav.logs, icon: ScrollText, key: 'l', keywords: 'journal traces observabilité' },
      { to: '/app/projects', label: L.nav.projects, icon: FolderKanban, key: 'p', keywords: 'bonaco environnements' },
    ],
  },
  {
    group: 'Équipe interne',
    items: [{ to: '/app/forge', label: L.nav.forge, icon: ForgeGlyph, key: 'f', keywords: 'équipe interne orchestrateur architecte sécurité testeur superviseur' }],
  },
  {
    group: null,
    items: [
      { to: '/app/settings', label: L.nav.settings, icon: Settings, key: 's', keywords: 'compte plateforme administration' },
      { to: '/docs', label: L.nav.docs, icon: BookOpen, keywords: 'aide guide' },
    ],
  },
]

export const NAV_FLAT = NAV.flatMap((g) => g.items)

export const STATS_ICON = ChartColumn
