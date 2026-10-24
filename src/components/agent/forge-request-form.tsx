import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useProjects } from '@/api/hooks'
import type { Autonomy } from '@/api/types'
import { Crest } from '@/components/brand/crest'
import { Sparks } from '@/components/brand/sparks'
import { ChipGroup, Field, NativeSelect } from '@/components/common/field'
import { Panel } from '@/components/common/page'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ACTIONS, AUTONOMY, L, TEAM, TEAM_ORDER } from '@/labels'

/**
 * A request to the internal team. The agent exists at once (state « Démarrage »), the requester
 * owns it, and the team can never grant more than the ceiling set here.
 */
export function ForgeRequestForm() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [brief, setBrief] = useState('')
  const [projectId, setProjectId] = useState('')
  const [maxActions, setMaxActions] = useState<string[]>(['Lire les journaux applicatifs', 'Créer un ticket'])
  const [ceiling, setCeiling] = useState<Autonomy>('act_after_approval')
  const [burst, setBurst] = useState(0)
  const project = projectId || projects.data?.[0]?.id || ''
  const create = useAction(() => api.forge.create({ brief, projectId: project, maxActions, autonomyCeiling: ceiling }), {
    invalidate: [keys.agents, keys.forge, keys.overview],
    success: 'La Forge a pris la demande',
    onSuccess: (r) => {
      setBurst((b) => b + 1)
      setTimeout(() => navigate(`/app/agents/${r.agentId}?tab=overview`), 650)
    },
  })

  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5 md:p-8">
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (brief.trim().length >= 10 && project) create.mutate(undefined)
          }}
        >
          <Field label="Ce que l’agent doit faire" htmlFor="f-brief" hint="Une ou deux phrases : la mission, le périmètre, ce qu’il ne doit jamais faire.">
            <Textarea id="f-brief" rows={5} required minLength={10} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Surveille les erreurs et la latence de Bonaco Pro, ouvre un ticket et alerte l’équipe. Ne redémarre jamais un service sans validation." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Projet" htmlFor="f-project">
              <NativeSelect id="f-project" value={project} onChange={(e) => setProjectId(e.target.value)}>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Autonomie au plus" htmlFor="f-auto">
              <NativeSelect id="f-auto" value={ceiling} onChange={(e) => setCeiling(e.target.value as Autonomy)}>
                {(Object.keys(AUTONOMY) as Autonomy[]).map((a) => (
                  <option key={a} value={a}>
                    {AUTONOMY[a].label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Actions que l’équipe peut accorder, au plus" hint="Plafond strict : une action sensible demandera en plus votre validation de propriétaire.">
            <ChipGroup label="Plafond d’actions" value={maxActions} onChange={setMaxActions} options={ACTIONS.map((a) => ({ value: a, label: a }))} />
          </Field>
          <div className="relative w-fit">
            <Button type="submit" className="glow-molten relative bg-ember text-ember-ink hover:bg-ember/90" disabled={create.isPending || brief.trim().length < 10}>
              {create.isPending ? 'Envoi à La Forge…' : L.action.createAgent}
            </Button>
            {burst > 0 && <Sparks key={burst} count={14} burst className="-top-24 h-32" />}
          </div>
        </form>
      </Panel>
      <div className="grid content-start gap-3">
        <h2 className="text-[15px] font-semibold">Qui travaille sur votre agent</h2>
        {TEAM_ORDER.map((r) => (
          <div key={r} className="flex items-start gap-3">
            <Crest role={r} className="size-9" />
            <div className="min-w-0 text-[13.5px]">
              <div className="font-medium">
                {TEAM[r].name} <span className="text-muted-foreground">· {TEAM[r].role}</span>
              </div>
              <div className="text-muted-foreground">{TEAM[r].mission}</div>
            </div>
          </div>
        ))}
        <p className="mt-2 text-[13px] text-muted-foreground">Chaque tâche ne voit que votre nouvel agent. Les tokens consommés lui sont imputés, et chaque échange est écrit dans son audit.</p>
      </div>
    </div>
  )
}
