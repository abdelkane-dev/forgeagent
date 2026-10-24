import { Download, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAudit } from '@/api/hooks'
import type { AuditEntry } from '@/api/types'
import { PageHeader } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clock, date } from '@/lib/format'

function toCsv(rows: AuditEntry[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  return ['date,acteur,action,cible', ...rows.map((r) => [r.at, r.actor, r.action, r.target].map(esc).join(','))].join('\n')
}

export default function Audit() {
  const audit = useAudit()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return (audit.data ?? []).filter((r) => !n || `${r.actor} ${r.action} ${r.target}`.toLowerCase().includes(n))
  }, [audit.data, q])

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forgeagent-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`${rows.length} ligne(s) exportée(s)`)
  }

  return (
    <>
      <PageHeader
        title="Journal d’audit"
        description="Qui a fait quoi, et quand. Journal en ajout seul : aucune ligne ne peut être modifiée."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Exporter en CSV
          </Button>
        }
      />
      <div className="relative mb-4 sm:w-96">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un acteur, une action, un agent" className="pl-9" aria-label="Rechercher dans le journal" />
      </div>
      <Async query={audit}>
        {() =>
          rows.length === 0 ? (
            <EmptyState title="Aucune entrée" description={q ? 'Aucune ligne ne correspond à cette recherche.' : 'Le journal est vide.'} />
          ) : (
            <ol className="grid">
              {rows.map((r) => (
                <li key={r.id} className="grid gap-1 border-t py-3 text-[14px] sm:grid-cols-[150px_1fr] sm:gap-6">
                  <span className="text-muted-foreground tabular">
                    {date(r.at)} · {clock(r.at).slice(0, 5)}
                  </span>
                  <span>
                    <b className="font-semibold">{r.actor}</b> {r.action} <span className="text-muted-foreground">· {r.target}</span>
                  </span>
                </li>
              ))}
            </ol>
          )
        }
      </Async>
    </>
  )
}
