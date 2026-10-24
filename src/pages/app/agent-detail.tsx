import { ArrowLeft, Check, Copy, ExternalLink, MoreHorizontal, Pause, Play, Plus, RotateCcw, Send, SquareTerminal, Trash2, Wifi, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, isDemo } from '@/api'
import { keys, useAction, useAgent, useConnectors, useMemories, useProjects, useSkills, useTraces } from '@/api/hooks'
import type { Agent, Autonomy, ClaudeModel, TriggerKind } from '@/api/types'
import { KpiStrip, Meter } from '@/components/common/charts'
import { CodeBlock } from '@/components/common/code-block'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { ChipGroup, Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { LogStream } from '@/components/common/log-stream'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/common/states'
import { AgentStatus, StatusDot, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { clock, date, duration, num, pct, relative, usd } from '@/lib/format'
import { ACTIONS, AGENT_TYPES, AUTONOMY, MODELS, TRIGGERS } from '@/lib/labels'
import { agentSnippets, API_HOST } from '@/lib/snippets'
import { cn } from '@/lib/utils'

const TABS = [
  ['overview', 'Aperçu'],
  ['config', 'Configuration'],
  ['skills', 'Skills'],
  ['triggers', 'Déclencheurs'],
  ['tools', 'Outils'],
  ['memory', 'Mémoire'],
  ['versions', 'Versions'],
  ['logs', 'Activité et logs'],
  ['integration', 'Intégration'],
  ['site', 'Site externe'],
] as const
type TabId = (typeof TABS)[number][0]

/** Shared mutation for patching the agent. Pass a note to publish a new version. */
function useUpdate(agent: Agent) {
  return useAction(({ patch, note }: { patch: Partial<Agent>; note?: string }) => api.agents.update(agent.id, patch, note), {
    invalidate: [keys.agent(agent.id), keys.agents],
    success: (a, v) => (v.note !== undefined ? `v${a.version} publiée` : 'Modification enregistrée'),
  })
}

function Overview({ agent }: { agent: Agent }) {
  const traces = useTraces(agent.id)
  return (
    <>
      <Section title="Dernières 24 heures">
        <KpiStrip
          items={[
            { label: 'Exécutions', value: num(agent.metrics.runs24h), hint: `${num(agent.metrics.tokens24h)} tokens` },
            { label: 'Taux de succès', value: pct(agent.metrics.successRate) },
            {
              label: 'Coût du jour',
              value: usd(agent.metrics.costToday),
              hint: <Meter value={agent.metrics.costToday} max={agent.costCapPerDay} className="mt-1" />,
            },
            { label: 'Latence p50', value: agent.metrics.p50LatencyMs ? duration(agent.metrics.p50LatencyMs) : '—' },
          ]}
        />
      </Section>
      <div className="mb-12 grid gap-8 xl:grid-cols-[1fr_1.2fr]">
        <Section title="Mission" className="mb-0">
          <Panel className="p-5 text-[15px] leading-relaxed">
            <p>{agent.mission}</p>
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[14px]">
              <dt className="text-muted-foreground">Rôle</dt>
              <dd>{agent.role || '—'}</dd>
              <dt className="text-muted-foreground">Autonomie</dt>
              <dd>{AUTONOMY[agent.autonomy].label}</dd>
              <dt className="text-muted-foreground">Modèle</dt>
              <dd>{MODELS[agent.model].label}</dd>
              <dt className="text-muted-foreground">Ton · langue</dt>
              <dd>
                {agent.tone} · {agent.language}
              </dd>
              <dt className="text-muted-foreground">ID</dt>
              <dd className="font-mono text-[13px]">{agent.id}</dd>
            </dl>
          </Panel>
        </Section>
        <Section title="Dernières exécutions" className="mb-0" action={<LinkButton to={`/app/observability?agent=${agent.id}`} variant="ghost" size="sm">Toutes les traces</LinkButton>}>
          {traces.isPending ? (
            <LoadingBlock />
          ) : !traces.data?.length ? (
            <EmptyState title="Aucune exécution" description="Lancez un test pour voir la première trace." action={<LinkButton to={`/app/playground?agent=${agent.id}`} size="sm">Tester l’agent</LinkButton>} />
          ) : (
            <Panel className="divide-y">
              {traces.data.slice(0, 5).map((t) => (
                <Link key={t.id} to={`/app/observability?trace=${t.id}`} className="flex items-center gap-3 px-4 py-3 text-[14px] transition-colors hover:bg-raised">
                  <StatusDot tone={t.status === 'ok' ? 'ok' : 'danger'} />
                  <span className="min-w-0 flex-1 truncate">{t.input}</span>
                  <span className="text-muted-foreground tabular">{duration(t.durationMs)}</span>
                  <span className="hidden w-16 text-right tabular sm:inline">{usd(t.cost)}</span>
                  <span className="hidden w-28 text-right whitespace-nowrap text-muted-foreground sm:inline">{relative(t.at)}</span>
                </Link>
              ))}
            </Panel>
          )}
        </Section>
      </div>
      <Section title="Journal en direct">
        <LogStream agentId={agent.id} height="h-[240px]" />
      </Section>
    </>
  )
}

function Config({ agent }: { agent: Agent }) {
  const [f, setF] = useState(agent)
  const [publishOpen, setPublishOpen] = useState(false)
  const [note, setNote] = useState('')
  const update = useUpdate(agent)
  const dirty = useMemo(() => JSON.stringify(f) !== JSON.stringify(agent), [f, agent])
  const set = (p: Partial<Agent>) => setF((x) => ({ ...x, ...p }))
  const patch = (): Partial<Agent> => ({
    name: f.name,
    role: f.role,
    mission: f.mission,
    persona: f.persona,
    tone: f.tone,
    language: f.language,
    model: f.model,
    autonomy: f.autonomy,
    costCapPerDay: f.costCapPerDay,
    guardrails: f.guardrails,
    permissions: f.permissions,
  })

  return (
    <div className="pb-20">
      <div className="grid gap-10 xl:grid-cols-2">
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
          <Field label={`Plafond de coût : ${f.costCapPerDay} $ / jour`}>
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
      </div>

      {dirty && (
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
            <DialogDescription>La version actuelle reste restaurable depuis l’onglet Versions.</DialogDescription>
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
              {update.isPending ? 'Publication…' : 'Publier'}
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
  const placeholder: Record<TriggerKind, string> = { message: 'widget', cron: '0 8 * * 1', webhook: '/hooks/mon-evenement', db_event: 'orders.insert', file: 's3://bucket/entrants', agent: 'agt_…' }
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
      <p className="mt-3 text-[13px] text-muted-foreground">
        Les connecteurs se configurent au niveau de l’instance dans <Link to="/app/integrations?tab=mcp" className="underline underline-offset-2">Intégrations › MCP</Link>.
      </p>
    </>
  )
}

function Memory({ agent }: { agent: Agent }) {
  const mem = useMemories(agent.id)
  const update = useUpdate(agent)
  const [confirm, setConfirm] = useState(false)
  const forget = useAction((id: string) => api.memories.remove(id), { invalidate: [keys.memories(agent.id)], success: 'Souvenir oublié' })
  const clear = useAction(() => api.memories.clear(agent.id), { invalidate: [keys.memories(agent.id)], success: 'Mémoire effacée', onSuccess: () => setConfirm(false) })
  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <Section title="Souvenirs" meta={mem.data ? `${mem.data.length}` : undefined} className="mb-0" action={<Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm(true)} disabled={!mem.data?.length}>Tout effacer</Button>}>
        {mem.isPending ? (
          <LoadingBlock />
        ) : !mem.data?.length ? (
          <EmptyState title="Aucun souvenir" description="L’agent n’a encore rien mémorisé." />
        ) : (
          <Panel className="divide-y">
            {mem.data.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[14px]">{m.text}</p>
                  <p className="text-[12.5px] text-muted-foreground">{date(m.createdAt)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => forget.mutate(m.id)}>
                  Oublier
                </Button>
              </div>
            ))}
          </Panel>
        )}
      </Section>
      <Panel className="divide-y self-start px-4">
        <SwitchRow title="Mémoire à long terme" checked={agent.memory.longTerm} onChange={(v) => update.mutate({ patch: { memory: { ...agent.memory, longTerm: v } } })} />
        <SwitchRow title="Partager avec les agents du projet" checked={agent.memory.sharedWithProject} onChange={(v) => update.mutate({ patch: { memory: { ...agent.memory, sharedWithProject: v } } })} />
        <div className="flex items-center justify-between gap-3 py-3">
          <label htmlFor="m-ret" className="text-[14px] font-medium">
            Conservation
          </label>
          <NativeSelect id="m-ret" className="w-36" value={agent.memory.retentionDays} onChange={(e) => update.mutate({ patch: { memory: { ...agent.memory, retentionDays: Number(e.target.value) } } })}>
            {[30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d === 365 ? '1 an' : `${d} jours`}
              </option>
            ))}
          </NativeSelect>
        </div>
      </Panel>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Effacer toute la mémoire ?" description={`${agent.name} oubliera tous ses souvenirs. Les conversations passées restent dans les traces.`} confirmLabel="Effacer la mémoire" pending={clear.isPending} onConfirm={() => clear.mutate(undefined)} />
    </div>
  )
}

