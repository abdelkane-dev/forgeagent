import { X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useSettings, useTraces } from '@/api/hooks'
import type { Span, Trace } from '@/api/types'
import { Meter } from '@/components/common/charts'
import { Field, NativeSelect } from '@/components/common/field'
import { LogStream } from '@/components/common/log-stream'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { StatusDot } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clock, duration, num, relative, usd } from '@/lib/format'
import { cn } from '@/lib/utils'

const SPAN_COLOR: Record<Span['kind'], string> = {
  trigger: 'bg-muted-foreground/50',
  model: 'bg-ember',
  tool: 'bg-foreground/60',
  approval: 'bg-warn',
  output: 'bg-ok',
}

function Waterfall({ trace, agentName, onClose }: { trace: Trace; agentName: string; onClose: () => void }) {
  const total = Math.max(trace.durationMs, ...trace.spans.map((s) => s.startMs + s.durationMs))
  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[16px] font-semibold">
            <StatusDot tone={trace.status === 'ok' ? 'ok' : 'danger'} /> <code className="text-[14px]">{trace.id}</code>
          </h3>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {agentName} · « {trace.input} » · {clock(trace.at)}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer la trace">
          <X />
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] tabular">
        <span>
          Durée <b className="font-semibold">{duration(trace.durationMs)}</b>
        </span>
        <span>
          Tokens <b className="font-semibold">{num(trace.tokens)}</b>
        </span>
        <span>
          Coût <b className="font-semibold">{usd(trace.cost)}</b>
        </span>
      </div>
      <ol className="grid gap-2">
        {trace.spans.map((s) => (
          <li key={s.id} className="grid gap-1 sm:grid-cols-[minmax(0,200px)_1fr] sm:items-center sm:gap-4">
            <div className="min-w-0">
              <div className={cn('truncate text-[13.5px] font-medium', s.name.includes('dépassé') && 'text-danger')}>{s.name}</div>
              {s.detail && <div className="truncate text-[12.5px] text-muted-foreground">{s.detail}</div>}
            </div>
            <div className="relative h-6 rounded-[4px] bg-secondary/60">
              <div
                className={cn('absolute inset-y-1 rounded-[3px]', s.name.includes('dépassé') ? 'bg-danger' : SPAN_COLOR[s.kind])}
                style={{ left: `${(s.startMs / total) * 100}%`, width: `${Math.max((s.durationMs / total) * 100, 1.2)}%` }}
                title={`${duration(s.durationMs)}`}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[11.5px] text-muted-foreground tabular">{duration(s.durationMs)}</span>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function Traces() {
  const [params, setParams] = useSearchParams()
  const agentFilter = params.get('agent') ?? ''
  const selected = params.get('trace')
  const [status, setStatus] = useState('')
  const traces = useTraces(agentFilter || undefined)
  const agents = useAgents()
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <NativeSelect value={agentFilter} onChange={(e) => update({ agent: e.target.value || null, trace: null })} aria-label="Filtrer par agent" className="sm:w-64">
          <option value="">Tous les agents</option>
          {agents.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrer par statut" className="sm:w-44">
          <option value="">Tous les statuts</option>
          <option value="ok">Réussies</option>
          <option value="error">En erreur</option>
        </NativeSelect>
      </div>
      <Async query={traces}>
        {(list) => {
          const rows = list.filter((t) => !status || t.status === status)
          const current = list.find((t) => t.id === selected)
          if (!rows.length) return <EmptyState title="Aucune trace" description="Aucune exécution ne correspond à ces filtres." />
          return (
            <div className={cn('grid gap-6', current && "2xl:grid-cols-[1fr_1fr]")}>
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[560px] text-[14px]">
                  <thead>
                    <tr className="text-left text-[12.5px] text-muted-foreground">
                      <th className="pb-2 font-medium">Trace</th>
                      <th className="pb-2 font-medium">Agent</th>
                      <th className="pb-2 text-right font-medium">Durée</th>
                      <th className="pb-2 text-right font-medium">Coût</th>
                      <th className="pb-2 text-right font-medium">Quand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr
                        key={t.id}
                        className={cn('cursor-pointer border-t transition-colors hover:bg-card/70', t.id === selected && 'bg-card')}
                        onClick={() => update({ trace: t.id })}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && update({ trace: t.id })}
                        aria-selected={t.id === selected}
                      >
                        <td className="py-3 pr-3">
                          <span className="flex items-center gap-2">
                            <StatusDot tone={t.status === 'ok' ? 'ok' : 'danger'} />
                            <code className="text-[13px]">{t.id}</code>
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate py-3 pr-3">{name(t.agentId)}</td>
                        <td className="py-3 text-right tabular">{duration(t.durationMs)}</td>
                        <td className="py-3 text-right tabular">{usd(t.cost)}</td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap text-muted-foreground">{relative(t.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {current ? (
                <Waterfall trace={current} agentName={name(current.agentId)} onClose={() => update({ trace: null })} />
              ) : null}
            </div>
          )
        }}
      </Async>
      {!selected && <p className="mt-4 text-[13.5px] text-muted-foreground">Cliquez une trace pour voir chaque étape : déclencheur, appels au modèle, outils et sortie.</p>}
    </>
  )
}

