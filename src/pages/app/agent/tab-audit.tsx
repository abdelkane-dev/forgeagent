import { useMemo, useState } from 'react'
import { useAudit } from '@/api/hooks'
import type { AuditEntry } from '@/api/types'
import { NativeSelect } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { clock, date } from '@/lib/format'
import { ACTOR_TYPES } from '@/labels'
import type { TabProps } from '.'

/** The agent's own append-only journal: who did what, the internal team's exchanges, maintenance accesses. */
export default function AuditTab({ agent }: TabProps) {
  const audit = useAudit(agent.id)
  const [actor, setActor] = useState<AuditEntry['actorType'] | 'all'>('all')
  const rows = useMemo(() => (audit.data ?? []).filter((a) => actor === 'all' || a.actorType === actor), [audit.data, actor])
  return (
    <Section
      title="Journal d’audit"
      meta={audit.data ? `${rows.length} entrée(s)` : undefined}
      description="Ajout seul : aucune ligne ne peut être modifiée ni supprimée, sauf par la purge complète de l’agent."
      action={
        <NativeSelect aria-label="Filtrer par acteur" className="w-48" value={actor} onChange={(e) => setActor(e.target.value as typeof actor)}>
          <option value="all">Tous les acteurs</option>
          {(Object.keys(ACTOR_TYPES) as AuditEntry['actorType'][]).map((k) => (
            <option key={k} value={k}>
              {ACTOR_TYPES[k]}
            </option>
          ))}
        </NativeSelect>
      }
    >
      {audit.isPending ? (
        <LoadingBlock />
      ) : !rows.length ? (
        <EmptyState title="Aucune entrée" description="Les actions sur cet agent apparaîtront ici." />
      ) : (
        <Panel className="divide-y">
          {rows.map((a) => (
            <div key={a.id} className="grid gap-1 px-4 py-3 text-[14px] sm:grid-cols-[150px_1fr_auto] sm:items-center sm:gap-4">
              <span className="text-[13px] text-muted-foreground tabular">
                {date(a.at)} · {clock(a.at).slice(0, 5)}
              </span>
              <span className="min-w-0">
                <b className="font-semibold">{a.actor}</b> {a.action} <span className="text-muted-foreground">{a.target}</span>
              </span>
              <span className="flex items-center gap-2">
                <Tag>{ACTOR_TYPES[a.actorType]}</Tag>
                {a.result && a.result !== 'ok' && (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-danger">
                    <StatusDot tone="danger" /> {a.result === 'refused' ? 'refusé' : 'erreur'}
                  </span>
                )}
              </span>
            </div>
          ))}
        </Panel>
      )}
    </Section>
  )
}
