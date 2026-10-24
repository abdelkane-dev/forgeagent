import { Play, Plus, Save, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useWorkflowRuns, useWorkflows } from '@/api/hooks'
import type { Workflow, WorkflowNode, WorkflowNodeKind, WorkflowRun } from '@/api/types'
import { WorkflowCanvas } from '@/components/agent/workflow-canvas'
import { Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { duration, relative } from '@/lib/format'
import { NODE_KINDS } from '@/labels'
import type { TabProps } from '.'
import { can } from './shared'
import { RoleNote } from './role-note'

type Draft = Omit<Workflow, 'id' | 'agentId' | 'version' | 'updatedAt'> & { id?: string; version?: number }

const BLANK: Draft = {
  name: 'Nouveau workflow',
  published: false,
  trigger: { kind: 'manual', config: '' },
  nodes: [{ id: 'n1', kind: 'trigger', label: 'Déclenchement manuel', x: 24, y: 24, retry: false }],
}
const RUN_TONE: Record<WorkflowRun['status'], 'ok' | 'danger' | 'warn' | 'ember'> = { ok: 'ok', error: 'danger', waiting_approval: 'warn', running: 'ember' }
const CONFIG_HINT: Partial<Record<WorkflowNodeKind, string>> = {
  model: 'Instruction donnée à l’agent',
  condition: 'Mot-clé : la suite ne s’exécute que si la sortie le contient',
  tool: 'Nom de l’outil (connecteur de cet agent)',
  output: 'Message final, {{output}} = sortie précédente',
}

function Editor({ agentId, initial, editor, onSaved }: { agentId: string; initial: Draft; editor: boolean; onSaved: (w: Workflow) => void }) {
  const [wf, setWf] = useState<Draft>(initial)
  const [selected, setSelected] = useState<string | null>(null)
  const seq = useRef(initial.nodes.length + 1)
  const inv = [keys.of(agentId, 'workflows'), keys.of(agentId, 'audit'), keys.of(agentId, 'docs')]
  const save = useAction((publish: boolean) => api.workflows.save(agentId, { ...wf, published: publish || wf.published }), {
    invalidate: inv,
    success: (w, publish) => (publish ? `Workflow publié (v${w.version})` : 'Workflow enregistré'),
    onSuccess: (w) => (setWf(w), onSaved(w)),
  })
  const run = useAction(() => api.workflows.run(agentId, wf.id!, 'Exécution de test depuis la console', true), { invalidate: inv, success: 'Exécution de test lancée' })
  const node = wf.nodes.find((n) => n.id === selected) ?? null
  const setNode = (p: Partial<WorkflowNode>) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === selected ? { ...n, ...p } : n)) })

  const addNode = (kind: WorkflowNodeKind) => {
    const last = wf.nodes.at(-1)
    const wrap = last ? last.x + 260 > 560 : false
    const n: WorkflowNode = { id: `n${seq.current++}`, kind, label: NODE_KINDS[kind], x: last ? (wrap ? 24 : last.x + 260) : 24, y: last ? (wrap ? last.y + 140 : last.y) : 24, retry: kind === 'model' || kind === 'tool' }
    setWf({ ...wf, nodes: [...wf.nodes, n] })
    setSelected(n.id)
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-[1fr_180px_1fr]">
        <Field label="Nom" htmlFor="wf-name">
          <Input id="wf-name" value={wf.name} disabled={!editor} onChange={(e) => setWf({ ...wf, name: e.target.value })} />
        </Field>
        <Field label="Déclencheur" htmlFor="wf-trig">
          <NativeSelect id="wf-trig" value={wf.trigger.kind} disabled={!editor} onChange={(e) => setWf({ ...wf, trigger: { ...wf.trigger, kind: e.target.value as Draft['trigger']['kind'] } })}>
            <option value="manual">Manuel</option>
            <option value="cron">Planifié (cron)</option>
            <option value="webhook">Webhook entrant</option>
          </NativeSelect>
        </Field>
        <Field label={wf.trigger.kind === 'cron' ? 'Expression cron' : wf.trigger.kind === 'webhook' ? 'Nom du déclencheur' : 'Configuration'} htmlFor="wf-conf">
          <Input id="wf-conf" className="font-mono text-[13px]" value={wf.trigger.config} disabled={!editor || wf.trigger.kind === 'manual'} onChange={(e) => setWf({ ...wf, trigger: { ...wf.trigger, config: e.target.value } })} placeholder={wf.trigger.kind === 'cron' ? '0 8 * * 1' : ''} />
        </Field>
      </div>
      {editor && (
        <div className="flex flex-wrap gap-2">
          {(['model', 'condition', 'approval', 'tool', 'output'] as WorkflowNodeKind[]).map((k) => (
            <Button key={k} variant="outline" size="sm" onClick={() => addNode(k)}>
              <Plus /> {NODE_KINDS[k]}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <WorkflowCanvas wf={wf} setWf={editor ? setWf : () => {}} selected={selected} setSelected={setSelected} running={-1} />
        <Panel className="grid content-start gap-4 p-4">
          {node ? (
            <>
              <div className="flex items-center justify-between">
                <Tag>{NODE_KINDS[node.kind]}</Tag>
                {editor && node.kind !== 'trigger' && (
                  <Button variant="ghost" size="icon-sm" aria-label="Supprimer l’étape" onClick={() => (setWf({ ...wf, nodes: wf.nodes.filter((n) => n.id !== node.id) }), setSelected(null))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <Field label="Libellé" htmlFor="n-label">
                <Input id="n-label" value={node.label} disabled={!editor} onChange={(e) => setNode({ label: e.target.value })} />
              </Field>
              {CONFIG_HINT[node.kind] && (
                <Field label="Paramètre" htmlFor="n-conf" hint={CONFIG_HINT[node.kind]}>
                  <Textarea id="n-conf" rows={3} value={node.config ?? ''} disabled={!editor} onChange={(e) => setNode({ config: e.target.value })} />
                </Field>
              )}
              <SwitchRow title="Reprise automatique (3 essais)" disabled={!editor} checked={node.retry} onChange={(v) => setNode({ retry: v })} />
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">Sélectionnez une étape pour la modifier. Les étapes s’exécutent dans l’ordre, avec les outils et les permissions de cet agent.</p>
          )}
        </Panel>
      </div>
      {editor && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
            <Save /> Enregistrer
          </Button>
          <Button className="glow-molten bg-ember text-ember-ink hover:bg-ember/90" onClick={() => save.mutate(true)} disabled={save.isPending}>
            <Upload /> Publier une version
          </Button>
          <Button variant="outline" onClick={() => run.mutate(undefined)} disabled={!wf.id || run.isPending}>
            <Play /> Exécuter en test
          </Button>
          {wf.id && <span className="self-center text-[13px] text-muted-foreground">v{wf.version} · {wf.published ? 'publié' : 'brouillon'}</span>}
        </div>
      )}
    </div>
  )
}

export default function WorkflowsTab({ agent }: TabProps) {
  const list = useWorkflows(agent.id)
  const runs = useWorkflowRuns(agent.id)
  const [current, setCurrent] = useState<string | 'new' | null>(null)
  const remove = useAction((id: string) => api.workflows.remove(agent.id, id), { invalidate: [keys.of(agent.id, 'workflows')], success: 'Workflow supprimé', onSuccess: () => setCurrent(null) })
  const editor = can(agent, 'editor')
  if (list.isPending) return <LoadingBlock />
  const selected = current === 'new' ? null : (list.data?.find((w) => w.id === current) ?? list.data?.[0] ?? null)
  const initial: Draft | null = current === 'new' ? BLANK : selected

  return (
    <div className="grid gap-12">
      <div className="flex flex-wrap items-center gap-2">
        {list.data?.map((w) => (
          <Button key={w.id} variant={selected?.id === w.id && current !== 'new' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCurrent(w.id)}>
            {w.name} <span className="text-muted-foreground">v{w.version}</span>
            {w.published && <StatusDot tone="ok" />}
          </Button>
        ))}
        {editor && (
          <Button variant="outline" size="sm" onClick={() => setCurrent('new')}>
            <Plus /> Nouveau workflow
          </Button>
        )}
        {editor && selected && current !== 'new' && (
          <Button variant="ghost" size="sm" className="ml-auto text-danger" onClick={() => remove.mutate(selected.id)}>
            <Trash2 /> Supprimer
          </Button>
        )}
      </div>
      <RoleNote agent={agent} min="editor" />
      {initial ? (
        <Editor key={initial.id ?? 'new'} agentId={agent.id} initial={initial} editor={editor} onSaved={(w) => setCurrent(w.id)} />
      ) : (
        <EmptyState title="Aucun workflow" description="Enchaînez des étapes (modèle, condition, validation, outil, sortie) propres à cet agent." />
      )}
      <Section title="Exécutions" meta={runs.data ? `${runs.data.length}` : undefined}>
        {!runs.data?.length ? (
          <p className="text-[14px] text-muted-foreground">Aucune exécution.</p>
        ) : (
          <Panel className="divide-y">
            {runs.data.slice(0, 10).map((r) => (
              <details key={r.id} className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-4 py-3 text-[14px]">
                  <StatusDot tone={RUN_TONE[r.status]} pulse={r.status === 'running'} />
                  <span className="min-w-0 flex-1 truncate">{list.data?.find((w) => w.id === r.workflowId)?.name ?? r.workflowId}</span>
                  <Tag>v{r.version}</Tag>
                  <span className="text-muted-foreground">{r.trigger}</span>
                  <span className="tabular text-muted-foreground">{duration(r.durationMs)}</span>
                  <span className="hidden w-24 text-right text-muted-foreground sm:inline">{relative(r.startedAt)}</span>
                </summary>
                <ol className="grid gap-1 px-4 pb-3 text-[13px]">
                  {r.steps.map((st, i) => (
                    <li key={i} className="flex gap-2">
                      <StatusDot tone={st.status === 'ok' ? 'ok' : st.status === 'waiting' ? 'warn' : st.status === 'skipped' ? 'muted' : 'danger'} className="mt-1.5" />
                      <span className="font-medium">{st.label}</span>
                      <span className="truncate text-muted-foreground">
                        {st.attempts > 1 ? `${st.attempts} essais · ` : ''}
                        {st.output}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </Panel>
        )}
      </Section>
    </div>
  )
}
