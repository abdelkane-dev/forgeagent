import { useState } from 'react'
import { useUsage } from '@/api/hooks'
import { ColumnChart, KpiStrip, Meter } from '@/components/common/charts'
import { Field } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { compact, num, usd } from '@/lib/format'
import { MODELS, USAGE_SOURCES } from '@/labels'
import type { TabProps } from '.'
import { can, useUpdate } from './shared'

/** Everything spent for THIS agent: its runs, its evaluations, its workflows and the internal team's work on it. */
export default function UsageTab({ agent }: TabProps) {
  const usage = useUsage(agent.id)
  const update = useUpdate(agent)
  const [daily, setDaily] = useState(String(agent.costCapPerDay))
  const [monthly, setMonthly] = useState(String(agent.monthlyBudget))
  if (usage.isPending || !usage.data) return <LoadingBlock />
  const u = usage.data
  const totalSource = u.bySource.reduce((n, s) => n + s.cost, 0) || 1

  return (
    <>
      <Section title="Budget">
        <KpiStrip
          items={[
            { label: 'Aujourd’hui', value: usd(u.today), hint: <Meter value={u.today} max={u.budget.daily} className="mt-1" tone={u.today > u.budget.daily * 0.8 ? 'warn' : 'ember'} /> },
            { label: 'Ce mois-ci', value: usd(u.month), hint: <Meter value={u.month} max={u.budget.monthly} className="mt-1" tone={u.month > u.budget.monthly * 0.8 ? 'warn' : 'ember'} /> },
            { label: 'Exécutions du mois', value: num(u.runs.month), hint: `${num(u.runs.today)} aujourd’hui` },
            { label: 'Coût moyen', value: usd(u.avgCostPerRun), unit: '/ exécution' },
          ]}
        />
      </Section>
      <div className="mb-12 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <Section title="Exécutions par jour" className="mb-0">
          <Panel className="p-5">
            <ColumnChart label="Exécutions des sept derniers jours" data={u.byDay.map((d) => ({ label: d.day, value: d.runs }))} />
          </Panel>
        </Section>
        <Section title="Par source" className="mb-0">
          <Panel className="divide-y">
            {u.bySource.map((s) => (
              <div key={s.source} className="grid gap-1.5 px-4 py-3">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="font-medium">{USAGE_SOURCES[s.source]}</span>
                  <span className="tabular">{usd(s.cost)}</span>
                </div>
                <Meter value={s.cost} max={totalSource} />
                <span className="text-[12.5px] text-muted-foreground">{compact(s.tokens)} tokens</span>
              </div>
            ))}
          </Panel>
          <Panel className="mt-4 divide-y">
            {u.byModel.map((m) => (
              <div key={m.model} className="flex items-center justify-between px-4 py-3 text-[14px]">
                <span>{MODELS[m.model as keyof typeof MODELS]?.label ?? m.model}</span>
                <span className="text-muted-foreground tabular">
                  {compact(m.tokens)} tokens · {usd(m.cost)}
                </span>
              </div>
            ))}
          </Panel>
        </Section>
      </div>
      {can(agent, 'editor') && (
        <Section title="Plafonds de cet agent" description="Une exécution qui dépasserait un plafond est refusée et notée dans l’audit.">
          <form
            className="grid max-w-xl gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              update.mutate({ patch: { costCapPerDay: Number(daily), monthlyBudget: Number(monthly) } })
            }}
          >
            <Field label="Par jour ($)" htmlFor="u-day">
              <Input id="u-day" type="number" min={0} step="0.5" value={daily} onChange={(e) => setDaily(e.target.value)} />
            </Field>
            <Field label="Par mois ($)" htmlFor="u-month">
              <Input id="u-month" type="number" min={0} step="1" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </Field>
            <Button type="submit" disabled={update.isPending}>
              Enregistrer
            </Button>
          </form>
        </Section>
      )}
    </>
  )
}
