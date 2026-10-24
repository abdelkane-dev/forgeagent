import { Check, ChevronRight, Pause, Play, Plus, Radar, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useApprovals, useProjects, useTeamAgents, useTeamQueue, useTeamRequest, useTeamRequests } from '@/api/hooks'
import type { Autonomy, TeamRequest, TeamRequestStatus } from '@/api/types'
import { ColumnChart } from '@/components/common/charts'
import { ChipGroup, Field, NativeSelect } from '@/components/common/field'
import { HexLoader } from '@/components/common/hex-loader'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, EmptyState, RowsSkeleton } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { clock, compact, duration, num, relative, usd } from '@/lib/format'
import { ACTIONS, AUTONOMY } from '@/lib/labels'
import { cn } from '@/lib/utils'

const ROLE_LABEL: Record<string, string> = {
  orchestrator: 'Orchestrateur',
  architect: 'Architecte',
  security: 'Contrôleur sécurité',
  builder: 'Constructeur',
  tester: 'Testeur',
  supervisor: 'Superviseur',
  user: 'Vous',
}

const STATUS: Record<TeamRequestStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' | 'cobalt' }> = {
  running: { label: 'En cours', tone: 'cobalt' },
  awaiting_approval: { label: 'Validation requise', tone: 'warn' },
  done: { label: 'Terminée', tone: 'ok' },
  failed: { label: 'Échec', tone: 'danger' },
  vetoed: { label: 'Veto sécurité', tone: 'danger' },
  stopped: { label: 'Arrêtée (limite)', tone: 'danger' },
}

const EVENT_LABEL: Record<string, string> = {
  'request.created': 'demande créée',
  'task.dispatched': 'tâche assignée',
  'orchestrator.decided': 'décide de l’étape suivante',
  'task.started': 'tâche démarrée',
  'task.completed': 'tâche terminée',
  'task.failed': 'tâche en échec',
  'security.verdict': 'verdict sécurité',
  'agent.created': 'agent créé',
  'approval.requested': 'validation humaine demandée',
  'approval.granted': 'validation accordée',
  'orchestrator.corrected': 'choix de l’orchestrateur corrigé par le code',
  'request.done': 'demande terminée',
  'request.vetoed': 'veto',
  'request.stopped': 'arrêt (limite ou boucle)',
  'request.failed': 'échec',
  'request.awaiting_approval': 'en attente de validation',
}

const briefOf = (r: TeamRequest) => (r.kind === 'supervise' ? 'Ronde du Superviseur' : String(r.input.brief ?? 'Demande'))

function NewRequestDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const projects = useProjects()
  const [brief, setBrief] = useState('')
  const [projectId, setProjectId] = useState('')
  const [maxActions, setMaxActions] = useState<string[]>(['Lire les journaux applicatifs', 'Créer un ticket', 'Envoyer une alerte'])
  const [ceiling, setCeiling] = useState<Autonomy>('act_after_approval')
  const [err, setErr] = useState('')
  const create = useAction(
    () => api.internalTeam.create({ brief, projectId: projectId || projects.data?.[0]?.id || '', maxActions, autonomyCeiling: ceiling }),
    {
      invalidate: [['internalTeam']],
      success: 'Demande transmise à l’Orchestrateur',
      onSuccess: (r) => {
        onOpenChange(false)
        setBrief('')
        onCreated(r.id)
      },
    },
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Demander un agent à l’équipe interne</DialogTitle>
          <DialogDescription>L’Architecte conçoit, le Contrôleur sécurité vérifie, le Constructeur crée, le Testeur teste, le Superviseur surveille. Vous fixez le plafond.</DialogDescription>
        </DialogHeader>
        <form
          id="team-req"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (brief.trim().length < 10) return setErr('Décrivez le besoin en une phrase au moins.')
            setErr('')
            create.mutate(undefined)
          }}
        >
          <Field label="Besoin" htmlFor="tr-brief" error={err}>
            <Textarea id="tr-brief" rows={3} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Un agent de surveillance pour Bonaco Pro : erreurs 5xx, latence, alerte l’équipe." autoFocus />
          </Field>
          <Field label="Projet" htmlFor="tr-prj">
            <NativeSelect id="tr-prj" value={projectId || projects.data?.[0]?.id || ''} onChange={(e) => setProjectId(e.target.value)}>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Plafond : actions que l’équipe peut accorder" hint="Une action sensible déclenchera une validation humaine avant la création.">
            <ChipGroup label="Actions plafond" value={maxActions} onChange={setMaxActions} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <Field label="Autonomie maximale" htmlFor="tr-auto">
            <NativeSelect id="tr-auto" value={ceiling} onChange={(e) => setCeiling(e.target.value as Autonomy)}>
              {(Object.keys(AUTONOMY) as Autonomy[]).map((a) => (
                <option key={a} value={a}>
                  {AUTONOMY[a].label}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="team-req" disabled={create.isPending}>
            {create.isPending ? 'Envoi…' : 'Envoyer à l’équipe'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RequestDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useTeamRequest(id)
  const [replay, setReplay] = useState<number | null>(null)
  const events = q.data?.events ?? []

  useEffect(() => {
    if (replay === null) return
    const t = setTimeout(() => setReplay((r) => (r === null || r >= events.length ? null : r + 1)), 550)
    return () => clearTimeout(t)
  }, [replay, events.length])

  if (q.isPending) return <RowsSkeleton rows={6} />
  if (q.isError) return <EmptyState title="Demande introuvable" description={q.error.message} />
  const { request, tasks } = q.data
  const shown = replay === null ? events : events.slice(0, replay)
  const st = STATUS[request.status]

  return (
    <Panel className="p-5" aria-label="Détail de la demande">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold">{briefOf(request)}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-foreground">
              <StatusDot tone={st.tone} pulse={request.status === 'running'} /> {st.label}
            </span>
            <span className="tabular">
              {request.steps} étapes · {request.agentCalls} appels · {num(request.tokens)} tokens · {usd(request.cost)}
            </span>
          </p>
          {request.error && <p className="mt-2 text-[13.5px] text-danger">{request.error}</p>}
          {typeof request.result?.agentId === 'string' && (
            <LinkButton to={`/app/agents/${request.result.agentId}`} variant="link" className="mt-1 h-auto p-0">
              Ouvrir l’agent créé
            </LinkButton>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={() => setReplay(replay === null ? 0 : null)} disabled={!events.length}>
            {replay === null ? <Play /> : <Pause />} {replay === null ? 'Rejouer' : 'Arrêter'}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <h4 className="mb-2 text-[14px] font-semibold">Qui a fait quoi</h4>
      <ol className="mb-6 grid gap-1.5">
        {tasks
          .filter((t) => t.role !== 'orchestrator')
          .map((t) => (
            <li key={t.id}>
              <details className="group rounded-md bg-secondary/60">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-[14px] [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  {t.status === 'running' ? <HexLoader /> : <StatusDot tone={t.status === 'done' ? 'ok' : t.status === 'queued' ? 'muted' : 'danger'} />}
                  <span className="font-medium">{ROLE_LABEL[t.role]}</span>
                  <span className="truncate text-muted-foreground">{t.status === 'vetoed' ? 'veto' : t.status === 'failed' ? (t.error ?? 'échec') : t.status === 'done' ? 'terminé' : t.status === 'running' ? 'en cours' : 'en file'}</span>
                  <span className="ml-auto shrink-0 text-[12.5px] text-muted-foreground tabular">
                    {t.durationMs ? duration(t.durationMs) : '—'} · {compact(t.tokens)} tok.
                  </span>
                </summary>
                <div className="grid gap-2 px-3 pb-3 text-[12.5px]">
                  <div className="text-muted-foreground">Modèle {t.model ?? '—'}</div>
                  <pre className="scrollbar-thin max-h-56 overflow-auto rounded-md bg-background/70 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap">
                    <code>{JSON.stringify(t.output ?? t.input, null, 2)}</code>
                  </pre>
                </div>
              </details>
            </li>
          ))}
      </ol>

      <h4 className="mb-2 text-[14px] font-semibold">Échanges, dans l’ordre</h4>
      <ol className="scrollbar-thin max-h-80 overflow-y-auto text-[13.5px]" aria-live="polite">
        {shown.map((e, i) => (
          <li key={e.id} className={cn('grid grid-cols-[4.5rem_1fr] gap-3 py-1.5', replay !== null && i === shown.length - 1 && 'text-cobalt')}>
            <span className="text-muted-foreground tabular">{clock(e.at)}</span>
            <span>
              <b className="font-medium">{ROLE_LABEL[e.fromRole] ?? e.fromRole}</b>
              {e.toRole && (
                <>
                  {' '}
                  → <b className="font-medium">{ROLE_LABEL[e.toRole] ?? e.toRole}</b>
                </>
              )}{' '}
              <span className="text-muted-foreground">· {EVENT_LABEL[e.type] ?? e.type}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export default function InternalTeam() {
  const agents = useTeamAgents()
  const requests = useTeamRequests()
  const approvals = useApprovals()
  const queueStats = useTeamQueue()
  const [params, setParams] = useSearchParams()
  const selected = params.get('request')
  const [newOpen, setNewOpen] = useState(false)
  const sweep = useAction(() => api.internalTeam.sweep(), {
    invalidate: [['internalTeam']],
    success: (r) => (r.requestId ? 'Anomalies détectées : le Superviseur les analyse' : 'Ronde terminée : aucune nouvelle anomalie'),
    onSuccess: (r) => r.requestId && setParams({ request: r.requestId }),
  })
  const resolve = useAction(({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.approvals.resolve(id, decision), {
    invalidate: [keys.approvals, ['internalTeam']],
    success: (_, v) => (v.decision === 'approve' ? 'Validé : l’équipe reprend' : 'Refusé : demande arrêtée'),
  })
  const teamApprovals = approvals.data?.filter((a) => a.source === 'team') ?? []

  return (
    <>
      <PageHeader
        title="Équipe interne"
        description="Les agents de ForgeAgent qui conçoivent, sécurisent, construisent, testent et surveillent vos agents. Chaque échange passe par la file de tâches et reste rejouable."
        actions={
          <>
            <Button variant="outline" onClick={() => sweep.mutate(undefined)} disabled={sweep.isPending}>
              <Radar /> Ronde du Superviseur
            </Button>
            <Button onClick={() => setNewOpen(true)}>
              <Plus /> Nouvelle demande
            </Button>
          </>
        }
      />

      {teamApprovals.length > 0 && (
        <Section title="Validations humaines en attente" meta={`${teamApprovals.length}`}>
          <Panel className="divide-y">
            {teamApprovals.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{a.action}</div>
                  <div className="text-[13.5px] text-muted-foreground">Contrôleur sécurité · {a.reason}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => resolve.mutate({ id: a.id, decision: 'approve' })} disabled={resolve.isPending}>
                    <Check /> Valider
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: a.id, decision: 'reject' })} disabled={resolve.isPending}>
                    <X /> Refuser
                  </Button>
                  {a.requestId && (
                    <Button size="sm" variant="ghost" onClick={() => setParams({ request: a.requestId! })}>
                      Voir
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        </Section>
      )}

      <div className="mb-12 grid gap-8 xl:grid-cols-[1.5fr_1fr]">
        <Section title="Agents internes" className="mb-0">
          <Async query={agents} skeleton={<RowsSkeleton rows={6} />}>
            {(list) => (
              <Panel className="divide-y">
                {list.map((a) => (
                  <div key={a.role} className="grid gap-2 px-4 py-3.5 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusDot tone={a.status === 'working' ? 'cobalt' : a.status === 'queued' ? 'warn' : 'muted'} pulse={a.status === 'working'} />
                        <span className="text-[15px] font-semibold">{a.label}</span>
                        <Tag className="font-mono text-[11.5px]">{a.model}</Tag>
                        {a.status === 'working' && <span className="text-[13px] text-cobalt">au travail</span>}
                      </div>
                      <p className="mt-1 text-[13.5px] text-muted-foreground">{a.mission}</p>
                      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                        Périmètre : <code className="text-[12px]">{a.capabilities.join(', ')}</code>
                      </p>
                    </div>
                    <div className="flex gap-5 text-[13px] text-muted-foreground tabular md:block md:text-right">
                      <div>
                        <b className="font-semibold text-foreground">{a.tasksDone}</b> tâches{a.tasksFailed ? ` · ${a.tasksFailed} échecs` : ''}
                      </div>
                      <div>{a.lastActivityAt ? relative(a.lastActivityAt) : 'jamais sollicité'}</div>
                    </div>
                  </div>
                ))}
              </Panel>
            )}
          </Async>
        </Section>
        <div>
          <Section title="Tokens par rôle" meta="depuis le démarrage">
            <Panel className="p-5 pt-10">
              <Async query={agents}>
                {(list) => {
                  const SHORT: Record<string, string> = { orchestrator: 'Orch.', architect: 'Archi.', security: 'Sécu.', builder: 'Constr.', tester: 'Test.', supervisor: 'Superv.' }
                  const data = list.map((a) => ({ label: SHORT[a.role] ?? a.label, value: a.tokens }))
                  const max = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0)
                  return <ColumnChart label="Tokens consommés par rôle" data={data} highlight={max} height={180} />
                }}
              </Async>
              <p className="mt-3 text-[13px] text-muted-foreground tabular">Coût total : {usd(agents.data?.reduce((s, a) => s + a.cost, 0) ?? 0)}</p>
            </Panel>
          </Section>
          <Section title="Files de tâches" className="mb-0">
            <Panel className="divide-y">
              {Object.entries(queueStats.data ?? {})
                .filter(([k]) => k.startsWith('team.'))
                .map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2.5 text-[13.5px]">
                    <code className="text-[12.5px]">{k}</code>
                    <span className="text-muted-foreground tabular">
                      {v.active} en cours · {v.waiting} en attente
                    </span>
                  </div>
                ))}
              {!Object.keys(queueStats.data ?? {}).some((k) => k.startsWith('team.')) && <p className="px-4 py-3 text-[13.5px] text-muted-foreground">Aucune file active.</p>}
            </Panel>
          </Section>
        </div>
      </div>

      <div className={cn('grid gap-8', selected && 'xl:grid-cols-[1fr_1.15fr]')}>
        <Section title="Demandes" meta="les plus récentes d’abord" className="mb-0">
          <Async query={requests}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState title="Aucune demande" description="Demandez un agent à l’équipe : elle le conçoit, le sécurise, le construit et le teste." action={<Button size="sm" onClick={() => setNewOpen(true)}>Nouvelle demande</Button>} />
              ) : (
                <ul className="grid gap-1">
                  {list.map((r) => {
                    const st = STATUS[r.status]
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setParams({ request: r.id })}
                          aria-current={selected === r.id}
                          className={cn('flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-card', selected === r.id && 'bg-card')}
                        >
                          <StatusDot tone={st.tone} pulse={r.status === 'running'} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14.5px] font-medium">{briefOf(r)}</span>
                            <span className="block text-[13px] text-muted-foreground tabular">
                              {st.label} · {r.agentCalls} appels · {compact(r.tokens)} tokens · {relative(r.createdAt)}
                            </span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )
            }
          </Async>
        </Section>
        {selected && <RequestDetail key={selected} id={selected} onClose={() => setParams({})} />}
      </div>

      <NewRequestDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => setParams({ request: id })} />
    </>
  )
}

