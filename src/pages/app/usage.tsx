import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, useAction, useAgents, useOverview, useProjects, useSettings } from '@/api/hooks'
import { ColumnChart, KpiStrip, Meter } from '@/components/common/charts'
import { Field, SwitchRow } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { compact, usd } from '@/lib/format'
import { MODELS } from '@/lib/labels'

const MONTH_SPEND = 312.4

export default function Usage() {
  const settings = useSettings()
  const overview = useOverview()
  const agents = useAgents()
  const projects = useProjects()
  const [alertPct, setAlertPct] = useState<string>('')
  const save = useAction((pct: number) => api.settings.update({ budgetAlertPct: pct }), { invalidate: [keys.settings], success: (_, p) => `Alerte réglée à ${p} %` })
  const notify = useAction((v: boolean) => api.settings.update({ notifications: { ...settings.data!.notifications, 'budget.threshold': v } }), { invalidate: [keys.settings], success: 'Réglage enregistré' })
  const budget = settings.data?.monthlyBudget ?? 400

  const byProject = (projects.data ?? []).map((p) => ({
    name: p.name,
    cost: (agents.data ?? []).filter((a) => a.projectIds.includes(p.id)).reduce((s, a) => s + a.metrics.costToday, 0),
  }))
  const byModel = (Object.keys(MODELS) as (keyof typeof MODELS)[]).map((m) => ({
    label: MODELS[m].label.replace('Claude ', ''),
    tokens: (agents.data ?? []).filter((a) => a.model === m).reduce((s, a) => s + a.metrics.tokens24h, 0),
  }))

  return (
    <>
      <PageHeader title="Coûts et usage" description="ForgeAgent est gratuit et auto-hébergé : vous ne payez que votre consommation de l’API Claude." />
      <Section>
        <KpiStrip
          items={[
            { label: 'Licence', value: 'Open source', hint: 'Apache 2.0, auto-hébergé' },
            { label: 'Consommation d’octobre', value: usd(MONTH_SPEND), hint: <Meter value={MONTH_SPEND} max={budget} className="mt-1" /> },
            { label: 'Plafond mensuel', value: `${budget} $`, hint: <LinkButton to="/app/security" variant="link" size="sm" className="h-auto p-0">Modifier</LinkButton> },
            { label: 'Aujourd’hui', value: overview.data ? usd(overview.data.costToday) : '—', hint: 'tous agents confondus' },
          ]}
        />
      </Section>
      <div className="mb-12 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <Section title="Tokens par modèle" meta="24 dernières heures" className="mb-0">
          <Panel className="p-5 pt-10">
            <ColumnChart label="Tokens par modèle" data={byModel.map((b) => ({ label: b.label, value: b.tokens }))} highlight={1} height={200} />
          </Panel>
        </Section>
        <Section title="Coût du jour par projet" className="mb-0">
          <Panel className="divide-y">
            {byProject.map((p) => (
              <div key={p.name} className="flex items-center justify-between px-4 py-3 text-[14px]">
                <span>{p.name}</span>
                <span className="font-semibold tabular">{usd(p.cost)}</span>
              </div>
            ))}
          </Panel>
          <p className="mt-3 text-[13px] text-muted-foreground">{compact(byModel.reduce((s, b) => s + b.tokens, 0))} tokens consommés sur 24 h.</p>
        </Section>
      </div>
      <div className="grid gap-10 xl:grid-cols-2">
        <Section title="Alertes de budget" className="mb-0">
          <Async query={settings}>
            {(s) => (
              <Panel className="p-5">
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const v = Number(alertPct)
                    if (v >= 10 && v <= 100) save.mutate(v)
                    else toast.error('Choisissez un seuil entre 10 et 100 %')
                  }}
                >
                  <Field label="Alerter à (% du plafond)" htmlFor="u-alert" className="flex-1">
                    <Input id="u-alert" type="number" min={10} max={100} placeholder={String(s.budgetAlertPct)} value={alertPct} onChange={(e) => setAlertPct(e.target.value)} />
                  </Field>
                  <Button type="submit" disabled={save.isPending}>
                    Enregistrer
                  </Button>
                </form>
                <SwitchRow className="mt-2" title="Notifier par email" description="Envoyé aux administrateurs." checked={s.notifications['budget.threshold']} onChange={(v) => notify.mutate(v)} />
              </Panel>
            )}
          </Async>
        </Section>
        <Section title="Rapports mensuels" className="mb-0">
          <Panel className="divide-y">
            {['Octobre 2026', 'Septembre 2026', 'Août 2026'].map((m, i) => (
              <div key={m} className="flex items-center justify-between px-4 py-3 text-[14px]">
                <span>
                  {m} {i === 0 && <span className="text-muted-foreground">· en cours</span>}
                </span>
                <Button variant="ghost" size="sm" onClick={() => toast.success(`Rapport ${m} téléchargé (CSV)`)}>
                  <Download /> CSV
                </Button>
              </div>
            ))}
          </Panel>
        </Section>
      </div>
    </>
  )
}
