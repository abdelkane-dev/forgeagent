import { Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { api, isDemo } from '@/api'
import { keys, useAction, useAdminAgents, useAdminAudit, useAdminUsers, useConnectors, useMe, usePlatformSettings } from '@/api/hooks'
import type { ClaudeModel, PlatformRole, PlatformSettings } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { CopyButton } from '@/components/common/copy-button'
import { Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, LoadingBlock } from '@/components/common/states'
import { AgentStatus, StatusDot, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clock, date, relative } from '@/lib/format'
import { useTheme, type Theme } from '@/lib/theme'
import { L, MODELS, PLATFORM_ROLES } from '@/labels'

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

function Account() {
  const me = useMe()
  const { theme, setTheme } = useTheme()
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
      <Block title="Compte" description="Votre rôle sur la plateforme. Vos droits sur chaque agent se lisent dans son onglet Équipe et accès.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
          <dt className="text-muted-foreground">Nom</dt>
          <dd>{me.data?.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{me.data?.email}</dd>
          <dt className="text-muted-foreground">Rôle plateforme</dt>
          <dd>{me.data ? PLATFORM_ROLES[me.data.platformRole] : ''}</dd>
        </dl>
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
      {isDemo && (
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
      )}
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

function Platform({ s, admin }: { s: PlatformSettings; admin: boolean }) {
  const update = useAction((p: Partial<PlatformSettings>) => api.platform.updateSettings(p), { invalidate: [keys.platform], success: 'Paramètres de la plateforme enregistrés' })
  const [instance, setInstance] = useState(s.instanceUrl)
  const [kill, setKill] = useState(false)
  const g = s.globalGuardrails
  return (
    <fieldset disabled={!admin}>
      {!admin && <p className="mb-6 rounded-md bg-secondary/60 px-3 py-2 text-[13.5px] text-muted-foreground">Lecture seule : réservé aux administrateurs de la plateforme.</p>}
      <Block title="Instance" description="Adresse publique du back-end auto-hébergé et services branchés.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate({ instanceUrl: instance })
          }}
        >
          <Field label="URL de l’instance" htmlFor="st-inst">
            <Input id="st-inst" type="url" value={instance} onChange={(e) => setInstance(e.target.value)} />
          </Field>
          <ul className="grid gap-1.5 text-[13.5px]">
            <li className="flex items-center gap-2">
              <StatusDot tone={s.anthropicKeySet ? 'ok' : 'warn'} /> Clé Anthropic {s.anthropicKeySet ? 'configurée côté serveur' : 'absente : modèle simulé'}
            </li>
            <li className="flex items-center gap-2">
              <StatusDot tone="ok" /> Embeddings : {s.embeddings}
            </li>
            <li className="flex items-center gap-2">
              <StatusDot tone="ok" /> Stockage des fichiers : {s.storage === 's3' ? 'S3 / MinIO, un préfixe par agent' : 'disque local, un dossier par agent'}
            </li>
          </ul>
          {admin && (
            <Button type="submit" size="sm" className="w-fit" disabled={update.isPending}>
              {L.action.save}
            </Button>
          )}
        </form>
      </Block>
      <Block title="Modèle et conservation" description="Valeurs par défaut des nouveaux agents. Chaque agent garde ses propres réglages.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modèle par défaut" htmlFor="st-model">
            <NativeSelect id="st-model" value={s.defaultModel} onChange={(e) => update.mutate({ defaultModel: e.target.value as ClaudeModel })}>
              {(Object.keys(MODELS) as ClaudeModel[]).map((m) => (
                <option key={m} value={m}>
                  {MODELS[m].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Conservation des traces" htmlFor="st-ret">
            <NativeSelect id="st-ret" value={s.retentionDays} onChange={(e) => update.mutate({ retentionDays: Number(e.target.value) })}>
              {[30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {d === 365 ? '1 an' : `${d} jours`}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
      </Block>
      <Block title="Garde-fous globaux" description="Appliqués à tous les agents, en plus des garde-fous de chacun.">
        <div className="divide-y">
          <SwitchRow title="Protection contre l’injection de prompt" checked={g.promptInjection} onChange={(v) => update.mutate({ globalGuardrails: { ...g, promptInjection: v } })} />
          <SwitchRow title="Masquage des données personnelles" checked={g.piiMasking} onChange={(v) => update.mutate({ globalGuardrails: { ...g, piiMasking: v } })} />
          <SwitchRow title="Validation humaine des actions sensibles" checked={g.humanApproval} onChange={(v) => update.mutate({ globalGuardrails: { ...g, humanApproval: v } })} />
          <SwitchRow title="Limitation de débit" checked={g.rateLimit} onChange={(v) => update.mutate({ globalGuardrails: { ...g, rateLimit: v } })} />
        </div>
      </Block>
      <Block title="Arrêt d’urgence" description="Bloque immédiatement toutes les exécutions de tous les agents. Noté dans le journal de la plateforme.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <StatusDot tone={s.killSwitch ? 'danger' : 'ok'} pulse={s.killSwitch} /> {s.killSwitch ? 'Arrêt d’urgence actif' : 'Agents autorisés à s’exécuter'}
          </span>
          {admin &&
            (s.killSwitch ? (
              <Button variant="outline" onClick={() => update.mutate({ killSwitch: false })}>
                Relancer les agents
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setKill(true)}>
                <ShieldAlert /> Tout arrêter
              </Button>
            ))}
        </div>
      </Block>
      <ConfirmDialog open={kill} onOpenChange={setKill} title="Arrêter tous les agents ?" description="Plus aucune exécution n’est acceptée tant que l’arrêt est actif." confirmLabel="Tout arrêter" onConfirm={() => update.mutate({ killSwitch: true }, { onSuccess: () => setKill(false) })} />
    </fieldset>
  )
}

function Admin() {
  const users = useAdminUsers()
  const agents = useAdminAgents()
  const audit = useAdminAudit()
  const connectors = useConnectors()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<PlatformRole>('member')
  const [link, setLink] = useState<string | null>(null)
  const inv = [keys.admin('users'), keys.admin('audit')]
  const invite = useAction(() => api.admin.invite(email, role), { invalidate: inv, success: 'Invitation créée', onSuccess: (r) => (setEmail(''), setLink(r.inviteUrl)) })
  const setR = useAction(({ id, r }: { id: string; r: PlatformRole }) => api.admin.setRole(id, r), { invalidate: inv, success: 'Rôle plateforme modifié' })
  const remove = useAction((id: string) => api.admin.removeUser(id), { invalidate: inv, success: 'Compte supprimé' })
  const toggle = useAction(({ id, v }: { id: string; v: boolean }) => api.connectors.toggle(id, v), { invalidate: [keys.connectors] })

  return (
    <div className="grid gap-12">
      <Section title="Comptes" meta={users.data ? `${users.data.length}` : undefined} description="Le rôle plateforme ne donne aucun accès aux données des agents : il faut en être membre.">
        {users.isPending ? (
          <LoadingBlock />
        ) : (
          <Panel className="divide-y">
            {users.data?.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">
                    {u.name} {u.invited && <Tag>Invitation en attente</Tag>}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {u.email} · actif {relative(u.lastActiveAt)}
                  </div>
                </div>
                <NativeSelect aria-label={`Rôle de ${u.name}`} className="w-56" value={u.platformRole} onChange={(e) => setR.mutate({ id: u.id, r: e.target.value as PlatformRole })}>
                  <option value="member">{PLATFORM_ROLES.member}</option>
                  <option value="admin">{PLATFORM_ROLES.admin}</option>
                </NativeSelect>
                <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${u.name}`} onClick={() => remove.mutate(u.id)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </Panel>
        )}
        <form
          className="mt-4 flex max-w-2xl flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            invite.mutate(undefined)
          }}
        >
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nouveau@bonaco.pro" aria-label="Email" className="min-w-60 flex-1" />
          <NativeSelect aria-label="Rôle plateforme" className="w-48" value={role} onChange={(e) => setRole(e.target.value as PlatformRole)}>
            <option value="member">{PLATFORM_ROLES.member}</option>
            <option value="admin">{PLATFORM_ROLES.admin}</option>
          </NativeSelect>
          <Button type="submit" variant="outline" disabled={invite.isPending}>
            <Plus /> Inviter
          </Button>
        </form>
        {link && (
          <div className="mt-3 flex max-w-2xl items-center gap-2 rounded-md bg-amber/15 px-3 py-2 text-[13px]" role="status">
            <code className="min-w-0 flex-1 truncate font-mono">{link}</code>
            <CopyButton text={link} />
          </div>
        )}
      </Section>

      <Section title="Agents de la plateforme" meta="métadonnées seulement" description="Pour intervenir sur un agent dont vous n’êtes pas membre, l’API exige un en-tête X-Forge-Maintenance justifié, écrit dans l’audit de l’agent.">
        <Async query={agents}>
          {(list) => (
            <Panel className="divide-y">
              {list.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.name}</span> <span className="font-mono text-[12.5px] text-muted-foreground">{a.id}</span>
                  </span>
                  <AgentStatus status={a.status} />
                  <span className="text-[13px] text-muted-foreground">
                    {a.owners.join(', ')} · {a.members} membre(s) · {date(a.createdAt)}
                  </span>
                </div>
              ))}
            </Panel>
          )}
        </Async>
      </Section>

      <Section title="Connecteurs" description="Types de connecteurs disponibles. Les identifiants sont des secrets de chaque agent.">
        <Panel className="divide-y px-4">
          {connectors.data?.map((c) => (
            <SwitchRow key={c.id} title={c.name} description={<span className="font-mono text-[12.5px]">{c.endpoint}</span>} checked={c.enabled} onChange={(v) => toggle.mutate({ id: c.id, v })} />
          ))}
        </Panel>
      </Section>

      <Section title="Journal de la plateforme" meta="comptes, projets, maintenance, purges">
        <Async query={audit}>
          {(list) =>
            list.length ? (
              <Panel className="divide-y">
                {list.slice(0, 100).map((a) => (
                  <div key={a.id} className="grid gap-1 px-4 py-2.5 text-[13.5px] sm:grid-cols-[150px_1fr]">
                    <span className="text-muted-foreground tabular">
                      {date(a.at)} · {clock(a.at).slice(0, 5)}
                    </span>
                    <span>
                      <b className="font-semibold">{a.actor}</b> {a.action} <span className="text-muted-foreground">{a.target}</span>
                    </span>
                  </div>
                ))}
              </Panel>
            ) : (
              <p className="text-[14px] text-muted-foreground">Aucune entrée.</p>
            )
          }
        </Async>
      </Section>
    </div>
  )
}

export default function SettingsPage() {
  const settings = usePlatformSettings()
  const me = useMe()
  const admin = me.data?.platformRole === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'account'
  return (
    <>
      <PageHeader title={L.nav.settings} description="Votre compte, la plateforme et son administration. Les réglages d’un agent sont dans son propre espace." />
      <UnderlineTabs
        label="Sections"
        value={tab}
        onChange={(v) => setParams({ tab: v })}
        className="mb-8"
        items={[
          { value: 'account', label: 'Compte' },
          { value: 'platform', label: 'Plateforme' },
          ...(admin ? [{ value: 'admin', label: 'Administration' }] : []),
        ]}
      />
      {tab === 'account' && <Account />}
      {tab === 'platform' && <Async query={settings}>{(s) => <Platform s={s} admin={admin} />}</Async>}
      {tab === 'admin' && (admin ? <Admin /> : <p className="text-[14px] text-muted-foreground">Réservé aux administrateurs. <Link to="/app/settings" className="underline">Retour</Link></p>)}
    </>
  )
}