function Versions({ agent }: { agent: Agent }) {
  const [restore, setRestore] = useState<number | null>(null)
  const act = useAction((v: number) => api.agents.restoreVersion(agent.id, v), {
    invalidate: [keys.agent(agent.id), keys.agents],
    success: (_, v) => `v${v} restaurée`,
    onSuccess: () => setRestore(null),
  })
  return (
    <>
      <ol className="relative grid gap-0">
        {agent.versions.map((v, i) => (
          <li key={v.version} className="grid grid-cols-[24px_1fr] gap-4">
            <div className="flex flex-col items-center">
              <span className={cn('hex mt-1.5 size-3', i === 0 ? 'bg-cobalt' : 'bg-muted-foreground/40')} />
              {i < agent.versions.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 pb-6">
              <div>
                <div className="text-[15px] font-semibold">
                  v{v.version} {i === 0 && <Tag className="ml-1.5">Actuelle</Tag>}
                </div>
                <p className="text-[14px]">{v.note}</p>
                <p className="text-[13px] text-muted-foreground">
                  {v.author} · {date(v.createdAt)} à {clock(v.createdAt).slice(0, 5)}
                </p>
              </div>
              {i > 0 && (
                <Button variant="outline" size="sm" onClick={() => setRestore(v.version)}>
                  <RotateCcw /> Restaurer
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <ConfirmDialog
        open={restore !== null}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Restaurer la v${restore} ?`}
        description={`Une nouvelle version v${agent.version + 1} sera créée avec la configuration de la v${restore}. Rien n’est perdu.`}
        confirmLabel="Restaurer"
        tone="default"
        pending={act.isPending}
        onConfirm={() => restore !== null && act.mutate(restore)}
      />
    </>
  )
}

function ExternalSite({ agent }: { agent: Agent }) {
  const [url, setUrl] = useState(agent.externalSite?.url ?? '')
  const [event, setEvent] = useState('ping')
  const [lines, setLines] = useState<{ at: string; text: string; ok: boolean }[]>([])
  const ping = useAction((u: string) => api.agents.pingSite(agent.id, u), {
    invalidate: [keys.agent(agent.id)],
    onSuccess: (s) => setLines((l) => [...l, { at: new Date().toISOString(), text: s.status === 'connected' ? `Connexion OK · ${s.latencyMs} ms · origine ${s.allowedOrigins[0]}` : `Site injoignable : ${s.url}`, ok: s.status === 'connected' }]),
  })
  const send = useAction((e: string) => api.agents.sendToSite(agent.id, e), {
    onSuccess: (r) => setLines((l) => [...l, { at: new Date().toISOString(), text: `${r.response} · ${r.latencyMs} ms`, ok: r.ok }]),
  })
  const site = agent.externalSite
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
      <div className="grid content-start gap-6">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (url) ping.mutate(url)
          }}
        >
          <Field
            label="Adresse du site ou de l’application"
            htmlFor="s-url"
            hint={
              isDemo ? 'Le widget doit être installé sur ce site.' : (
                <>
                  Le widget doit être installé sur ce site. Site de démo local :{' '}
                  <button type="button" className="underline underline-offset-2" onClick={() => setUrl(`${API_HOST}/demo-site?agent=${agent.id}&key=VOTRE_CLE_PUBLIABLE`)}>
                    {API_HOST}/demo-site
                  </button>{' '}
                  (remplacez la clé, et ajoutez {new URL(API_HOST).host} aux domaines du projet).
                </>
              )
            }
          >
            <div className="flex gap-2">
              <Input id="s-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.bonaco.pro" required />
              <Button type="submit" disabled={ping.isPending}>
                <Wifi /> {ping.isPending ? 'Vérification…' : 'Vérifier'}
              </Button>
            </div>
          </Field>
        </form>
        <Panel className="p-5">
          {site ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[14px]">
              <dt className="text-muted-foreground">Statut</dt>
              <dd className="flex items-center gap-2 font-medium">
                <StatusDot tone={site.status === 'connected' ? 'ok' : site.status === 'pending' ? 'warn' : 'danger'} pulse={site.status === 'connected'} />
                {site.status === 'connected' ? 'Connecté' : site.status === 'pending' ? 'En attente' : 'Injoignable'}
              </dd>
              <dt className="text-muted-foreground">Site</dt>
              <dd>
                <a href={site.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                  {site.url} <ExternalLink className="size-3.5" />
                </a>
              </dd>
              <dt className="text-muted-foreground">Latence</dt>
              <dd className="tabular">{site.latencyMs ? `${site.latencyMs} ms` : '—'}</dd>
              <dt className="text-muted-foreground">Dernier ping</dt>
              <dd>{relative(site.lastPingAt)}</dd>
              <dt className="text-muted-foreground">Origines autorisées</dt>
              <dd className="font-mono text-[13px]">{site.allowedOrigins.join(', ')}</dd>
            </dl>
          ) : (
            <p className="text-[14px] text-muted-foreground">Aucun site relié. Saisissez l’adresse puis vérifiez la connexion.</p>
          )}
        </Panel>
        <div className="grid gap-3">
          <Field label="Envoyer un événement de test au site" htmlFor="s-ev">
            <div className="flex gap-2">
              <NativeSelect id="s-ev" value={event} onChange={(e) => setEvent(e.target.value)} className="flex-1">
                <option value="ping">ping</option>
                <option value="page.context">page.context (lire la page courante)</option>
                <option value="ui.highlight">ui.highlight (surligner un élément)</option>
                <option value="api.call">api.call (appeler une route du site)</option>
                <option value="notify.admin">notify.admin (notifier un administrateur)</option>
              </NativeSelect>
              <Button variant="outline" onClick={() => send.mutate(event)} disabled={send.isPending || site?.status !== 'connected'}>
                <Send /> Envoyer
              </Button>
            </div>
          </Field>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg bg-[#0e1013] text-[#e6e8ec] dark:bg-[#08090b]" data-ui>
        <div className="bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white/80">Console d’interaction</div>
        <div className="h-[320px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.75]" role="log" aria-live="polite">
          {lines.length === 0 && <p className="text-white/45">Vérifiez la connexion ou envoyez un événement : les réponses du site s’afficheront ici.</p>}
          {lines.map((l, i) => (
            <div key={i}>
              <span className="text-white/40">{clock(l.at)}</span> <span className={l.ok ? 'text-[#3ccf8e]' : 'text-[#ff7b7b]'}>{l.ok ? '✓' : '✗'}</span> {l.text}
            </div>
          ))}
          {(ping.isPending || send.isPending) && <div className="text-white/45">… en attente de réponse</div>}
        </div>
      </div>
    </div>
  )
}

export default function AgentDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabId) || 'overview'
  const agent = useAgent(id)
  const projects = useProjects()
  const [del, setDel] = useState(false)
  const [created, setCreated] = useState(params.get('created') === '1')

  const remove = useAction(() => api.agents.remove(id), { invalidate: [keys.agents], success: 'Agent supprimé', onSuccess: () => navigate('/app/agents') })
  const toggle = useAction((status: 'active' | 'paused') => api.agents.update(id, { status }), { invalidate: [keys.agent(id), keys.agents], success: (_, s) => (s === 'active' ? 'Agent activé' : 'Agent mis en pause') })
  const dup = useAction((projectId: string) => api.agents.duplicate(id, projectId), { invalidate: [keys.agents], success: 'Copie créée', onSuccess: (a) => navigate(`/app/agents/${a.id}`) })

  if (agent.isPending) return <LoadingBlock label="Chargement de l’agent…" />
  if (agent.isError)
    return (
      <div className="grid gap-4">
        <LinkButton to="/app/agents" variant="ghost" className="w-fit">
          <ArrowLeft /> Agents
        </LinkButton>
        <ErrorState error={agent.error} onRetry={() => agent.refetch()} />
      </div>
    )
  const a = agent.data

  return (
    <>
      <LinkButton to="/app/agents" variant="ghost" size="sm" className="-ml-2.5 mb-4 text-muted-foreground">
        <ArrowLeft /> Agents
      </LinkButton>

      {created && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg bg-ok/12 px-4 py-3 text-[14px]" role="status">
          <Check className="size-4 text-ok" />
          <span className="flex-1">
            <b className="font-semibold">{a.name}</b> est créé et actif. Prochaine étape : le tester en bac à sable.
          </span>
          <LinkButton to={`/app/playground?agent=${a.id}`} size="sm">
            Tester maintenant
          </LinkButton>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={() => setCreated(false)}>
            <X />
          </Button>
        </div>
      )}

      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.035em] md:text-[32px]">{a.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-muted-foreground">
            <AgentStatus status={a.status} />
            <span>{AGENT_TYPES[a.type].label} · {a.subcategory}</span>
            <span>v{a.version}</span>
            <span>{a.projectIds.map((p) => projects.data?.find((x) => x.id === p)?.name).filter(Boolean).join(', ')}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/app/playground?agent=${a.id}`} variant="outline">
            <SquareTerminal /> Tester
          </LinkButton>
          {a.status === 'active' ? (
            <Button variant="outline" onClick={() => toggle.mutate('paused')} disabled={toggle.isPending}>
              <Pause /> Mettre en pause
            </Button>
          ) : (
            <Button onClick={() => toggle.mutate('active')} disabled={toggle.isPending}>
              <Play /> Activer
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-md border border-input text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Plus d’actions">
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              {projects.data?.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => dup.mutate(p.id)}>
                  <Copy /> Copier vers {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDel(true)}>
                <Trash2 /> Supprimer l’agent
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <UnderlineTabs label="Sections de l’agent" value={tab} onChange={(v) => setParams({ tab: v })} items={TABS.map(([value, label]) => ({ value, label }))} className="mb-8" />

      <div role="tabpanel" aria-label={TABS.find((t) => t[0] === tab)?.[1]}>
        {tab === 'overview' && <Overview agent={a} />}
        {tab === 'config' && <Config key={a.updatedAt + a.version} agent={a} />}
        {tab === 'skills' && <Skills agent={a} />}
        {tab === 'triggers' && <Triggers agent={a} />}
        {tab === 'tools' && <Tools agent={a} />}
        {tab === 'memory' && <Memory agent={a} />}
        {tab === 'versions' && <Versions agent={a} />}
        {tab === 'logs' && (
          <>
            <Section title="Journal en direct">
              <LogStream agentId={a.id} height="h-[420px]" />
            </Section>
            <LinkButton to={`/app/observability?agent=${a.id}`} variant="outline">
              Voir les traces détaillées
            </LinkButton>
          </>
        )}
        {tab === 'integration' && (
          <div className="grid gap-6">
            <CodeBlock snippets={agentSnippets(a.id, projects.data?.find((p) => p.id === a.projectIds[0])?.slug)} />
            <p className="text-[14px] text-muted-foreground">
              Clés API et webhooks : <Link to="/app/integrations?tab=keys" className="underline underline-offset-2">Intégrations › Clés API</Link>. Les adresses dépendent de votre instance auto-hébergée.
            </p>
          </div>
        )}
        {tab === 'site' && <ExternalSite agent={a} />}
      </div>

      <ConfirmDialog
        open={del}
        onOpenChange={setDel}
        title={`Supprimer « ${a.name} » ?`}
        description="L’agent, ses versions, sa mémoire et ses déclencheurs seront supprimés. Les intégrations qui l’appellent renverront une erreur 404."
        confirmText={a.name}
        confirmLabel="Supprimer l’agent"
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </>
  )
}
