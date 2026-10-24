import { Check, ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useAgents, useApprovals, useSettings } from '@/api/hooks'
import type { Approval, Settings } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { SwitchRow } from '@/components/common/field'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { relative } from '@/lib/format'
import { cn } from '@/lib/utils'

const RISK: Record<Approval['risk'], { label: string; cls: string }> = {
  low: { label: 'Risque faible', cls: 'text-muted-foreground' },
  medium: { label: 'Risque moyen', cls: 'text-warn' },
  high: { label: 'Risque élevé', cls: 'text-danger' },
}

export default function Security() {
  const settings = useSettings()
  const approvals = useApprovals()
  const agents = useAgents()
  const [killConfirm, setKillConfirm] = useState(false)
  const [budget, setBudget] = useState<number | null>(null)
  const update = useAction((patch: Partial<Settings>) => api.settings.update(patch), { invalidate: [keys.settings, keys.agents], success: 'Réglage enregistré' })
  const kill = useAction((on: boolean) => api.settings.update({ killSwitch: on }), {
    invalidate: [keys.settings, keys.agents],
    success: (_, on) => (on ? 'Tous les agents sont à l’arrêt' : 'Agents relancés'),
    onSuccess: () => setKillConfirm(false),
  })
  const resolve = useAction(({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.approvals.resolve(id, decision), {
    invalidate: [keys.approvals, keys.audit],
    success: (_, v) => (v.decision === 'approve' ? 'Action approuvée et exécutée' : 'Action refusée'),
  })
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id
  const s = settings.data

  return (
    <>
      <PageHeader title="Sécurité" description="Garde-fous globaux, validations humaines en attente et arrêt d’urgence." />

      <Section id="kill" title="Arrêt d’urgence">
        <Panel className={cn('flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between', s?.killSwitch && 'bg-danger/10')}>
          <div className="flex items-start gap-3">
            <ShieldAlert className={cn('mt-0.5 size-5 shrink-0', s?.killSwitch ? 'text-danger' : 'text-muted-foreground')} />
            <div>
              <div className="text-[15px] font-semibold">{s?.killSwitch ? 'Tous les agents sont en pause' : 'Tous les agents fonctionnent'}</div>
              <p className="text-[14px] text-muted-foreground">Met en pause tous les agents de tous les projets en un clic. Les exécutions en cours sont interrompues proprement.</p>
            </div>
          </div>
          {s?.killSwitch ? (
            <Button onClick={() => kill.mutate(false)} disabled={kill.isPending}>
              Relancer les agents
            </Button>
          ) : (
            <Button className="bg-danger text-white hover:bg-danger/90 dark:text-[#0b0c0e]" onClick={() => setKillConfirm(true)} disabled={!s}>
              Tout arrêter
            </Button>
          )}
        </Panel>
      </Section>

      <Section id="approvals" title="Validations en attente" meta={approvals.data ? `${approvals.data.length}` : undefined}>
        <Async query={approvals}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState title="Rien à valider" description="Les actions sensibles proposées par vos agents apparaîtront ici." />
            ) : (
              <Panel className="divide-y">
                {list.map((ap) => (
                  <div key={ap.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="text-[15px] font-medium">{ap.action}</div>
                      <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                        {name(ap.agentId)} · {ap.reason} · {relative(ap.requestedAt)} · <span className={RISK[ap.risk].cls}>{RISK[ap.risk].label}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" onClick={() => resolve.mutate({ id: ap.id, decision: 'approve' })} disabled={resolve.isPending}>
                        <Check /> Approuver
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: ap.id, decision: 'reject' })} disabled={resolve.isPending}>
                        <X /> Refuser
                      </Button>
                    </div>
                  </div>
                ))}
              </Panel>
            )
          }
        </Async>
      </Section>

      {s && (
        <div className="grid gap-10 xl:grid-cols-2">
          <Section title="Garde-fous globaux" meta="s’appliquent à tous les agents" className="mb-0">
            <Panel className="divide-y px-4">
              {(
                [
                  ['promptInjection', 'Protection contre l’injection de prompt', 'Détecte et bloque les instructions cachées dans les entrées.'],
                  ['piiMasking', 'Masquage des données personnelles', 'Emails, téléphones et IBAN masqués dans les traces.'],
                  ['humanApproval', 'Validation humaine des actions sensibles', 'Impose une approbation pour les actions à risque.'],
                  ['forbiddenList', 'Liste d’actions interdites', 'Refus systématique des actions listées par agent.'],
                  ['rateLimit', 'Limitation du débit par agent', '60 exécutions par minute au maximum.'],
                ] as const
              ).map(([k, t, d]) => (
                <SwitchRow key={k} title={t} description={d} checked={s.globalGuardrails[k]} onChange={(v) => update.mutate({ globalGuardrails: { ...s.globalGuardrails, [k]: v } })} />
              ))}
            </Panel>
          </Section>
          <div>
            <Section title="Plafond de dépense mensuel">
              <Panel className="p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-[28px] font-semibold tracking-[-0.03em] tabular">{budget ?? s.monthlyBudget} $</span>
                  {budget !== null && budget !== s.monthlyBudget && (
                    <Button size="sm" onClick={() => update.mutate({ monthlyBudget: budget }, { onSuccess: () => setBudget(null) })}>
                      Enregistrer
                    </Button>
                  )}
                </div>
                <Slider min={50} max={2000} step={10} value={[budget ?? s.monthlyBudget]} onValueChange={(v) => setBudget(Array.isArray(v) ? v[0] : v)} aria-label="Plafond mensuel" />
                <p className="mt-3 text-[13px] text-muted-foreground">Au-delà, les agents passent en mode « suggère seulement ».</p>
              </Panel>
            </Section>
            <Section title="Passerelle IA" className="mb-0">
              <Panel className="divide-y px-4">
                {(
                  [
                    ['costRouting', 'Routage selon le coût', 'Envoie les tâches simples vers Haiku.'],
                    ['fallback', 'Secours automatique entre modèles', 'Bascule sur le modèle de secours en cas d’erreur 5xx.'],
                    ['cache', 'Cache des réponses identiques', 'Prompt caching activé, TTL 1 h.'],
                    ['logging', 'Journalisation des appels', 'Chaque appel au modèle est tracé.'],
                  ] as const
                ).map(([k, t, d]) => (
                  <SwitchRow key={k} title={t} description={d} checked={s.gateway[k]} onChange={(v) => update.mutate({ gateway: { ...s.gateway, [k]: v } })} />
                ))}
              </Panel>
            </Section>
          </div>
        </div>
      )}

      <Section title="État des agents" className="mt-12">
        <Async query={agents}>
          {(list) => (
            <div className="flex flex-wrap gap-2">
              {list.map((a) => (
                <Tag key={a.id} className="gap-1.5">
                  <StatusDot tone={a.status === 'active' ? 'ok' : a.status === 'error' ? 'danger' : 'muted'} /> {a.name}
                </Tag>
              ))}
            </div>
          )}
        </Async>
      </Section>

      <ConfirmDialog
        open={killConfirm}
        onOpenChange={setKillConfirm}
        title="Arrêter tous les agents ?"
        description="Tous les agents passent en pause immédiatement, sur tous les projets. Vous pourrez les relancer d’un clic."
        confirmText="ARRÊTER"
        confirmLabel="Tout arrêter"
        pending={kill.isPending}
        onConfirm={() => kill.mutate(true)}
      />
    </>
  )
}
