import { ArrowUpRight, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAgents, useApprovals, useOverview, useProjects, useSettings } from '@/api/hooks'
import { ColumnChart, KpiStrip } from '@/components/common/charts'
import { LinkButton } from '@/components/common/link-button'
import { LogStream } from '@/components/common/log-stream'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, RowsSkeleton } from '@/components/common/states'
import { AgentStatus, StatusDot } from '@/components/common/status'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { duration, num, pct, usd } from '@/lib/format'
import { AGENT_TYPES } from '@/lib/labels'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'fa:onboarding-dismissed'

function GettingStarted() {
  const projects = useProjects()
  const agents = useAgents()
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden) return null
  const steps = [
    { title: 'Créer un projet', text: 'Rattachez vos agents à une application.', to: '/app/projects', done: !!projects.data?.length },
    { title: 'Créer un agent', text: 'Identité, rôle, permissions, skills.', to: '/app/agents/new', done: !!agents.data?.length },
    { title: 'Tester en bac à sable', text: 'Vérifiez connexion et configuration.', to: '/app/playground', done: false },
    { title: 'Intégrer à votre site', text: 'Widget, API, SDK ou serveur MCP.', to: '/app/integrations', done: false },
  ]
  return (
    <Section
      title="Premiers pas"
      meta={`${steps.filter((s) => s.done).length} sur ${steps.length}`}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(DISMISS_KEY, '1')
            } catch {
              /* ignore */
            }
          }}
        >
          <X /> Masquer
        </Button>
      }
    >
      <div className="grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Link key={s.title} to={s.to} className="group relative bg-card p-5 transition-colors hover:bg-raised">
            <div className="flex items-center gap-2 text-[15px] font-semibold">
              {s.done ? <Check className="size-4 text-ok" aria-label="Fait" /> : <span className="hex size-2.5 bg-muted-foreground/50" aria-hidden />}
              {s.title}
            </div>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">{s.text}</p>
            <ArrowUpRight className="absolute top-4 right-4 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ))}
      </div>
    </Section>
  )
}

function ToHandle() {
  const approvals = useApprovals()
  const agents = useAgents()
  const settings = useSettings()
  const errored = agents.data?.filter((a) => a.status === 'error') ?? []
  const nearCap = agents.data?.filter((a) => a.metrics.costToday >= a.costCapPerDay * 0.8 && a.costCapPerDay > 0) ?? []
  const items = [
    approvals.data?.length
      ? { tone: 'warn' as const, text: `${approvals.data.length} action${approvals.data.length > 1 ? 's' : ''} en attente de validation`, to: '/app/security#approvals' }
      : null,
    ...errored.map((a) => ({ tone: 'danger' as const, text: `${a.name} est en erreur`, to: `/app/agents/${a.id}?tab=logs` })),
    ...nearCap.map((a) => ({ tone: 'warn' as const, text: `${a.name} : plafond de coût à 80 %`, to: `/app/agents/${a.id}?tab=config` })),
    settings.data?.killSwitch ? { tone: 'danger' as const, text: 'Arrêt d’urgence actif', to: '/app/security#kill' } : null,
  ].filter(Boolean) as { tone: 'warn' | 'danger'; text: string; to: string }[]

  if (approvals.isPending || agents.isPending) return <RowsSkeleton rows={3} />
  return (
    <Panel className="p-2">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-3 py-4 text-[14px] text-muted-foreground">
          <Check className="size-4 text-ok" /> Rien à traiter. Tous les agents tournent normalement.
        </p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.text}>
              <Link to={it.to} className="flex items-center gap-3 rounded-md px-3 py-3 text-[14px] transition-colors hover:bg-secondary">
                <StatusDot tone={it.tone} />
                <span className="flex-1">{it.text}</span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export default function Dashboard() {
  const overview = useOverview()
  const agents = useAgents()
  const settings = useSettings()

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vos agents, leur activité des dernières 24 heures et ce qui demande votre attention."
        actions={
          <>
            <LinkButton to="/app/playground" variant="outline">
              Tester un agent
            </LinkButton>
            <LinkButton to="/app/agents/new">
              <Plus /> Créer un agent
            </LinkButton>
          </>
        }
      />

      <GettingStarted />

      <Section title="Activité" meta="24 dernières heures · actualisé il y a quelques secondes">
        <Async query={overview} skeleton={<Skeleton className="h-[98px] rounded-lg" />}>
          {(o) => (
            <KpiStrip
              items={[
                { label: 'Agents actifs', value: o.activeAgents, hint: `sur ${agents.data?.length ?? '—'} agents` },
                { label: 'Exécutions', value: num(o.runs24h), hint: `p50 ${duration(o.p50LatencyMs)}` },
                { label: 'Coût du jour', value: usd(o.costToday), hint: settings.data ? `budget mensuel ${settings.data.monthlyBudget} $` : undefined },
                { label: 'Taux de succès', value: pct(o.successRate), hint: '45 exécutions en erreur' },
              ]}
            />
          )}
        </Async>
      </Section>

      <div className="mb-12 grid gap-8 xl:grid-cols-[1.6fr_1fr]">
        <Section title="Exécutions sur 7 jours" meta="erreurs en rouge" className="mb-0">
          <Panel className="p-5 pt-10">
            <Async query={overview} skeleton={<Skeleton className="h-[220px]" />}>
              {(o) => (
                <ColumnChart
                  label="Exécutions par jour sur 7 jours"
                  data={o.runsByDay.map((d) => ({ label: d.day, value: d.runs, secondary: d.errors }))}
                  height={220}
                />
              )}
            </Async>
          </Panel>
        </Section>
        <Section title="À traiter" className="mb-0">
          <ToHandle />
        </Section>
      </div>

      <Section title="Agents" meta={agents.data ? `${agents.data.length} au total` : undefined} action={<LinkButton to="/app/agents" variant="ghost" size="sm">Voir tout</LinkButton>}>
        <Async query={agents}>
          {(list) => (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[720px] text-[14px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-muted-foreground">
                    <th className="pb-2 font-medium">Agent</th>
                    <th className="pb-2 font-medium">Statut</th>
                    <th className="pb-2 text-right font-medium">Exécutions</th>
                    <th className="pb-2 text-right font-medium">Succès</th>
                    <th className="pb-2 text-right font-medium">Coût du jour</th>
                    <th className="pb-2 text-right font-medium">Latence p50</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, 5).map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="py-3 pr-4">
                        <Link to={`/app/agents/${a.id}`} className="font-medium hover:underline">
                          {a.name}
                        </Link>
                        <div className="text-[12.5px] text-muted-foreground">{AGENT_TYPES[a.type].label}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <AgentStatus status={a.status} />
                      </td>
                      <td className="py-3 text-right tabular">{num(a.metrics.runs24h)}</td>
                      <td className={cn('py-3 text-right tabular', a.metrics.successRate < 95 && 'text-danger')}>{pct(a.metrics.successRate)}</td>
                      <td className="py-3 text-right tabular">{a.metrics.costToday ? usd(a.metrics.costToday) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-3 text-right tabular text-muted-foreground">{a.metrics.p50LatencyMs ? duration(a.metrics.p50LatencyMs) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Section>

      <Section title="Journal en direct" meta="tous les agents" action={<LinkButton to="/app/observability" variant="ghost" size="sm">Observabilité</LinkButton>}>
        <LogStream height="h-[260px]" />
      </Section>
    </>
  )
}
