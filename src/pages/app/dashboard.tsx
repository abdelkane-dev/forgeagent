import { ArrowUpRight, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useAgents, useMyApprovals, useOverview, usePlatformSettings, useProjects } from '@/api/hooks'
import { ColumnChart, KpiStrip } from '@/components/common/charts'
import { LinkButton } from '@/components/common/link-button'
import { LogStream } from '@/components/common/log-stream'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, RowsSkeleton } from '@/components/common/states'
import { AgentStatus, StatusDot } from '@/components/common/status'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { duration, num, pct, usd } from '@/lib/format'
import { AGENT_TYPES, L } from '@/labels'
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
    { title: L.action.createAgent, text: 'Seul ou avec La Forge, qui conçoit, sécurise et teste.', to: '/app/agents/new', done: !!agents.data?.length },
    { title: 'Tester en environnement de test', text: 'Conversation, vérifications et évaluations.', to: '/app/test', done: false },
    { title: 'Intégrer à votre site', text: 'Widget, API, SDK ou serveur MCP.', to: '/app/integration', done: false },
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
  const approvals = useMyApprovals()
  const agents = useAgents()
  const settings = usePlatformSettings()
  const errored = agents.data?.filter((a) => a.status === 'error') ?? []
  const nearCap = agents.data?.filter((a) => a.metrics.costToday >= a.costCapPerDay * 0.8 && a.costCapPerDay > 0) ?? []
  const items = [
    ...(approvals.data ?? []).slice(0, 4).map((x) => ({ tone: 'warn' as const, text: `${agents.data?.find((a) => a.id === x.agentId)?.name ?? x.agentId} : ${x.action}`, to: `/app/agents/${x.agentId}?tab=overview` })),
    ...errored.map((a) => ({ tone: 'danger' as const, text: `${a.name} est en erreur`, to: `/app/agents/${a.id}?tab=audit` })),
    ...nearCap.map((a) => ({ tone: 'warn' as const, text: `${a.name} : plafond de coût à 80 %`, to: `/app/agents/${a.id}?tab=usage` })),
    settings.data?.killSwitch ? { tone: 'danger' as const, text: 'Arrêt d’urgence actif', to: '/app/settings?tab=platform' } : null,
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

  return (
    <>
      <PageHeader
        title={L.nav.dashboard}
        description="Les agents dont vous êtes membre : leur activité des dernières 24 heures et ce qui demande votre attention."
        actions={
          <>
            <LinkButton to="/app/test" variant="outline">
              Tester un agent
            </LinkButton>
            <LinkButton to="/app/agents/new" className="glow-molten bg-ember text-ember-ink hover:bg-ember/90">
              <Plus /> {L.action.createAgent}
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
                { label: 'Agents actifs', value: o.activeAgents, hint: `sur ${o.agents} agent${o.agents > 1 ? 's' : ''}` },
                { label: 'Exécutions', value: num(o.runs24h), hint: `p50 ${duration(o.p50LatencyMs)}` },
                { label: 'Coût du jour', value: usd(o.costToday), hint: 'production, tous vos agents' },
                { label: 'Taux de succès', value: pct(o.successRate), hint: `${o.pendingApprovals} validation(s) en attente` },
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

      <Section title="Agents" meta={agents.data ? `${agents.data.length} dont vous êtes membre` : undefined} action={<LinkButton to="/app/agents" variant="ghost" size="sm">Voir tout</LinkButton>}>
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

      {agents.data?.[0] && (
        <Section title="Journal en direct" meta={agents.data[0].name} action={<LinkButton to="/app/logs" variant="ghost" size="sm">{L.nav.logs}</LinkButton>}>
          <LogStream agentId={agents.data[0].id} height="h-[260px]" />
        </Section>
      )}
    </>
  )
}
