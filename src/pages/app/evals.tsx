import { Play, Rocket, Swords } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, useAction, useAgents, useEvals } from '@/api/hooks'
import { Meter } from '@/components/common/charts'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { NativeSelect } from '@/components/common/field'
import { HexLoader } from '@/components/common/hex-loader'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Evals() {
  const evals = useEvals()
  const agents = useAgents()
  const [running, setRunning] = useState<string[]>([])
  const [rollout, setRollout] = useState(10)
  const [agentId, setAgentId] = useState('agt_8f3k2')
  const [deployConfirm, setDeployConfirm] = useState(false)
  const run = useAction((id: string) => api.evals.run(id), {
    invalidate: [keys.evals],
    success: (e) => `${e.name} : ${e.lastScore} %`,
    onSuccess: (e) => setRunning((r) => r.filter((x) => x !== e.id)),
  })
  const start = (id: string) => {
    setRunning((r) => [...r, id])
    run.mutate(id, { onError: () => setRunning((r) => r.filter((x) => x !== id)) })
  }
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id
  const agent = agents.data?.find((a) => a.id === agentId)

  return (
    <>
      <PageHeader
        title="Évaluations"
        description="Suites de tests de non-régression et d’attaque, comparaison de versions et déploiement progressif."
        actions={
          <Button variant="outline" onClick={() => evals.data?.forEach((e) => start(e.id))} disabled={!evals.data || running.length > 0}>
            <Play /> Tout lancer
          </Button>
        }
      />
      <Section title="Suites de tests">
        <Async query={evals}>
          {(list) => (
            <Panel className="divide-y">
              {list.map((e) => {
                const busy = running.includes(e.id)
                return (
                  <div key={e.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_auto] md:items-center md:gap-6">
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-medium">{e.name}</div>
                      <div className="text-[13px] text-muted-foreground">
                        {name(e.agentId)} · {num(e.cases)} cas · {e.lastRunAt ? `lancée ${relative(e.lastRunAt)}` : 'jamais lancée'}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {busy ? (
                        <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
                          <HexLoader /> En cours…
                        </span>
                      ) : e.lastScore === null ? (
                        <span className="text-[14px] text-muted-foreground">—</span>
                      ) : (
                        <>
                          <Meter value={e.lastScore} max={100} tone={e.lastScore >= 95 ? 'cobalt' : 'warn'} className="flex-1" />
                          <span className={cn('w-14 text-right text-[15px] font-semibold tabular', e.lastScore < 95 && 'text-warn')}>{e.lastScore} %</span>
                        </>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => start(e.id)} disabled={busy}>
                      <Play /> Lancer
                    </Button>
                  </div>
                )
              })}
            </Panel>
          )}
        </Async>
      </Section>

      <div className="grid gap-10 xl:grid-cols-2">
        <Section title="Comparaison de versions" className="mb-0">
          <Panel className="p-5">
            <NativeSelect value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent" className="mb-5">
              {agents.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            {agent && agent.version > 1 ? (
              <div className="grid gap-4">
                {[
                  [`v${agent.version - 1}`, 91, false],
                  [`v${agent.version}`, 96, true],
                ].map(([v, score, current]) => (
                  <div key={v as string}>
                    <div className="mb-1.5 flex justify-between text-[14px]">
                      <span className={current ? 'font-semibold' : 'text-muted-foreground'}>{v}</span>
                      <span className="font-semibold tabular">{score} %</span>
                    </div>
                    <Meter value={score as number} max={100} tone={current ? 'cobalt' : undefined} className={current ? '' : '[&>div]:bg-muted-foreground'} />
                  </div>
                ))}
                <p className="text-[13.5px] text-muted-foreground">La v{agent.version} gagne 5 points, surtout sur les cas limites et l’injection de prompt.</p>
              </div>
            ) : (
              <p className="text-[14px] text-muted-foreground">Une seule version : publiez-en une deuxième pour comparer.</p>
            )}
          </Panel>
        </Section>
        <Section title="Déploiement progressif" className="mb-0">
          <Panel className="p-5">
            <div className="mb-1 text-[14px] text-muted-foreground">Part du trafic envoyée à la nouvelle version</div>
            <div className="mb-4 text-[28px] font-semibold tracking-[-0.03em] tabular">{rollout} %</div>
            <Slider min={0} max={100} step={5} value={[rollout]} onValueChange={(v) => setRollout(Array.isArray(v) ? v[0] : v)} aria-label="Part du trafic" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setDeployConfirm(true)}>
                <Rocket /> Déployer
              </Button>
              <Button variant="outline" onClick={() => toast.success('Test d’attaque lancé : 35 scénarios d’injection en cours')}>
                <Swords /> Lancer un test d’attaque
              </Button>
            </div>
          </Panel>
        </Section>
      </div>
      <ConfirmDialog
        open={deployConfirm}
        onOpenChange={setDeployConfirm}
        tone="default"
        title={`Envoyer ${rollout} % du trafic à la nouvelle version ?`}
        description="Le reste du trafic reste sur la version actuelle. Vous pouvez revenir à 0 % à tout moment."
        confirmLabel="Déployer"
        onConfirm={() => {
          setDeployConfirm(false)
          toast.success(`Déploiement lancé à ${rollout} % du trafic`)
        }}
      />
    </>
  )
}
