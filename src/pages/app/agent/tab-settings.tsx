import { Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useConnectors, useSkills } from '@/api/hooks'
import type { Agent, AgentDraft, Autonomy, ClaudeModel, TriggerKind } from '@/api/types'
import { ChipGroup, Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { Panel, Section } from '@/components/common/page'
import { EmptyState } from '@/components/common/states'
import { StatusDot } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ACTIONS, AUTONOMY, MODELS, TRIGGERS } from '@/labels'
import type { TabProps } from '.'
import { can, RoleNote, useUpdate } from './shared'

function Config({ agent }: { agent: Agent }) {
  const [f, setF] = useState(agent)
  const editor = can(agent, 'editor')
  const [publishOpen, setPublishOpen] = useState(false)
  const [note, setNote] = useState('')
  const update = useUpdate(agent)
  const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(agent), [f, agent])
  const set = (p: Partial<Agent>) => setF((x) => ({ ...x, ...p }))
  const patch = (): Partial<AgentDraft> => ({
    name: f.name,
    role: f.role,
    mission: f.mission,
    persona: f.persona,
    tone: f.tone,
    language: f.language,
    model: f.model,
    autonomy: f.autonomy,
    costCapPerDay: f.costCapPerDay,
    monthlyBudget: f.monthlyBudget,
    guardrails: f.guardrails,
    permissions: f.permissions,
  })

  return (
    <div className="pb-20">
      <RoleNote agent={agent} min="editor" />
      <fieldset disabled={!editor} className="grid gap-10 xl:grid-cols-2">
        <div className="grid content-start gap-6">
          <h2 className="text-[17px] font-semibold">Identité</h2>
          <Field label="Nom" htmlFor="c-name">
            <Input id="c-name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Rôle" htmlFor="c-role">
            <Input id="c-role" value={f.role} onChange={(e) => set({ role: e.target.value })} />
          </Field>
          <Field label="Mission" htmlFor="c-mission">
            <Textarea id="c-mission" rows={4} value={f.mission} onChange={(e) => set({ mission: e.target.value })} />
          </Field>
          <Field label="Personnalité et règles" htmlFor="c-persona">
            <Textarea id="c-persona" rows={3} value={f.persona} onChange={(e) => set({ persona: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ton" htmlFor="c-tone">
              <NativeSelect id="c-tone" value={f.tone} onChange={(e) => set({ tone: e.target.value })}>
                {['Professionnel', 'Direct', 'Pédagogue', 'Chaleureux'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Langue" htmlFor="c-lang">
              <NativeSelect id="c-lang" value={f.language} onChange={(e) => set({ language: e.target.value })}>
                {['Français', 'English', 'Multilingue'].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
        <div className="grid content-start gap-6">
          <h2 className="text-[17px] font-semibold">Comportement</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modèle" htmlFor="c-model">
              <NativeSelect id="c-model" value={f.model} onChange={(e) => set({ model: e.target.value as ClaudeModel })}>
                {(Object.keys(MODELS) as ClaudeModel[]).map((m) => (
                  <option key={m} value={m}>
                    {MODELS[m].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Autonomie" htmlFor="c-auto">
              <NativeSelect id="c-auto" value={f.autonomy} onChange={(e) => set({ autonomy: e.target.value as Autonomy })}>
                {(Object.keys(AUTONOMY) as Autonomy[]).map((a) => (
                  <option key={a} value={a}>
                    {AUTONOMY[a].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label={`Plafond de coût : ${f.costCapPerDay} $ / jour · budget mensuel ${f.monthlyBudget} $`}>
            <Slider min={1} max={200} value={[f.costCapPerDay]} onValueChange={(v) => set({ costCapPerDay: Array.isArray(v) ? v[0] : v })} aria-label="Plafond de coût" className="py-2" />
          </Field>
          <Field label="Actions autorisées">
            <ChipGroup label="Actions autorisées" value={f.permissions.allowedActions} onChange={(v) => set({ permissions: { ...f.permissions, allowedActions: v } })} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <div className="divide-y">
            <SwitchRow title="Validation humaine des actions sensibles" checked={f.guardrails.humanApproval} onChange={(v) => set({ guardrails: { ...f.guardrails, humanApproval: v } })} />
            <SwitchRow title="Protection contre l’injection de prompt" checked={f.guardrails.promptInjection} onChange={(v) => set({ guardrails: { ...f.guardrails, promptInjection: v } })} />
            <SwitchRow title="Masquage des données personnelles" checked={f.guardrails.piiMasking} onChange={(v) => set({ guardrails: { ...f.guardrails, piiMasking: v } })} />
          </div>
        </div>
      </fieldset>

      {dirty && editor && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-2xl items-center gap-3 rounded-lg bg-foreground px-4 py-3 text-background shadow-float lg:left-[calc(248px+1rem)]" role="region" aria-label="Modifications non enregistrées">
          <span className="flex-1 text-[14px] font-medium">Modifications non publiées</span>
          <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 hover:text-background" onClick={() => setF(agent)}>
            Annuler
          </Button>
          <Button size="sm" className="bg-background text-foreground hover:bg-background/90" onClick={() => setPublishOpen(true)}>
            Publier la v{agent.version + 1}
          </Button>
        </div>
      )}

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publier la v{agent.version + 1}</DialogTitle>
            <DialogDescription>Les suites de régression de cet agent sont rejouées d’abord : si le score baisse, la publication est refusée. La version actuelle reste restaurable.</DialogDescription>
          </DialogHeader>
          <Field label="Note de version" htmlFor="v-note">
            <Input id="v-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Plafond abaissé, ton plus direct" autoFocus />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { patch: patch(), note: note || 'Mise à jour de la configuration' },
                  {
                    onSuccess: () => {
                      setPublishOpen(false)
                      setNote('')
                    },
                  },
                )
              }
            >
              {update.isPending ? 'Tests de régression…' : 'Publier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Skills({ agent }: { agent: Agent }) {
  const skills = useSkills()
  const update = useUpdate(agent)
  const attached = skills.data?.filter((s) => agent.skillIds.includes(s.id)) ?? []
  const available = skills.data?.filter((s) => !agent.skillIds.includes(s.id)) ?? []
  return (
    <div className="grid gap-10 xl:grid-cols-2">
      <Section title="Skills actives" meta={`${attached.length}`} className="mb-0">
        {attached.length === 0 ? (
          <EmptyState title="Aucune skill" description="Ajoutez une skill depuis la bibliothèque à droite." />
        ) : (
          <Panel className="divide-y">
            {attached.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">
                    {s.name} <span className="font-normal text-muted-foreground">v{s.version}</span>
                  </div>
                  <div className="text-[13px] text-muted-foreground">{s.description}</div>
                </div>
                <Button variant="outline" size="sm" disabled={update.isPending} onClick={() => update.mutate({ patch: { skillIds: agent.skillIds.filter((x) => x !== s.id) }, note: `Skill « ${s.name} » retirée` })}>
                  <X /> Retirer
                </Button>
              </div>
            ))}
          </Panel>
        )}
      </Section>
      <Section title="Bibliothèque" action={<LinkButton to="/app/skills" variant="ghost" size="sm">Gérer les skills</LinkButton>} className="mb-0">
        <Panel className="divide-y">
          {available.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{s.name}</div>
                <div className="text-[13px] text-muted-foreground">{s.description}</div>
              </div>
              <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ patch: { skillIds: [...agent.skillIds, s.id] }, note: `Skill « ${s.name} » ajoutée` })}>
                <Plus /> Ajouter
              </Button>
            </div>
          ))}
          {available.length === 0 && <p className="px-4 py-4 text-[14px] text-muted-foreground">Toutes les skills sont déjà actives.</p>}
        </Panel>
      </Section>
    </div>
  )
}

function Triggers({ agent }: { agent: Agent }) {
  const update = useUpdate(agent)
  const [kind, setKind] = useState<TriggerKind>('cron')
  const [config, setConfig] = useState('')
  const placeholder: Record<TriggerKind, string> = { message: 'widget', cron: '0 8 * * 1', webhook: 'mon-evenement', db_event: 'orders.insert', file: 'entrants/' }
  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <Panel className="divide-y">
        {agent.triggers.length === 0 && <p className="px-4 py-5 text-[14px] text-muted-foreground">Aucun déclencheur : l’agent ne s’exécutera que sur appel API.</p>}
        {agent.triggers.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 px-4">
            <SwitchRow
              className="flex-1"
              title={t.label}
              description={
                <>
                  {TRIGGERS[t.kind]} · <code className="text-[12.5px]">{t.config || '—'}</code>
                </>
              }
              checked={t.enabled}
              onChange={(v) => update.mutate({ patch: { triggers: agent.triggers.map((x) => (x.id === t.id ? { ...x, enabled: v } : x)) } })}
            />
            <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${t.label}`} onClick={() => update.mutate({ patch: { triggers: agent.triggers.filter((x) => x.id !== t.id) } })}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </Panel>
      <Panel className="p-5">
        <h3 className="mb-4 text-[15px] font-semibold">Ajouter un déclencheur</h3>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            update.mutate(
              { patch: { triggers: [...agent.triggers, { id: `trg_${Date.now()}`, kind, label: TRIGGERS[kind], config: config || placeholder[kind], enabled: true }] } },
              { onSuccess: () => setConfig('') },
            )
          }}
        >
          <Field label="Type" htmlFor="t-kind">
            <NativeSelect id="t-kind" value={kind} onChange={(e) => setKind(e.target.value as TriggerKind)}>
              {(Object.keys(TRIGGERS) as TriggerKind[]).map((k) => (
                <option key={k} value={k}>
                  {TRIGGERS[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Configuration" htmlFor="t-conf" hint={kind === 'cron' ? 'Expression cron, fuseau Europe/Paris.' : undefined}>
            <Input id="t-conf" value={config} onChange={(e) => setConfig(e.target.value)} placeholder={placeholder[kind]} className="font-mono text-[13px]" />
          </Field>
          <Button type="submit" disabled={update.isPending}>
            <Plus /> Ajouter
          </Button>
        </form>
      </Panel>
    </div>
  )
}

function Tools({ agent }: { agent: Agent }) {
  const connectors = useConnectors()
  const update = useUpdate(agent)
  const grant = (id: string) => agent.tools.find((t) => t.connectorId === id)
  return (
    <>
      <Panel className="divide-y">
        {(connectors.data ?? []).map((c) => {
          const g = grant(c.id)
          return (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium">
                  <StatusDot tone={!c.enabled ? 'muted' : g?.enabled ? 'ok' : 'muted'} /> {c.name}
                </div>
                <div className="font-mono text-[12.5px] text-muted-foreground">{c.endpoint}</div>
              </div>
              <NativeSelect
                aria-label={`Accès à ${c.name}`}
                className="w-48"
                value={g?.access ?? 'none'}
                onChange={(e) => {
                  const v = e.target.value
                  const others = agent.tools.filter((t) => t.connectorId !== c.id)
                  update.mutate({ patch: { tools: v === 'none' ? others : [...others, { connectorId: c.id, access: v as 'read' | 'read_write', enabled: true }] } })
                }}
              >
                <option value="none">Aucun accès</option>
                <option value="read">Lecture seule</option>
                <option value="read_write">Lecture et écriture</option>
              </NativeSelect>
            </div>
          )
        })}
      </Panel>
      <p className="mt-3 text-[13px] text-muted-foreground">Les identifiants de chaque connecteur sont des secrets de cet agent (onglet Intégration), jamais partagés avec un autre agent.</p>
    </>
  )
}


export default function SettingsTab({ agent }: TabProps) {
  return (
    <div className="grid gap-14">
      <Config key={agent.updatedAt + agent.version} agent={agent} />
      <Section title="Skills">
        <Skills agent={agent} />
      </Section>
      <Section title="Déclencheurs">
        <Triggers agent={agent} />
      </Section>
      <Section title="Outils (MCP)">
        <Tools agent={agent} />
      </Section>
    </div>
  )
}
