import { Play, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, useAction, useAgents, useDelegations, useSchedules, useWorkflows } from '@/api/hooks'
import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/api/types'
import { Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { NODE_KINDS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const NODE_W = 200
const NODE_H = 64
const KIND_MARK: Record<WorkflowNodeKind, string> = {
  trigger: 'bg-muted-foreground',
  model: 'bg-cobalt',
  condition: 'bg-warn',
  approval: 'bg-warn',
  tool: 'bg-foreground',
  subagent: 'bg-cobalt',
  output: 'bg-ok',
}

function Canvas({ wf, setWf, selected, setSelected, running }: { wf: Workflow; setWf: (w: Workflow) => void; selected: string | null; setSelected: (id: string | null) => void; running: number }) {
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const height = Math.max(320, ...wf.nodes.map((n) => n.y + NODE_H + 40))

  const move = (id: string, x: number, y: number) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === id ? { ...n, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } : n)) })

  const onDown = (e: RPointerEvent, n: WorkflowNode) => {
    const rect = area.current!.getBoundingClientRect()
    drag.current = { id: n.id, dx: e.clientX - rect.left + area.current!.scrollLeft - n.x, dy: e.clientY - rect.top + area.current!.scrollTop - n.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelected(n.id)
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return
    const rect = area.current!.getBoundingClientRect()
    move(drag.current.id, e.clientX - rect.left + area.current!.scrollLeft - drag.current.dx, e.clientY - rect.top + area.current!.scrollTop - drag.current.dy)
  }

  return (
    <div ref={area} className="scrollbar-thin relative overflow-auto rounded-lg bg-card" style={{ height: Math.min(height + 8, 520) }} data-ui>
      <div className="relative min-w-[820px]" style={{ height }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {wf.nodes.slice(1).map((n, i) => {
            const a = wf.nodes[i]
            const x1 = a.x + NODE_W
            const y1 = a.y + NODE_H / 2
            const x2 = n.x
            const y2 = n.y + NODE_H / 2
            const mid = (x1 + x2) / 2
            const active = running > i
            return (
              <path
                key={n.id}
                d={x2 > x1 ? `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}` : `M${a.x + NODE_W / 2} ${a.y + NODE_H} C${a.x + NODE_W / 2} ${a.y + NODE_H + 40} ${n.x + NODE_W / 2} ${n.y - 40} ${n.x + NODE_W / 2} ${n.y}`}
                fill="none"
                stroke={active ? 'var(--cobalt)' : 'var(--input)'}
                strokeWidth={2}
                className="transition-[stroke] duration-300"
              />
            )
          })}
        </svg>
        {wf.nodes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            onPointerDown={(e) => onDown(e, n)}
            onKeyDown={(e) => {
              const d = e.shiftKey ? 40 : 8
              const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key]
              if (k) {
                e.preventDefault()
                move(n.id, n.x + k[0], n.y + k[1])
              }
              if (e.key === 'Delete') setWf({ ...wf, nodes: wf.nodes.filter((x) => x.id !== n.id) })
            }}
            onFocus={() => setSelected(n.id)}
            aria-label={`${NODE_KINDS[n.kind]} : ${n.label}. Flèches pour déplacer.`}
            className={cn(
              'absolute flex cursor-grab touch-none flex-col justify-center rounded-md bg-raised px-3 text-left transition-[box-shadow,background-color] active:cursor-grabbing',
              selected === n.id && 'ring-2 ring-foreground',
              running === i && 'bg-cobalt text-cobalt-ink',
            )}
            style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
          >
            <span className={cn('flex items-center gap-1.5 text-[12px]', running === i ? 'text-cobalt-ink/80' : 'text-muted-foreground')}>
              <span className={cn('hex size-2', running === i ? 'bg-cobalt-ink' : KIND_MARK[n.kind])} /> {NODE_KINDS[n.kind]}
            </span>
            <span className="truncate text-[14px] font-medium">{n.label}</span>
          </button>
        ))}
        {wf.nodes.length === 0 && <p className="absolute inset-0 grid place-items-center text-[14px] text-muted-foreground">Ajoutez une première étape avec les boutons ci-dessus.</p>}
      </div>
    </div>
  )
}

