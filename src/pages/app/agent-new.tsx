import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useConnectors, useProjects, useSkills, useTemplates } from '@/api/hooks'
import type { AgentDraft, AgentType, Autonomy, ClaudeModel, IntegrationChannel, Role, TriggerKind } from '@/api/types'
import { ChipGroup, Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { HexLoader } from '@/components/common/hex-loader'
import { PageHeader, Panel } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ACTIONS, AGENT_TYPE_ORDER, AGENT_TYPES, AUTONOMY, CAPABILITIES, INTEGRATIONS, MODELS, ROLES, TRIGGERS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const STEPS = ['Identité', 'Type et modèle', 'Déclencheurs et outils', 'Actions et permissions', 'Skills', 'Intégration', 'Vérification'] as const
const DRAFT_KEY = 'fa:agent-draft'

interface Draft extends AgentDraft {
  triggerKinds: TriggerKind[]
  siteUrl: string
}

const empty = (projectId = ''): Draft => ({
  name: '',
  mission: '',
  role: '',
  type: '' as AgentType,
  subcategory: '',
  autonomy: 'suggest_only',
  model: 'claude-sonnet-5-5',
  tone: 'Professionnel',
  language: 'Français',
  persona: '',
  projectIds: projectId ? [projectId] : [],
  triggers: [],
  triggerKinds: ['message'],
  tools: [],
  capabilities: [],
  skillIds: [],
  integrations: ['rest'],
  permissions: { allowedActions: [], roles: ['admin', 'editor'], people: [] },
  guardrails: { promptInjection: true, piiMasking: true, humanApproval: true, forbiddenActions: ['Supprimer des données'], rateLimitPerMin: 60 },
  costCapPerDay: 20,
  memory: { longTerm: false, sharedWithProject: false, retentionDays: 90 },
  siteUrl: '',
})

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...empty(), ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

function StepTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.025em]">{title}</h2>
      {children && <p className="mt-1 text-[14px] text-muted-foreground">{children}</p>}
    </div>
  )
}

