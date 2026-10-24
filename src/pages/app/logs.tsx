import { X } from 'lucide-react'
import { useState } from 'react'
import { useTraces } from '@/api/hooks'
import type { Span, Trace } from '@/api/types'
import { PickGate } from '@/components/agent/agent-picker'
import { useAgentPick } from '@/components/agent/use-agent-pick'
import { LogStream } from '@/components/common/log-stream'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { clock, duration, num, relative, usd } from '@/lib/format'
import { L } from '@/labels'
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

function Traces({ agentId, agentName }: { agentId: string; agentName: string }) {
  const traces = useTraces(agentId)
  const [open, setOpen] = useState<Trace | null>(null)
  if (traces.isPending) return <LoadingBlock />
  if (!traces.data?.length) return <EmptyState title="Aucune trace" description="Les exécutions de cet agent apparaîtront ici, étape par étape." />
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <Panel className="divide-y self-start">
        {traces.data.map((t) => (
          <button key={t.id} type="button" onClick={() => setOpen(t)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] hover:bg-raised', open?.id === t.id && 'bg-secondary')}>
            <StatusDot tone={t.status === 'ok' ? 'ok' : t.status === 'blocked' ? 'warn' : 'danger'} />
            <span className="min-w-0 flex-1 truncate">{t.input}</span>
            {t.environment === 'test' && <Tag>Test</Tag>}
            <span className="text-muted-foreground tabular">{duration(t.durationMs)}</span>
            <span className="hidden w-24 text-right text-muted-foreground sm:inline">{relative(t.at)}</span>
          </button>
        ))}
      </Panel>
      {open ? <Waterfall trace={open} agentName={agentName} onClose={() => setOpen(null)} /> : <p className="text-[14px] text-muted-foreground">Choisissez une trace pour voir ses étapes et leur durée.</p>}
    </div>
  )
}

export default function LogsPage() {
  const pick = useAgentPick()
  return (
    <>
      <PageHeader title={L.nav.logs} description="Journal en direct et traces d’exécution d’un agent. Le flux d’un agent ne contient jamais les lignes d’un autre." />
      <PickGate pick={pick}>
        {(agent) => (
          <>
            <Section title="Journal en direct">
              <LogStream key={agent.id} agentId={agent.id} height="h-[360px]" />
            </Section>
            <Section title="Traces">
              <Traces key={agent.id} agentId={agent.id} agentName={agent.name} />
            </Section>
          </>
        )}
      </PickGate>
    </>
  )
}
