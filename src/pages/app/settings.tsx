import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { api, isDemo } from '@/api'
import { keys, useAction, useSettings } from '@/api/hooks'
import type { ClaudeModel, Settings } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader, Panel } from '@/components/common/page'
import { Async } from '@/components/common/states'
import { StatusDot } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTheme, type Theme } from '@/lib/theme'
import { MODELS } from '@/lib/labels'

/** Two-column settings row: label + description on the left, panel on the right. */
function Block({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-b py-8 first:pt-0 last:border-0 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-12">
      <div>
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 text-[14px] text-muted-foreground">{description}</p>
      </div>
      <Panel className="p-4 md:p-5">{children}</Panel>
    </div>
  )
}

const NOTIF_LABELS: Record<string, string> = {
  'approval.requested': 'Action en attente de validation',
  'budget.threshold': 'Seuil de budget atteint',
  'run.failed': 'Exécution en erreur',
  'report.weekly': 'Rapport hebdomadaire',
  'version.deployed': 'Nouvelle version déployée',
}

function General({ s }: { s: Settings }) {
  const { theme, setTheme } = useTheme()
  const update = useAction((p: Partial<Settings>) => api.settings.update(p), { invalidate: [keys.settings], success: 'Paramètres enregistrés' })
  const [instance, setInstance] = useState(s.instanceUrl)
  const [simulate, setSimulate] = useState(() => {
    try {
      return localStorage.getItem('fa:simulate-errors') === '1'
    } catch {
      return false
    }
  })
  const [wipe, setWipe] = useState(false)
  return (
    <>
      <Block title="Instance" description="Adresse de votre back-end ForgeAgent auto-hébergé.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ instanceUrl: instance })
          }}
        >
          <Field label="URL de l’instance" htmlFor="st-inst" hint={isDemo ? 'Mode démo : définissez VITE_API_URL pour brancher un vrai back-end.' : undefined}>
            <Input id="st-inst" type="url" value={instance} onChange={(e) => setInstance(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13.5px]">
              <StatusDot tone={s.anthropicKeySet ? 'ok' : 'danger'} /> Clé API Anthropic {s.anthropicKeySet ? 'configurée côté serveur' : 'manquante'}
            </span>
            <Button type="submit" size="sm" disabled={update.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Block>
      <Block title="Apparence" description="Le thème sombre est le thème par défaut.">
        <div role="radiogroup" aria-label="Thème" className="grid grid-cols-3 gap-2">
          {(
            [
              ['dark', 'Sombre'],
              ['light', 'Clair'],
              ['system', 'Système'],
            ] as [Theme, string][]
          ).map(([v, l]) => (
            <button key={v} role="radio" aria-checked={theme === v} type="button" onClick={() => setTheme(v)} className={`h-10 rounded-md text-[14px] font-medium transition-colors ${theme === v ? 'bg-foreground text-background' : 'bg-secondary hover:bg-input'}`}>
              {l}
            </button>
          ))}
        </div>
      </Block>
      <Block title="Développeur" description="Outils pour tester l’interface sans back-end.">
        <SwitchRow
          title="Simuler des erreurs réseau"
          description="Toutes les requêtes du mode démo échouent : utile pour vérifier les états d’erreur."
          checked={simulate}
          onChange={(v) => {
            setSimulate(v)
            try {
              localStorage.setItem('fa:simulate-errors', v ? '1' : '0')
            } catch {
              /* ignore */
            }
            toast(v ? 'Erreurs simulées activées : rechargez une page pour les voir' : 'Erreurs simulées désactivées')
          }}
        />
        <div className="flex items-center justify-between gap-3 pt-3">
          <span className="text-[14px]">Réinitialiser les préférences locales</span>
          <Button variant="outline" size="sm" onClick={() => setWipe(true)}>
            Réinitialiser
          </Button>
        </div>
      </Block>
      <ConfirmDialog
        open={wipe}
        onOpenChange={setWipe}
        title="Réinitialiser les préférences locales ?"
        description="Thème, brouillon d’agent et onboarding seront remis à zéro sur ce navigateur."
        confirmLabel="Réinitialiser"
        onConfirm={() => {
          try {
            Object.keys(localStorage)
              .filter((k) => k.startsWith('fa:'))
              .forEach((k) => localStorage.removeItem(k))
          } catch {
            /* ignore */
          }
          location.reload()
        }}
      />
    </>
  )
}