export default function AgentNew() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [params] = useSearchParams()
  const projects = useProjects()
  const connectors = useConnectors()
  const skills = useSkills()
  const templates = useTemplates()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [d, setD] = useState<Draft>(() => loadDraft() ?? empty())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [personInput, setPersonInput] = useState('')
  const [forbidInput, setForbidInput] = useState('')
  const [building, setBuilding] = useState<number | null>(null)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))

  // Prefill from a template (?template=tpl_x) or a project (?project=prj_x)
  useEffect(() => {
    const tplId = params.get('template')
    const tpl = templates.data?.find((t) => t.id === tplId)
    if (tpl) {
      setD((x) => ({ ...x, name: tpl.name, mission: tpl.description, type: tpl.type, subcategory: AGENT_TYPES[tpl.type].subcategories[0], capabilities: tpl.capabilities }))
    }
  }, [params, templates.data])

  useEffect(() => {
    const prj = params.get('project') ?? projects.data?.[0]?.id
    if (prj && d.projectIds.length === 0 && !params.get('template')) setD((x) => ({ ...x, projectIds: [prj] }))
    // only on first load of projects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data])

  // Autosave the draft so a refresh never loses work
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      /* storage blocked */
    }
  }, [d])

  const validate = (s: number) => {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (d.name.trim().length < 3) e.name = 'Donnez un nom d’au moins 3 caractères.'
      if (d.mission.trim().length < 10) e.mission = 'Décrivez la mission en une phrase ou plus.'
      if (!d.projectIds.length) e.projects = 'Choisissez au moins un projet géré.'
    }
    if (s === 1 && !d.type) e.type = 'Choisissez un type d’agent.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const go = (to: number) => {
    if (to > step && !validate(step)) return
    setDir(to > step ? 1 : -1)
    setStep(to)
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  const create = useAction(
    async () => {
      const { triggerKinds, siteUrl, ...rest } = d
      const draft: AgentDraft = {
        ...rest,
        triggers: triggerKinds.map((k, i) => ({ id: `trg_new_${i}`, kind: k, label: TRIGGERS[k], config: k === 'cron' ? '0 * * * *' : k === 'webhook' ? '/hooks/new' : '', enabled: true })),
      }
      const agent = await api.agents.create(draft)
      if (siteUrl) await api.agents.pingSite(agent.id, siteUrl).catch(() => null)
      return agent
    },
    {
      invalidate: [keys.agents],
      onSuccess: (agent) => {
        try {
          localStorage.removeItem(DRAFT_KEY)
        } catch {
          /* ignore */
        }
        setTimeout(() => navigate(`/app/agents/${agent.id}?created=1`), reduce ? 200 : 900)
      },
    },
  )

  const startBuild = () => {
    if (![0, 1].every(validate)) return go(d.name ? 1 : 0)
    setBuilding(0)
    const phases = 5
    let i = 0
    const t = setInterval(() => {
      i += 1
      setBuilding(i)
      if (i >= phases) {
        clearInterval(t)
        create.mutate(undefined)
      }
    }, reduce ? 60 : 420)
  }

  const cost = useMemo(() => {
    const m = MODELS[d.model]
    // ~2k input + 500 output tokens per run, 300 runs/day
    return ((2000 * m.inPerM + 500 * m.outPerM) / 1_000_000) * 300
  }, [d.model])

  if (building !== null) {
    const lines = ['Assemblage des instructions', 'Branchement des outils MCP', 'Application des garde-fous', 'Tests de connexion', 'Publication de la v1']
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-[26px] font-bold tracking-[-0.035em]">Création de « {d.name} »</h1>
        <ol className="mt-8 grid gap-3" aria-live="polite">
          {lines.map((l, i) => (
            <li key={l} className={cn('flex items-center gap-3 text-[15px]', i > building && 'text-muted-foreground')}>
              {i < building ? <Check className="size-4 text-ok" /> : i === building ? <HexLoader /> : <span className="hex size-2.5 bg-secondary" />}
              {l}
            </li>
          ))}
        </ol>
        {create.isError && (
          <div className="mt-8 flex gap-2">
            <Button onClick={() => create.mutate(undefined)}>Réessayer</Button>
            <Button variant="outline" onClick={() => setBuilding(null)}>
              Revenir à l’assistant
            </Button>
          </div>
        )}
      </div>
    )
  }

  const toolAccess = (id: string) => d.tools.find((t) => t.connectorId === id)

  const body: ReactNode[] = [
    // 0 — Identité
    <div key="0" className="grid gap-6">
      <StepTitle title="Identité">Le nom, le rôle et la mission guident toutes les décisions de l’agent.</StepTitle>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Nom de l’agent" htmlFor="name" error={errors.name}>
          <Input id="name" value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Gardien technique" autoFocus aria-invalid={!!errors.name} />
        </Field>
        <Field label="Rôle" htmlFor="role" hint="Le poste qu’il occupe dans l’équipe.">
          <Input id="role" value={d.role} onChange={(e) => set({ role: e.target.value })} placeholder="Ingénieur de garde" />
        </Field>
      </div>
      <Field label="Mission" htmlFor="mission" error={errors.mission} hint="Ce qu’il doit faire, et ce qu’il ne doit jamais faire.">
        <Textarea id="mission" rows={4} value={d.mission} onChange={(e) => set({ mission: e.target.value })} placeholder="Surveille les erreurs de Bonaco Pro et alerte l’équipe. Ne redémarre jamais un service sans validation." aria-invalid={!!errors.mission} />
      </Field>
      <Field label="Projets gérés" error={errors.projects}>
        <ChipGroup label="Projets gérés" value={d.projectIds} onChange={(v) => set({ projectIds: v })} options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      </Field>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Ton" htmlFor="tone">
          <NativeSelect id="tone" value={d.tone} onChange={(e) => set({ tone: e.target.value })}>
            {['Professionnel', 'Direct', 'Pédagogue', 'Chaleureux'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Langue" htmlFor="lang">
          <NativeSelect id="lang" value={d.language} onChange={(e) => set({ language: e.target.value })}>
            {['Français', 'English', 'Multilingue'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Personnalité et règles de style" htmlFor="persona" hint="Facultatif. Format des réponses, limites, vocabulaire.">
        <Textarea id="persona" rows={3} value={d.persona} onChange={(e) => set({ persona: e.target.value })} placeholder="Factuel, cite toujours la ligne de journal en cause." />
      </Field>
    </div>,

    // 1 — Type et modèle
    <div key="1" className="grid gap-8">
      <StepTitle title="Type et modèle">Les agents ne sont pas que conversationnels : choisissez la famille qui décrit le mieux son travail.</StepTitle>
      <div>
        <div role="radiogroup" aria-label="Type d’agent" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {AGENT_TYPE_ORDER.map((t) => {
            const on = d.type === t
            return (
              <button
                key={t}
                role="radio"
                aria-checked={on}
                type="button"
                onClick={() => set({ type: t, subcategory: AGENT_TYPES[t].subcategories[0] })}
                className={cn('flex items-start gap-3 rounded-lg p-4 text-left transition-colors', on ? 'bg-foreground text-background' : 'bg-secondary/60 hover:bg-secondary')}
              >
                <span className={cn('hex mt-1 size-3 shrink-0', on ? 'bg-cobalt' : 'bg-muted-foreground/40')} />
                <span>
                  <span className="block text-[15px] font-semibold">{AGENT_TYPES[t].label}</span>
                  <span className={cn('block text-[13px]', on ? 'text-background/70' : 'text-muted-foreground')}>{AGENT_TYPES[t].hint}</span>
                </span>
              </button>
            )
          })}
        </div>
        {errors.type && <p className="mt-2 text-[13px] text-danger">{errors.type}</p>}
      </div>
      {d.type && (
        <Field label={`Sous-catégorie · ${AGENT_TYPES[d.type].label}`}>
          <div className="flex flex-wrap gap-2">
            {AGENT_TYPES[d.type].subcategories.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={d.subcategory === s}
                onClick={() => set({ subcategory: s })}
                className={cn('h-8 rounded-md px-3 text-[13.5px] font-medium transition-colors', d.subcategory === s ? 'bg-foreground text-background' : 'bg-secondary hover:bg-input')}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Cerveau : modèle Claude" hint={`Coût estimé : ~${cost.toFixed(2)} $ / jour pour 300 exécutions.`}>
        <div role="radiogroup" aria-label="Modèle" className="grid gap-2 md:grid-cols-3">
          {(Object.keys(MODELS) as ClaudeModel[]).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={d.model === m}
              type="button"
              onClick={() => set({ model: m })}
              className={cn('rounded-lg p-4 text-left transition-colors', d.model === m ? 'bg-foreground text-background' : 'bg-secondary/60 hover:bg-secondary')}
            >
              <span className="block text-[15px] font-semibold">{MODELS[m].label}</span>
              <span className={cn('block text-[13px]', d.model === m ? 'text-background/70' : 'text-muted-foreground')}>
                {MODELS[m].hint} · {MODELS[m].inPerM} $ / {MODELS[m].outPerM} $ par M tokens
              </span>
            </button>
          ))}
        </div>
      </Field>
    </div>,

    // 2 — Déclencheurs et outils
    <div key="2" className="grid gap-8">
      <StepTitle title="Déclencheurs et outils">Quand l’agent se réveille, et avec quels outils il travaille.</StepTitle>
      <Field label="Déclencheurs">
        <ChipGroup label="Déclencheurs" value={d.triggerKinds} onChange={(v) => set({ triggerKinds: v })} options={(Object.keys(TRIGGERS) as TriggerKind[]).map((k) => ({ value: k, label: TRIGGERS[k] }))} />
      </Field>
      <Field label="Capacités">
        <ChipGroup label="Capacités" value={d.capabilities} onChange={(v) => set({ capabilities: v })} options={CAPABILITIES.map((c) => ({ value: c, label: c }))} />
      </Field>
      <Field label="Connecteurs MCP" hint="Accordez à chaque outil la lecture seule, ou la lecture et l’écriture.">
        <Panel className="divide-y">
          {(connectors.data ?? []).map((c) => {
            const grant = toolAccess(c.id)
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{c.name}</div>
                  <div className="text-[13px] text-muted-foreground">{c.description}{!c.enabled && ' · désactivé sur l’instance'}</div>
                </div>
                <NativeSelect
                  aria-label={`Accès à ${c.name}`}
                  className="w-44"
                  value={grant?.access ?? 'none'}
                  onChange={(e) => {
                    const v = e.target.value
                    const others = d.tools.filter((t) => t.connectorId !== c.id)
                    set({ tools: v === 'none' ? others : [...others, { connectorId: c.id, access: v as 'read' | 'read_write', enabled: true }] })
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
      </Field>
      <div className="grid gap-x-8 md:grid-cols-2">
        <SwitchRow title="Mémoire à long terme" description="Retient préférences et faits entre les exécutions." checked={d.memory.longTerm} onChange={(v) => set({ memory: { ...d.memory, longTerm: v } })} />
        <SwitchRow title="Partager la mémoire avec le projet" description="Les autres agents du projet y ont accès." checked={d.memory.sharedWithProject} onChange={(v) => set({ memory: { ...d.memory, sharedWithProject: v } })} />
      </div>
    </div>,

    // 3 — Actions et permissions
    <div key="3" className="grid gap-8">
      <StepTitle title="Actions et permissions">Ce que l’agent a le droit de faire, jusqu’où il peut aller seul, et qui le pilote.</StepTitle>
      <Field label="Actions autorisées">
        <ChipGroup label="Actions autorisées" value={d.permissions.allowedActions} onChange={(v) => set({ permissions: { ...d.permissions, allowedActions: v } })} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
      </Field>
      <Field label="Actions interdites" hint="L’agent refusera ces actions même si on le lui demande.">
        <div className="flex flex-wrap gap-2">
          {d.guardrails.forbiddenActions.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => set({ guardrails: { ...d.guardrails, forbiddenActions: d.guardrails.forbiddenActions.filter((x) => x !== f) } })}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-danger/12 px-3 text-[13.5px] font-medium text-danger"
              aria-label={`Retirer ${f}`}
            >
              {f} <X className="size-3.5" />
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!forbidInput.trim()) return
            set({ guardrails: { ...d.guardrails, forbiddenActions: [...d.guardrails.forbiddenActions, forbidInput.trim()] } })
            setForbidInput('')
          }}
        >
          <Input value={forbidInput} onChange={(e) => setForbidInput(e.target.value)} placeholder="Modifier les paiements" aria-label="Nouvelle action interdite" />
          <Button type="submit" variant="outline">
            <Plus /> Ajouter
          </Button>
        </form>
      </Field>
      <Field label="Niveau d’autonomie">
        <div role="radiogroup" aria-label="Niveau d’autonomie" className="grid gap-2 md:grid-cols-3">
          {(Object.keys(AUTONOMY) as Autonomy[]).map((a) => (
            <button
              key={a}
              role="radio"
              aria-checked={d.autonomy === a}
              type="button"
              onClick={() => set({ autonomy: a })}
              className={cn('rounded-lg p-4 text-left transition-colors', d.autonomy === a ? 'bg-foreground text-background' : 'bg-secondary/60 hover:bg-secondary')}
            >
              <span className="block text-[15px] font-semibold">{AUTONOMY[a].label}</span>
              <span className={cn('block text-[13px]', d.autonomy === a ? 'text-background/70' : 'text-muted-foreground')}>{AUTONOMY[a].hint}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={`Plafond de coût : ${d.costCapPerDay} $ par jour`} hint="L’agent se met en pause en atteignant le plafond.">
        <Slider min={1} max={200} value={[d.costCapPerDay]} onValueChange={(v) => set({ costCapPerDay: Array.isArray(v) ? v[0] : v })} aria-label="Plafond de coût par jour" className="max-w-md py-2" />
      </Field>
      <div>
        <div className="mb-1 text-[14px] font-medium">Garde-fous</div>
        <div className="grid gap-x-8 md:grid-cols-2">
          <SwitchRow title="Protection contre l’injection de prompt" checked={d.guardrails.promptInjection} onChange={(v) => set({ guardrails: { ...d.guardrails, promptInjection: v } })} />
          <SwitchRow title="Masquage des données personnelles" checked={d.guardrails.piiMasking} onChange={(v) => set({ guardrails: { ...d.guardrails, piiMasking: v } })} />
          <SwitchRow title="Validation humaine des actions sensibles" checked={d.guardrails.humanApproval} onChange={(v) => set({ guardrails: { ...d.guardrails, humanApproval: v } })} />
        </div>
      </div>
      <Field label="Rôles qui peuvent utiliser et modifier l’agent">
        <ChipGroup label="Rôles" value={d.permissions.roles} onChange={(v) => set({ permissions: { ...d.permissions, roles: v as Role[] } })} options={(Object.keys(ROLES) as Role[]).map((r) => ({ value: r, label: ROLES[r] }))} />
      </Field>
      <Field label="Personnes autorisées" hint="Accès nominatif en plus des rôles.">
        {d.permissions.people.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {d.permissions.people.map((p) => (
              <button key={p} type="button" onClick={() => set({ permissions: { ...d.permissions, people: d.permissions.people.filter((x) => x !== p) } })} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-3 text-[13.5px]" aria-label={`Retirer ${p}`}>
                {p} <X className="size-3.5" />
              </button>
            ))}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!/^\S+@\S+\.\S+$/.test(personInput)) return setErrors({ people: 'Adresse email invalide.' })
            setErrors({})
            set({ permissions: { ...d.permissions, people: [...d.permissions.people, personInput] } })
            setPersonInput('')
          }}
        >
          <Input type="email" value={personInput} onChange={(e) => setPersonInput(e.target.value)} placeholder="ines@bonaco.pro" aria-label="Email d’une personne autorisée" aria-invalid={!!errors.people} />
          <Button type="submit" variant="outline">
            <Plus /> Ajouter
          </Button>
        </form>
        {errors.people && <p className="text-[13px] text-danger">{errors.people}</p>}
      </Field>
    </div>,

    // 4 — Skills
    <div key="4">
      <StepTitle title="Skills">Des compétences prêtes à l’emploi, ajoutables et retirables à tout moment.</StepTitle>
      <div className="grid gap-2 md:grid-cols-2">
        {(skills.data ?? []).map((s) => {
          const on = d.skillIds.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => set({ skillIds: on ? d.skillIds.filter((x) => x !== s.id) : [...d.skillIds, s.id] })}
              className={cn('flex items-start justify-between gap-4 rounded-lg p-4 text-left transition-colors', on ? 'bg-foreground text-background' : 'bg-secondary/60 hover:bg-secondary')}
            >
              <span>
                <span className="block text-[15px] font-semibold">{s.name}</span>
                <span className={cn('mt-0.5 block text-[13px]', on ? 'text-background/70' : 'text-muted-foreground')}>{s.description}</span>
              </span>
              {on ? <Check className="mt-0.5 size-4 shrink-0" /> : <Plus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            </button>
          )
        })}
      </div>
    </div>,

    // 5 — Intégration
    <div key="5" className="grid gap-8">
      <StepTitle title="Intégration">Où l’agent sera utilisé. Le code d’intégration est généré à la création.</StepTitle>
      <Field label="Canaux">
        <ChipGroup label="Canaux d’intégration" value={d.integrations} onChange={(v) => set({ integrations: v })} options={(Object.keys(INTEGRATIONS) as IntegrationChannel[]).map((k) => ({ value: k, label: INTEGRATIONS[k].label }))} />
      </Field>
      <Field label="Site ou application déjà en ligne" htmlFor="site" hint="Facultatif. Nous vérifierons la connexion juste après la création.">
        <Input id="site" type="url" value={d.siteUrl} onChange={(e) => set({ siteUrl: e.target.value })} placeholder="https://app.bonaco.pro" />
      </Field>
    </div>,

    // 6 — Vérification
    <div key="6" className="grid gap-6">
      <StepTitle title="Vérification">Relisez la configuration avant de créer l’agent. Tout reste modifiable ensuite.</StepTitle>
      <Panel className="divide-y">
        {[
          ['Nom', d.name || '—', 0],
          ['Rôle', d.role || '—', 0],
          ['Projets', d.projectIds.map((id) => projects.data?.find((p) => p.id === id)?.name).join(', ') || '—', 0],
          ['Type', d.type ? `${AGENT_TYPES[d.type].label} · ${d.subcategory}` : '—', 1],
          ['Modèle', MODELS[d.model].label, 1],
          ['Déclencheurs', d.triggerKinds.map((k) => TRIGGERS[k]).join(', ') || '—', 2],
          ['Outils', `${d.tools.length} connecteur(s)`, 2],
          ['Actions autorisées', `${d.permissions.allowedActions.length} · interdites : ${d.guardrails.forbiddenActions.length}`, 3],
          ['Autonomie', `${AUTONOMY[d.autonomy].label} · plafond ${d.costCapPerDay} $/jour`, 3],
          ['Skills', d.skillIds.map((id) => skills.data?.find((s) => s.id === id)?.name).join(', ') || 'Aucune', 4],
          ['Intégration', d.integrations.map((k) => INTEGRATIONS[k].label).join(', ') + (d.siteUrl ? ` · ${d.siteUrl}` : ''), 5],
        ].map(([k, v, s]) => (
          <div key={k as string} className="flex items-center gap-4 px-4 py-3 text-[14px]">
            <span className="w-40 shrink-0 text-muted-foreground">{k}</span>
            <span className="min-w-0 flex-1 break-words">{v}</span>
            <Button variant="ghost" size="sm" onClick={() => go(s as number)}>
              Modifier
            </Button>
          </div>
        ))}
      </Panel>
    </div>,
  ]

  return (
    <>
      <PageHeader
        title="Créer un agent"
        description="Sept étapes, brouillon enregistré automatiquement."
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              setD(empty(projects.data?.[0]?.id))
              setStep(0)
              setErrors({})
            }}
          >
            Recommencer
          </Button>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Étapes">
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-secondary lg:hidden">
            <div className="h-full bg-cobalt transition-[width] duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="text-[14px] font-medium lg:hidden">
            {STEPS[step]} <span className="text-muted-foreground">· {step + 1} sur {STEPS.length}</span>
          </p>
          <ol className="hidden gap-0.5 lg:grid">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => (i < step ? go(i) : i === step + 1 ? go(i) : undefined)}
                  aria-current={i === step ? 'step' : undefined}
                  disabled={i > step + 1}
                  className={cn(
                    'flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[14px] transition-colors disabled:cursor-not-allowed',
                    i === step ? 'bg-secondary font-medium' : i < step ? 'text-foreground hover:bg-secondary/60' : 'text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="size-4 text-ok" /> : <span className={cn('hex size-2.5', i === step ? 'bg-cobalt' : 'bg-muted-foreground/40')} />}
                  {s}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          <Panel className="overflow-hidden p-5 md:p-8">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -24 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {body[step]}
              </motion.div>
            </AnimatePresence>
          </Panel>
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft /> Précédent
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => go(step + 1)}>
                Suivant <ArrowRight />
              </Button>
            ) : (
              <Button onClick={startBuild} disabled={create.isPending}>
                <Check /> Créer l’agent
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
