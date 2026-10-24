import { Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useEvalCases, useEvalRuns, useEvalSuites } from '@/api/hooks'
import type { EvalRun } from '@/api/types'
import { TestConsole } from '@/components/agent/test-console'
import { SwitchRow, Field } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TabProps } from '.'
import { can } from './shared'
import { RoleNote } from './role-note'

const KIND: Record<EvalRun['kind'], string> = { manual: 'Manuel', regression: 'Régression', team: 'La Forge' }

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
        <span className={cn('block h-full rounded-full', score >= 80 ? 'bg-ok' : score >= 50 ? 'bg-warn' : 'bg-danger')} style={{ width: `${score}%` }} />
      </span>
      <span className="tabular">{score} %</span>
    </span>
  )
}

function SuiteCases({ agentId, suiteId, editor }: { agentId: string; suiteId: string; editor: boolean }) {
  const cases = useEvalCases(agentId, suiteId)
  const [input, setInput] = useState('')
  const [expect, setExpect] = useState('')
  const add = useAction(() => api.evals.addCase(agentId, suiteId, input, expect), {
    invalidate: [keys.of(agentId, 'evals')],
    success: 'Cas ajouté',
    onSuccess: () => (setInput(''), setExpect('')),
  })
  return (
    <div className="grid gap-3 px-4 pb-4">
      {cases.data?.map((c) => (
        <div key={c.id} className="rounded-md bg-secondary/50 px-3 py-2 text-[13.5px]">
          {c.input}
          <div className="text-[12.5px] text-muted-foreground">Attendu : {c.expect || 'une réponse sans erreur'}</div>
        </div>
      ))}
      {editor && (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_200px_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) add.mutate(undefined)
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Entrée du cas" aria-label="Entrée du cas" />
          <Input value={expect} onChange={(e) => setExpect(e.target.value)} placeholder="Mots attendus, séparés par ," aria-label="Mots attendus" />
          <Button type="submit" variant="outline" disabled={add.isPending}>
            <Plus /> Cas
          </Button>
        </form>
      )}
    </div>
  )
}

function Evaluations({ agent }: TabProps) {
  const suites = useEvalSuites(agent.id)
  const runs = useEvalRuns(agent.id)
  const [open, setOpen] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [regression, setRegression] = useState(true)
  const [last, setLast] = useState<EvalRun | null>(null)
  const inv = [keys.of(agent.id, 'evals'), keys.of(agent.id, 'audit'), keys.of(agent.id, 'docs')]
  const run = useAction((suiteId: string) => api.evals.run(agent.id, suiteId), { invalidate: inv, success: (r) => `Score : ${r.score} % (${r.passed}/${r.total})`, onSuccess: (r) => setLast(r) })
  const create = useAction(() => api.evals.createSuite(agent.id, { name, regression, cases: [] }), { invalidate: inv, success: 'Suite créée', onSuccess: (s) => (setName(''), setOpen(s.id)) })
  const remove = useAction((id: string) => api.evals.removeSuite(agent.id, id), { invalidate: inv, success: 'Suite supprimée' })
  const editor = can(agent, 'editor')

  return (
    <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
      <Section title="Suites d’évaluation" meta={suites.data ? `${suites.data.length}` : undefined} description="Les suites de régression sont rejouées avant chaque nouvelle version : une baisse de score bloque la publication." className="mb-0">
        {suites.isPending ? (
          <LoadingBlock />
        ) : !suites.data?.length ? (
          <EmptyState title="Aucune suite" description="Créez une suite et ajoutez des cas pour mesurer cet agent." />
        ) : (
          <Panel className="divide-y">
            {suites.data.map((s) => (
              <div key={s.id}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      {s.name} {s.regression && <Tag>Régression</Tag>}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {s.cases} cas · {s.lastRunAt ? `dernier passage ${relative(s.lastRunAt)}` : 'jamais lancée'}
                    </div>
                  </button>
                  {s.lastScore != null && <ScoreBar score={s.lastScore} />}
                  <Button size="sm" variant="outline" onClick={() => run.mutate(s.id)} disabled={run.isPending || !s.cases}>
                    <Play /> Lancer
                  </Button>
                  {editor && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${s.name}`} onClick={() => remove.mutate(s.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
                {open === s.id && <SuiteCases agentId={agent.id} suiteId={s.id} editor={editor} />}
              </div>
            ))}
          </Panel>
        )}
        {editor ? (
          <form
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) create.mutate(undefined)
            }}
          >
            <Field label="Nouvelle suite" htmlFor="ev-name">
              <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Questions fréquentes" />
            </Field>
            <Button type="submit" variant="outline" className="self-end" disabled={create.isPending}>
              <Plus /> Créer
            </Button>
            <SwitchRow className="sm:col-span-2" title="Rejouer avant chaque version" checked={regression} onChange={setRegression} />
          </form>
        ) : (
          <div className="mt-4">
            <RoleNote agent={agent} min="editor" />
          </div>
        )}
      </Section>
      <div className="grid content-start gap-8">
        {last && (
          <Section title="Dernier passage" meta={`${last.score} %`} className="mb-0">
            <Panel className="divide-y">
              {last.results.map((r) => (
                <div key={r.caseId} className="flex items-start gap-3 px-4 py-3 text-[13.5px]">
                  <StatusDot tone={r.passed ? 'ok' : 'danger'} className="mt-1.5" />
                  <div className="min-w-0">
                    <div className="font-medium">{r.input}</div>
                    <div className="line-clamp-2 text-muted-foreground">{r.output}</div>
                  </div>
                </div>
              ))}
            </Panel>
          </Section>
        )}
        <Section title="Historique des scores" className="mb-0">
          {!runs.data?.length ? (
            <p className="text-[14px] text-muted-foreground">Aucun passage pour l’instant.</p>
          ) : (
            <Panel className="divide-y">
              {runs.data.slice(0, 12).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                  <span className="min-w-0 flex-1 truncate">{suites.data?.find((s) => s.id === r.suiteId)?.name ?? r.suiteId}</span>
                  <Tag>v{r.version}</Tag>
                  <Tag>{KIND[r.kind]}</Tag>
                  <ScoreBar score={r.score} />
                  <span className="hidden w-24 text-right text-muted-foreground sm:inline">{relative(r.at)}</span>
                </div>
              ))}
            </Panel>
          )}
        </Section>
      </div>
    </div>
  )
}

export default function TestsTab(props: TabProps) {
  return (
    <div className="grid gap-14">
      <TestConsole agent={props.agent} />
      <Evaluations {...props} />
    </div>
  )
}