function Models({ s }: { s: Settings }) {
  const update = useAction((p: Partial<Settings>) => api.settings.update(p), { invalidate: [keys.settings], success: 'Routage des modèles enregistré' })
  const [del, setDel] = useState(false)
  return (
    <>
      <Block title="Routage des modèles" description="Le cerveau des agents est l’API Claude. Choisissez le modèle par type de tâche.">
        <div className="grid gap-4">
          {(
            [
              ['simple', 'Tâches simples'],
              ['complex', 'Raisonnement complexe'],
              ['fallback', 'Secours en cas de panne'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`m-${k}`}>
              <NativeSelect id={`m-${k}`} value={s.modelRouting[k]} onChange={(e) => update.mutate({ modelRouting: { ...s.modelRouting, [k]: e.target.value as ClaudeModel } })}>
                {(Object.keys(MODELS) as ClaudeModel[]).map((m) => (
                  <option key={m} value={m}>
                    {MODELS[m].label} · {MODELS[m].hint}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ))}
        </div>
      </Block>
      <Block title="Données et conformité" description="Conservation des conversations et anonymisation des traces.">
        <Field label="Durée de conservation" htmlFor="m-ret">
          <NativeSelect id="m-ret" value={s.retentionDays} onChange={(e) => update.mutate({ retentionDays: Number(e.target.value) })}>
            <option value={30}>30 jours</option>
            <option value={90}>90 jours</option>
            <option value={365}>1 an</option>
          </NativeSelect>
        </Field>
        <SwitchRow className="mt-2" title="Anonymiser les traces" description="Remplace les données personnelles par des jetons." checked={s.anonymizeTraces} onChange={(v) => update.mutate({ anonymizeTraces: v })} />
        <div className="flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={() => toast.success('Export lancé : vous recevrez un lien par email')}>
            Exporter mes données
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDel(true)}>
            Supprimer les données
          </Button>
        </div>
      </Block>
      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title="Supprimer toutes les données ?"
        description="Conversations, traces et mémoire de tous les agents seront supprimées définitivement. Les configurations d’agents sont conservées."
        confirmText="SUPPRIMER"
        confirmLabel="Supprimer les données"
        onConfirm={() => {
          setDel(false)
          toast.success('Suppression planifiée : terminée sous 24 h')
        }}
      />
    </>
  )
}

function Notifications({ s }: { s: Settings }) {
  const update = useAction((p: Partial<Settings>) => api.settings.update(p), { invalidate: [keys.settings], success: 'Notifications enregistrées' })
  return (
    <Block title="Notifications" description="Ce qui mérite de vous interrompre.">
      <div className="divide-y">
        {Object.entries(NOTIF_LABELS).map(([k, label]) => (
          <SwitchRow key={k} title={label} checked={!!s.notifications[k]} onChange={(v) => update.mutate({ notifications: { ...s.notifications, [k]: v } })} />
        ))}
      </div>
      <Field label="Canal" htmlFor="n-chan" className="mt-3">
        <NativeSelect id="n-chan" value={s.notificationChannel} onChange={(e) => update.mutate({ notificationChannel: e.target.value as Settings['notificationChannel'] })}>
          <option value="email">Email</option>
          <option value="chat">Messagerie d’équipe</option>
          <option value="both">Les deux</option>
        </NativeSelect>
      </Field>
    </Block>
  )
}

export default function SettingsPage() {
  const settings = useSettings()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'general'
  return (
    <>
      <PageHeader title="Paramètres" description="Instance, modèles, conformité et notifications." />
      <UnderlineTabs
        label="Sections"
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        className="mb-8"
        items={[
          { value: 'general', label: 'Général' },
          { value: 'models', label: 'Modèles et conformité' },
          { value: 'notifications', label: 'Notifications' },
          { value: 'keys', label: 'Clés API et webhooks' },
        ]}
      />
      <Async query={settings}>
        {(s) => (
          <>
            {tab === 'general' && <General s={s} />}
            {tab === 'models' && <Models s={s} />}
            {tab === 'notifications' && <Notifications s={s} />}
            {tab === 'keys' && (
              <div className="flex flex-wrap gap-2">
                <LinkButton to="/app/integrations?tab=keys">Gérer les clés API</LinkButton>
                <LinkButton to="/app/integrations?tab=webhooks" variant="outline">
                  Gérer les webhooks
                </LinkButton>
              </div>
            )}
          </>
        )}
      </Async>
    </>
  )
}
