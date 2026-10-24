import { ArrowLeft, Copy, Download, FlaskConical, MoreHorizontal, Pause, Play, Trash2 } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgent, useProjects } from '@/api/hooks'
import type { Agent } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { LinkButton } from '@/components/common/link-button'
import { ErrorState, LoadingBlock } from '@/components/common/states'
import { AgentStatus, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AGENT_ROLES, AGENT_TYPES, L } from '@/labels'
import { can } from './shared'

const TABS = {
  overview: lazy(() => import('./tab-overview')),
  knowledge: lazy(() => import('./tab-knowledge')),
  integration: lazy(() => import('./tab-integration')),
  tests: lazy(() => import('./tab-tests')),
  workflows: lazy(() => import('./tab-workflows')),
  audit: lazy(() => import('./tab-audit')),
  usage: lazy(() => import('./tab-usage')),
  access: lazy(() => import('./tab-access')),
  docs: lazy(() => import('./tab-docs')),
  settings: lazy(() => import('./tab-settings')),
} satisfies Record<keyof typeof L.agentTabs, unknown>
type TabId = keyof typeof TABS

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

function Header({ agent, onTab }: { agent: Agent; onTab: (t: TabId) => void }) {
  const navigate = useNavigate()
  const projects = useProjects()
  const [del, setDel] = useState(false)
  const [exported, setExported] = useState(false)
  const status = useAction((s: Agent['status']) => api.agents.setStatus(agent.id, s), {
    invalidate: [keys.agent(agent.id), keys.agents, keys.overview],
    success: (_, s) => (s === 'active' ? 'Agent activé' : 'Agent mis en pause'),
  })
  const dup = useAction(() => api.agents.duplicate(agent.id), { invalidate: [keys.agents], success: 'Copie créée (sans données)', onSuccess: (a) => navigate(`/app/agents/${a.id}`) })
  const exp = useAction(() => api.agents.exportData(agent.id), {
    success: 'Export téléchargé',
    onSuccess: (data) => {
      download(`${agent.id}-export.json`, data)
      setExported(true)
    },
  })
  const remove = useAction(() => api.agents.remove(agent.id), { invalidate: [keys.agents, keys.overview], success: 'Agent supprimé et purgé', onSuccess: () => navigate('/app/agents') })

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.035em] md:text-[32px]">{agent.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-muted-foreground">
            <AgentStatus status={agent.status} />
            <span>
              {AGENT_TYPES[agent.type].label}
              {agent.subcategory ? ` · ${agent.subcategory}` : ''}
            </span>
            <span>v{agent.version}</span>
            <span>{agent.projectIds.map((p) => projects.data?.find((x) => x.id === p)?.name).filter(Boolean).join(', ')}</span>
            <span title={AGENT_ROLES[agent.myRole].hint}>
              <Tag>Vous : {AGENT_ROLES[agent.myRole].label}</Tag>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onTab('tests')}>
            <FlaskConical /> {L.action.test}
          </Button>
          {can(agent, 'editor') &&
            (agent.status === 'active' ? (
              <Button variant="outline" onClick={() => status.mutate('inactive')} disabled={status.isPending}>
                <Pause /> {L.action.pause}
              </Button>
            ) : (
              <Button className="glow-molten bg-ember text-ember-ink hover:bg-ember/90" onClick={() => status.mutate('active')} disabled={status.isPending || agent.status === 'starting'}>
                <Play /> {L.action.activate}
              </Button>
            ))}
          {can(agent, 'editor') && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Plus d’actions">
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItem onClick={() => dup.mutate(undefined)}>
                  <Copy /> Dupliquer la configuration
                </DropdownMenuItem>
                {can(agent, 'owner') && (
                  <>
                    <DropdownMenuItem onClick={() => exp.mutate(undefined)}>
                      <Download /> {L.action.export} les données
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDel(true)}>
                      <Trash2 /> Supprimer et purger
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Supprimer « ${agent.name} » ?`}
        description={`Tout ce qui appartient à cet agent est purgé : configuration, versions, connaissances et vecteurs, fichiers, mémoire, secrets, clés, workflows, coûts et audit. ${exported ? 'L’export a été téléchargé.' : 'Exportez d’abord ses données si vous voulez les conserver.'}`}
        confirmText={agent.name}
        confirmLabel="Supprimer et purger"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </>
  )
}

export default function AgentWorkspace() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = ((params.get('tab') as TabId) in TABS ? params.get('tab') : 'overview') as TabId
  const agent = useAgent(id)

  if (agent.isPending) return <LoadingBlock label="Chargement de l’agent…" />
  if (agent.isError)
    return (
      <div className="grid gap-4">
        <LinkButton to="/app/agents" variant="ghost" className="w-fit">
          <ArrowLeft /> {L.nav.agents}
        </LinkButton>
        <ErrorState error={agent.error} onRetry={() => agent.refetch()} />
      </div>
    )
  const a = agent.data
  const Tab = TABS[tab]
  const go = (t: TabId) => setParams({ tab: t })

  return (
    <>
      <LinkButton to="/app/agents" variant="ghost" size="sm" className="-ml-2.5 mb-4 text-muted-foreground">
        <ArrowLeft /> {L.nav.agents}
      </LinkButton>
      <Header agent={a} onTab={go} />
      <UnderlineTabs label="Espace de l’agent" value={tab} onChange={go} items={(Object.keys(TABS) as TabId[]).map((value) => ({ value, label: L.agentTabs[value] }))} className="mb-8" />
      <div role="tabpanel" aria-label={L.agentTabs[tab]}>
        <Suspense fallback={<LoadingBlock />}>
          <Tab agent={a} onTab={go} />
        </Suspense>
      </div>
    </>
  )
}

export type TabProps = { agent: Agent; onTab: (t: TabId) => void }
