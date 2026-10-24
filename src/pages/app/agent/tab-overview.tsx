import { Check, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useAgentApprovals, useAgentRequests, useTraces } from '@/api/hooks'
import { KpiStrip, Meter } from '@/components/common/charts'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { LogStream } from '@/components/common/log-stream'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { clock, date, duration, num, pct, relative, usd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AUTONOMY, MODELS, STATUS } from '@/labels'
import type { TabProps } from '.'
import { can } from './shared'

function Approvals({ agent }: TabProps) {
  const list = useAgentApprovals(agent.id)
  const resolve = useAction(({ id, d }: { id: string; d: 'approve' | 'reject' }) => api.approvals.resolve(agent.id, id, d), {
    invalidate: [keys.of(agent.id, 'approvals'), keys.myApprovals, keys.overview, keys.of(agent.id, 'audit'), keys.agent(agent.id)],
    success: (_, v) => (v.d === 'approve' ? 'Action approuvée' : 'Action refusée'),
  })
  if (!list.data?.length) return null
  return (
    <Section title="Validations en attente" meta={`${list.data.length}`}>
      <Panel className="divide-y">
        {list.data.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <StatusDot tone={x.risk === 'high' ? 'danger' : 'warn'} pulse />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{x.action}</div>
              <div className="text-[13px] text-muted-foreground">
                {x.reason} · {x.source === 'team' ? 'demandé par La Forge' : x.source === 'workflow' ? 'étape de workflow' : 'proposé par l’agent'} · {relative(x.requestedAt)}
              </div>
            </div>
            {can(agent, x.source === 'team' ? 'owner' : 'editor') && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: x.id, d: 'reject' })} disabled={resolve.isPending}>
                  <X /> Refuser
                </Button>
                <Button size="sm" onClick={() => resolve.mutate({ id: x.id, d: 'approve' })} disabled={resolve.isPending}>
                  <Check /> Approuver
                </Button>
              </div>
            )}
          </div>
        ))}
      </Panel>
    </Section>
  )
}

function Building({ agent }: TabProps) {
  const reqs = useAgentRequests(agent.id)
  const running = reqs.data?.find((r) => r.status === 'running' || r.status === 'awaiting_approval')
  if (agent.status !== 'starting' || !running) return null
  return (
    <div className="mb-8 rounded-lg bg-ember/10 px-4 py-3 text-[14px]" role="status">
      <b className="font-semibold">La Forge construit cet agent.</b> {running.steps} étapes, {num(running.tokens)} tokens imputés à cet agent.{' '}
      {running.status === 'awaiting_approval' ? 'Une validation du propriétaire est attendue ci-dessous.' : 'Les résultats arrivent en direct.'}
    </div>
  )
}

function Versions({ agent }: TabProps) {
  const [restore, setRestore] = useState<number | null>(null)
  const act = useAction((v: number) => api.agents.restoreVersion(agent.id, v), {
    invalidate: [keys.agent(agent.id), keys.agents],
    success: (_, v) => `v${v} restaurée`,
    onSuccess: () => setRestore(null),
  })
  return (
    <Section title="Versions" meta={`${agent.versions.length}`}>
      <ol className="grid">
        {agent.versions.map((v, i) => (
          <li key={v.version} className="grid grid-cols-[24px_1fr] gap-4">
            <div className="flex flex-col items-center">
              <span className={cn('hex mt-1.5 size-3', i === 0 ? 'bg-ember' : 'bg-muted-foreground/40')} />
              {i < agent.versions.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  v{v.version} {i === 0 && <Tag>Actuelle</Tag>}
                  {v.regressionScore != null && <Tag>Régression {v.regressionScore} %</Tag>}
                </div>
                <p className="text-[14px]">{v.note}</p>
                <p className="text-[13px] text-muted-foreground">
                  {v.author} · {date(v.createdAt)} à {clock(v.createdAt).slice(0, 5)}
                </p>
              </div>
              {i > 0 && can(agent, 'editor') && (
                <Button variant="outline" size="sm" onClick={() => setRestore(v.version)}>
                  <RotateCcw /> Restaurer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={restore !== null}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Restaurer la v${restore} ?`}
        description={`Une nouvelle version v${agent.version + 1} sera créée avec la configuration de la v${restore}. Rien n’est perdu.`}
        confirmLabel="Restaurer"
        tone="default"
        pending={act.isPending}
        onConfirm={() => restore !== null && act.mutate(restore)}
      />
    </Section>
  )
}

export default function Overview(props: TabProps) {
  const { agent, onTab } = props
  const traces = useTraces(agent.id)
  return (
    <>
      <Building {...props} />
      <Approvals {...props} />
      <Section title="Dernières 24 heures" meta={STATUS[agent.status].hint}>
        <KpiStrip
          items={[
            { label: 'Exécutions', value: num(agent.metrics.runs24h), hint: `${num(agent.metrics.tokens24h)} tokens` },
            { label: 'Taux de succès', value: pct(agent.metrics.successRate) },
            { label: 'Coût du jour', value: usd(agent.metrics.costToday), hint: <Meter value={agent.metrics.costToday} max={agent.costCapPerDay} className="mt-1" /> },
            { label: 'Latence p50', value: agent.metrics.p50LatencyMs ? duration(agent.metrics.p50LatencyMs) : '—' },
          ]}
        />
      </Section>
      <div className="mb-12 grid gap-8 xl:grid-cols-[1fr_1.2fr]">
        <Section title="Mission" className="mb-0">
          <Panel className="p-5 text-[15px] leading-relaxed">
            <p>{agent.mission}</p>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
              <dt className="text-muted-foreground">Rôle</dt>
              <dd>{agent.role || '—'}</dd>
              <dt className="text-muted-foreground">Autonomie</dt>
              <dd>{AUTONOMY[agent.autonomy].label}</dd>
              <dt className="text-muted-foreground">Modèle</dt>
              <dd>{MODELS[agent.model].label}</dd>
              <dt className="text-muted-foreground">Actions autorisées</dt>
              <dd>{agent.permissions.allowedActions.join(', ') || 'Aucune'}</dd>
              <dt className="text-muted-foreground">Identifiant</dt>
              <dd className="font-mono text-[13px]">{agent.id}</dd>
            </dl>
          </Panel>
        </Section>
        <Section title="Dernières exécutions" className="mb-0">
          {traces.isPending ? (
            <LoadingBlock />
          ) : !traces.data?.length ? (
            <EmptyState title="Aucune exécution" description="Lancez un test pour voir la première trace." action={<Button size="sm" onClick={() => onTab('tests')}>Tester l’agent</Button>} />
          ) : (
            <Panel className="divide-y">
              {traces.data.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                  <StatusDot tone={t.status === 'ok' ? 'ok' : t.status === 'blocked' ? 'warn' : 'danger'} />
                  <span className="min-w-0 flex-1 truncate">{t.input}</span>
                  {t.environment === 'test' && <Tag>Test</Tag>}
                  <span className="text-muted-foreground tabular">{duration(t.durationMs)}</span>
                  <span className="hidden w-16 text-right tabular sm:inline">{usd(t.cost)}</span>
                  <span className="hidden w-28 text-right whitespace-nowrap text-muted-foreground sm:inline">{relative(t.at)}</span>
                </div>
              ))}
            </Panel>
          )}
        </Section>
      </div>
      <Versions {...props} />
      <Section title="Journal en direct">
        <LogStream agentId={agent.id} height="h-[240px]" />
      </Section>
    </>
  )
}
