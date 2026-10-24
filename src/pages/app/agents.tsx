import { Copy, MoreHorizontal, Pause, Play, Plus, Search, SquareTerminal, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useProjects } from '@/api/hooks'
import type { Agent, AgentStatus as Status, AgentType } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { NativeSelect } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { AgentStatus, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { num, pct, relative, usd } from '@/lib/format'
import { AGENT_TYPE_ORDER, AGENT_TYPES, AUTONOMY, MODELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Tab = 'all' | Status

function RowMenu({ agent, onDelete }: { agent: Agent; onDelete: () => void }) {
  const navigate = useNavigate()
  const toggle = useAction(() => api.agents.update(agent.id, { status: agent.status === 'active' ? 'paused' : 'active' }), {
    invalidate: [keys.agents, keys.agent(agent.id)],
    success: agent.status === 'active' ? `${agent.name} mis en pause` : `${agent.name} activé`,
  })
  const projects = useProjects()
  const dup = useAction(() => api.agents.duplicate(agent.id, agent.projectIds[0] ?? projects.data?.[0]?.id ?? ''), {
    invalidate: [keys.agents],
    success: (a) => `Copie créée : ${a.name}`,
  })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={`Actions pour ${agent.name}`}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={() => navigate(`/app/playground?agent=${agent.id}`)}>
          <SquareTerminal /> Tester
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => toggle.mutate(undefined)}>
          {agent.status === 'active' ? <Pause /> : <Play />} {agent.status === 'active' ? 'Mettre en pause' : 'Activer'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => dup.mutate(undefined)}>
          <Copy /> Dupliquer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function Agents() {
  const agents = useAgents()
  const projects = useProjects()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('status') as Tab) || 'all'
  const [q, setQ] = useState('')
  const [type, setType] = useState<AgentType | ''>('')
  const [project, setProject] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<Agent | null>(null)

  const remove = useAction((id: string) => api.agents.remove(id), {
    invalidate: [keys.agents],
    success: 'Agent supprimé',
    onSuccess: () => setToDelete(null),
  })
  const bulk = useAction(
    (status: 'active' | 'paused') => Promise.all(selected.map((id) => api.agents.update(id, { status }))),
    {
      invalidate: [keys.agents],
      success: (_, s) => `${selected.length} agent(s) ${s === 'active' ? 'activé(s)' : 'mis en pause'}`,
      onSuccess: () => setSelected([]),
    },
  )

  const filtered = useMemo(() => {
    const list = agents.data ?? []
    const needle = q.trim().toLowerCase()
    return list.filter(
      (a) =>
        (tab === 'all' || a.status === tab) &&
        (!type || a.type === type) &&
        (!project || a.projectIds.includes(project)) &&
        (!needle || `${a.name} ${a.mission} ${a.id}`.toLowerCase().includes(needle)),
    )
  }, [agents.data, tab, q, type, project])

  const count = (s: Tab) => (agents.data ?? []).filter((a) => s === 'all' || a.status === s).length
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? '—'
  const allChecked = filtered.length > 0 && filtered.every((a) => selected.includes(a.id))

  return (
    <>
      <PageHeader
        title="Agents"
        description="Tous vos agents, tous types confondus. Ouvrez-en un pour le modifier, le tester ou le relier à un site."
        actions={
          <LinkButton to="/app/agents/new">
            <Plus /> Créer un agent
          </LinkButton>
        }
      />

      <UnderlineTabs
        label="Filtrer par statut"
        value={tab}
        onChange={(v) => {
          setParams(v === 'all' ? {} : { status: v })
          setSelected([])
        }}
        items={[
          { value: 'all', label: 'Tous', count: count('all') },
          { value: 'active', label: 'Actifs', count: count('active') },
          { value: 'paused', label: 'En pause', count: count('paused') },
          { value: 'error', label: 'En erreur', count: count('error') },
          { value: 'draft', label: 'Brouillons', count: count('draft') },
        ]}
      />

      <div className="mt-6 mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom, mission ou ID" className="h-9 pl-9" aria-label="Rechercher un agent" />
        </div>
        <NativeSelect value={type} onChange={(e) => setType(e.target.value as AgentType | '')} aria-label="Type d’agent" className="md:w-52">
          <option value="">Tous les types</option>
          {AGENT_TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {AGENT_TYPES[t].label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={project} onChange={(e) => setProject(e.target.value)} aria-label="Projet" className="md:w-48">
          <option value="">Tous les projets</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <span className="text-[13px] text-muted-foreground md:ml-auto tabular">{filtered.length} agent(s)</span>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[14px]">
          <span className="font-medium">{selected.length} sélectionné(s)</span>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate('active')} disabled={bulk.isPending}>
            <Play /> Activer
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate('paused')} disabled={bulk.isPending}>
            <Pause /> Mettre en pause
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])} className="ml-auto">
            Désélectionner
          </Button>
        </div>
      )}

      <Async query={agents}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="Aucun agent pour l’instant"
              description="Créez votre premier agent ou partez d’un modèle prêt à l’emploi."
              action={
                <div className="flex gap-2">
                  <LinkButton to="/app/agents/new">Créer un agent</LinkButton>
                  <LinkButton to="/app/templates" variant="outline">
                    Voir les modèles
                  </LinkButton>
                </div>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Aucun agent ne correspond"
              description="Modifiez la recherche ou les filtres."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQ('')
                    setType('')
                    setProject('')
                    setParams({})
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-[12.5px] text-muted-foreground">
                      <th className="w-10 pb-2">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(c) => setSelected(c ? filtered.map((a) => a.id) : [])}
                          aria-label="Tout sélectionner"
                        />
                      </th>
                      <th className="pb-2 font-medium">Agent</th>
                      <th className="pb-2 font-medium">Statut</th>
                      <th className="pb-2 font-medium">Projet</th>
                      <th className="pb-2 font-medium">Modèle</th>
                      <th className="pb-2 text-right font-medium">Exéc. 24 h</th>
                      <th className="pb-2 text-right font-medium">Succès</th>
                      <th className="pb-2 text-right font-medium">Coût / plafond</th>
                      <th className="w-10 pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className={cn('border-t transition-colors hover:bg-card/60', selected.includes(a.id) && 'bg-card')}>
                        <td className="py-3">
                          <Checkbox
                            checked={selected.includes(a.id)}
                            onCheckedChange={(c) => setSelected((s) => (c ? [...s, a.id] : s.filter((x) => x !== a.id)))}
                            aria-label={`Sélectionner ${a.name}`}
                          />
                        </td>
                        <td className="max-w-[340px] py-3 pr-4">
                          <Link to={`/app/agents/${a.id}`} className="font-medium hover:underline">
                            {a.name}
                          </Link>
                          <div className="truncate text-[12.5px] text-muted-foreground">
                            {AGENT_TYPES[a.type].label} · {AUTONOMY[a.autonomy].label} · v{a.version} · modifié {relative(a.updatedAt)}
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <AgentStatus status={a.status} />
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{a.projectIds.map(projectName).join(', ') || '—'}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{MODELS[a.model].label.replace('Claude ', '')}</td>
                        <td className="py-3 text-right tabular">{num(a.metrics.runs24h)}</td>
                        <td className={cn('py-3 text-right tabular', a.metrics.successRate < 95 && 'text-danger')}>{pct(a.metrics.successRate)}</td>
                        <td className="py-3 text-right whitespace-nowrap tabular">
                          {usd(a.metrics.costToday)} <span className="text-muted-foreground">/ {a.costCapPerDay} $</span>
                        </td>
                        <td className="py-3 text-right">
                          <RowMenu agent={a} onDelete={() => setToDelete(a)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile: two-line rows */}
              <ul className="grid gap-2 md:hidden">
                {filtered.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg bg-card p-4">
                    <Link to={`/app/agents/${a.id}`} className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="text-[13px] tabular">{num(a.metrics.runs24h)} exéc.</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                        <AgentStatus status={a.status} />
                        <Tag>{AGENT_TYPES[a.type].label}</Tag>
                        <span>{usd(a.metrics.costToday)}</span>
                      </div>
                    </Link>
                    <RowMenu agent={a} onDelete={() => setToDelete(a)} />
                  </li>
                ))}
              </ul>
            </>
          )
        }
      </Async>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer « ${toDelete?.name ?? ''} » ?`}
        description="L’agent, ses versions, sa mémoire et ses déclencheurs seront supprimés. Les intégrations qui l’appellent renverront une erreur 404. Cette action est irréversible."
        confirmText={toDelete?.name}
        confirmLabel="Supprimer l’agent"
        pending={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      />
    </>
  )
}