function Costs() {
  const agents = useAgents()
  return (
    <Async query={agents}>
      {(list) => (
        <Panel className="divide-y">
          {[...list]
            .sort((a, b) => b.metrics.costToday - a.metrics.costToday)
            .map((a) => (
              <div key={a.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_200px_120px] sm:items-center sm:gap-6">
                <div className="text-[14px] font-medium">{a.name}</div>
                <Meter value={a.metrics.costToday} max={a.costCapPerDay} />
                <div className="text-[14px] tabular sm:text-right">
                  {usd(a.metrics.costToday)} <span className="text-muted-foreground">/ {a.costCapPerDay} $</span>
                </div>
              </div>
            ))}
        </Panel>
      )}
    </Async>
  )
}

function Export() {
  const settings = useSettings()
  const [url, setUrl] = useState('')
  const save = useAction((otelEndpoint: string) => api.settings.update({ otelEndpoint }), { invalidate: [keys.settings], success: (_, v) => (v ? 'Export OpenTelemetry activé' : 'Export désactivé') })
  const current = settings.data?.otelEndpoint
  return (
    <Panel className="p-5">
      <p className="mb-4 max-w-[62ch] text-[14px] text-muted-foreground">Envoyez chaque trace (décision, appel d’outil, coût, durée) vers votre collecteur OTLP : Grafana Tempo, Honeycomb, Datadog, Jaeger…</p>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(url)
        }}
      >
        <Field label="Point d’entrée OTLP/HTTP" htmlFor="otel">
          <Input id="otel" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={current || 'https://otel.votre-domaine.dev/v1/traces'} />
        </Field>
        <Button type="submit" disabled={save.isPending}>
          Enregistrer
        </Button>
      </form>
      <p className="mt-3 flex items-center gap-2 text-[13.5px]">
        <StatusDot tone={current ? 'ok' : 'muted'} /> {current ? `Export actif vers ${current}` : 'Export désactivé'}
        {current && (
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => save.mutate('')}>
            Désactiver
          </Button>
        )}
      </p>
    </Panel>
  )
}

export default function Observability() {
  const [tab, setTab] = useState<'traces' | 'logs' | 'costs' | 'export'>('traces')
  return (
    <>
      <PageHeader title="Observabilité" description="Traces de chaque exécution, journal en direct et coût par agent." />
      <UnderlineTabs
        label="Vue"
        value={tab}
        onChange={setTab}
        className="mb-8"
        items={[
          { value: 'traces', label: 'Traces' },
          { value: 'logs', label: 'Journal en direct' },
          { value: 'costs', label: 'Coût par agent' },
          { value: 'export', label: 'Export OpenTelemetry' },
        ]}
      />
      {tab === 'traces' && <Traces />}
      {tab === 'logs' && (
        <Section>
          <LogStream height="h-[min(62vh,560px)]" />
        </Section>
      )}
      {tab === 'costs' && <Costs />}
      {tab === 'export' && <Export />}
    </>
  )
}