export default function Workflows() {
  const workflows = useWorkflows()
  const agents = useAgents()
  const delegations = useDelegations()
  const schedules = useSchedules()
  const [wf, setWf] = useState<Workflow | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [running, setRunning] = useState(-1)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cron, setCron] = useState('')
  const [cronAgent, setCronAgent] = useState('')

  useEffect(() => {
    if (workflows.data && !wf) setWf(workflows.data[0])
  }, [workflows.data, wf])

  const save = useAction((w: Workflow) => api.workflows.save({ ...w, published: true }), { invalidate: [keys.workflows], success: 'Workflow publié' })
  const toggleDel = useAction(({ id, v }: { id: string; v: boolean }) => api.delegations.toggle(id, v), { invalidate: [keys.delegations] })
  const addDel = useAction(() => api.delegations.create(from, to), { invalidate: [keys.delegations], success: 'Délégation ajoutée', onSuccess: () => setTo('') })
  const toggleSch = useAction(({ id, v }: { id: string; v: boolean }) => api.schedules.toggle(id, v), { invalidate: [keys.schedules] })
  const addSch = useAction(() => api.schedules.create(cronAgent, cron, `cron ${cron}`), { invalidate: [keys.schedules], success: 'Planification ajoutée', onSuccess: () => setCron('') })

  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id

  if (!wf) return <LoadingBlock />
  const node = wf.nodes.find((n) => n.id === selected) ?? null

  const addNode = (kind: WorkflowNodeKind) => {
    const last = wf.nodes[wf.nodes.length - 1]
    const n: WorkflowNode = { id: `n${Date.now()}`, kind, label: `Nouvelle étape`, x: last ? (last.x + 260 > 560 ? 24 : last.x + 260) : 24, y: last ? (last.x + 260 > 560 ? last.y + 140 : last.y) : 24, retry: false }
    setWf({ ...wf, nodes: [...wf.nodes, n] })
    setSelected(n.id)
  }

  const runTest = () => {
    if (!wf.nodes.length) return
    let i = 0
    setRunning(0)
    const t = setInterval(() => {
      i += 1
      if (i >= wf.nodes.length) {
        clearInterval(t)
        setRunning(-1)
        toast.success(`Workflow exécuté en test : ${wf.nodes.length} étapes, 4,2 s`)
      } else setRunning(i)
    }, 520)
  }

  return (
    <>
      <PageHeader
        title="Workflows"
        description={`« ${wf.name} » · agent ${name(wf.agentId)} · ${wf.published ? 'publié' : 'brouillon'}`}
        actions={
          <>
            <Button variant="outline" onClick={runTest} disabled={running >= 0}>
              <Play /> Exécuter un test
            </Button>
            <Button onClick={() => save.mutate(wf)} disabled={save.isPending}>
              <Save /> Publier
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2" role="toolbar" aria-label="Ajouter une étape">
        {(Object.keys(NODE_KINDS) as WorkflowNodeKind[]).map((k) => (
          <Button key={k} variant="secondary" size="sm" onClick={() => addNode(k)}>
            <Plus /> {NODE_KINDS[k]}
          </Button>
        ))}
      </div>
      <div className="mb-12 grid gap-6 xl:grid-cols-[1fr_300px]">
        <Canvas wf={wf} setWf={setWf} selected={selected} setSelected={setSelected} running={running} />
        <Panel className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Étape</h2>
          {node ? (
            <div className="grid gap-4">
              <Field label="Nom" htmlFor="n-label">
                <Input id="n-label" value={node.label} onChange={(e) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)) })} />
              </Field>
              <Field label="Type" htmlFor="n-kind">
                <NativeSelect id="n-kind" value={node.kind} onChange={(e) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, kind: e.target.value as WorkflowNodeKind } : n)) })}>
                  {(Object.keys(NODE_KINDS) as WorkflowNodeKind[]).map((k) => (
                    <option key={k} value={k}>
                      {NODE_KINDS[k]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <SwitchRow title="Réessayer en cas d’erreur" description="3 essais, délai exponentiel." checked={node.retry} onChange={(v) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === node.id ? { ...n, retry: v } : n)) })} />
              <Button
                variant="destructive"
                onClick={() => {
                  setWf({ ...wf, nodes: wf.nodes.filter((n) => n.id !== node.id) })
                  setSelected(null)
                }}
              >
                <Trash2 /> Supprimer l’étape
              </Button>
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">Sélectionnez une étape pour la configurer. Glissez les étapes ou utilisez les flèches du clavier (Maj pour aller plus vite).</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-10 xl:grid-cols-2">
        <Section title="Orchestration multi-agents (A2A)" className="mb-0">
          <Panel className="divide-y px-4">
            {delegations.data?.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
                <span>
                  <b className="font-medium">{name(d.fromAgentId)}</b> délègue à <b className="font-medium">{name(d.toAgentId)}</b>
                </span>
                <Switch checked={d.enabled} onCheckedChange={(v) => toggleDel.mutate({ id: d.id, v })} aria-label="Activer la délégation" />
              </div>
            ))}
          </Panel>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (from && to && from !== to) addDel.mutate(undefined)
              else toast.error('Choisissez deux agents différents')
            }}
          >
            <NativeSelect value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Agent qui délègue">
              <option value="">Agent qui délègue…</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={to} onChange={(e) => setTo(e.target.value)} aria-label="Agent qui reçoit">
              <option value="">à…</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" variant="outline">
              <Plus /> Ajouter
            </Button>
          </form>
        </Section>
        <Section title="Déclencheurs planifiés" className="mb-0">
          <Panel className="divide-y px-4">
            {schedules.data?.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
                <span>
                  {s.label} · <b className="font-medium">{name(s.agentId)}</b> <code className="ml-1 text-[12.5px] text-muted-foreground">{s.cron}</code>
                </span>
                <Switch checked={s.enabled} onCheckedChange={(v) => toggleSch.mutate({ id: s.id, v })} aria-label="Activer la planification" />
              </div>
            ))}
          </Panel>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (cronAgent && cron.trim().split(/\s+/).length === 5) addSch.mutate(undefined)
              else toast.error('Choisissez un agent et une expression cron à 5 champs')
            }}
          >
            <NativeSelect value={cronAgent} onChange={(e) => setCronAgent(e.target.value)} aria-label="Agent planifié">
              <option value="">Agent…</option>
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 8 * * 1" className="font-mono text-[13px]" aria-label="Expression cron" />
            <Button type="submit" variant="outline">
              <Plus /> Ajouter
            </Button>
          </form>
        </Section>
      </div>
    </>
  )
}
