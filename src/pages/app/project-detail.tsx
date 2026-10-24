import { ArrowLeft, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useProject } from '@/api/hooks'
import type { Environment, Project } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Field, NativeSelect } from '@/components/common/field'
import { LinkButton } from '@/components/common/link-button'
import { Panel, Section } from '@/components/common/page'
import { ErrorState, LoadingBlock } from '@/components/common/states'
import { AgentStatus } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { date, num, usd } from '@/lib/format'
import { ENV_LABEL } from '@/labels'

function Settings({ project }: { project: Project }) {
  const [p, setP] = useState(project)
  const [domain, setDomain] = useState('')
  const save = useAction((patch: Partial<Project>) => api.projects.update(project.id, patch), { invalidate: [keys.project(project.id), keys.projects], success: 'Projet enregistré' })
  const dirty = JSON.stringify(p) !== JSON.stringify(project)
  return (
    <>
      <Section title="Environnements" meta="adresse du site par environnement">
        <Panel className="divide-y">
          {(Object.keys(ENV_LABEL) as Environment[]).map((e) => (
            <div key={e} className="grid gap-3 px-4 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-center">
              <label htmlFor={`env-${e}`} className="text-[14px] font-medium">
                {ENV_LABEL[e]}
              </label>
              <Input id={`env-${e}`} type="url" placeholder="https://…" value={p.environments[e].url} onChange={(ev) => setP({ ...p, environments: { ...p.environments, [e]: { ...p.environments[e], url: ev.target.value } } })} />
              <label className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
                <Switch checked={p.environments[e].deployed} onCheckedChange={(v) => setP({ ...p, environments: { ...p.environments, [e]: { ...p.environments[e], deployed: v } } })} />
                Déployé
              </label>
            </div>
          ))}
        </Panel>
      </Section>
      <Section title="Domaines autorisés" meta="origines acceptées par le widget et le SDK">
        <Panel className="p-4">
          <div className="flex flex-wrap gap-2">
            {p.allowedDomains.map((d) => (
              <button key={d} type="button" onClick={() => setP({ ...p, allowedDomains: p.allowedDomains.filter((x) => x !== d) })} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-secondary px-3 font-mono text-[13px]" aria-label={`Retirer ${d}`}>
                {d} <X className="size-3.5" />
              </button>
            ))}
            {p.allowedDomains.length === 0 && <span className="text-[14px] text-muted-foreground">Aucun domaine : le widget refusera toutes les origines.</span>}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
              if (!d || p.allowedDomains.includes(d)) return
              setP({ ...p, allowedDomains: [...p.allowedDomains, d] })
              setDomain('')
            }}
          >
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="bonaco.pro" aria-label="Nouveau domaine" />
            <Button type="submit" variant="outline">
              <Plus /> Ajouter
            </Button>
          </form>
        </Panel>
      </Section>
      <Section title="Description">
        <div className="grid gap-4">
          <Field label="Nom" htmlFor="pd-name">
            <Input id="pd-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </Field>
          <Field label="Description" htmlFor="pd-desc">
            <Textarea id="pd-desc" rows={3} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
          </Field>
          <Field label="Stack technique" htmlFor="pd-stack" hint="Séparée par des virgules.">
            <Input id="pd-stack" value={p.stack.join(', ')} onChange={(e) => setP({ ...p, stack: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          </Field>
        </div>
      </Section>
      <div className="flex gap-2">
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate({ name: p.name, description: p.description, stack: p.stack, environments: p.environments, allowedDomains: p.allowedDomains })}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setP(project)}>
            Annuler
          </Button>
        )}
      </div>
    </>
  )
}

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const project = useProject(id)
  const agents = useAgents()
  const [del, setDel] = useState(false)
  const [attach, setAttach] = useState('')

  const link = useAction(({ agentId, on }: { agentId: string; on: boolean }) => {
    const a = agents.data!.find((x) => x.id === agentId)!
    return api.agents.update(agentId, { projectIds: on ? [...new Set([...a.projectIds, id])] : a.projectIds.filter((x) => x !== id) })
  }, { invalidate: [keys.agents], success: (a, v) => (v.on ? `${a.name} rattaché` : `${a.name} détaché`) })
  const remove = useAction(() => api.projects.remove(id), { invalidate: [keys.projects, keys.agents], success: 'Projet supprimé', onSuccess: () => navigate('/app/projects') })

  if (project.isPending) return <LoadingBlock />
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />
  const p = project.data
  const attached = agents.data?.filter((a) => a.projectIds.includes(id)) ?? []
  const others = agents.data?.filter((a) => !a.projectIds.includes(id)) ?? []
  const cost = attached.reduce((s, a) => s + a.metrics.costToday, 0)
  const runs = attached.reduce((s, a) => s + a.metrics.runs24h, 0)

  return (
    <>
      <LinkButton to="/app/projects" variant="ghost" size="sm" className="-ml-2.5 mb-4 text-muted-foreground">
        <ArrowLeft /> Projets
      </LinkButton>
      <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.035em]">{p.name}</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Créé le {date(p.createdAt)} · {attached.length} agent(s) · {num(runs)} exécutions et {usd(cost)} aujourd’hui
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton to={`/app/agents/new?project=${p.id}`}>
            <Plus /> Agent dans ce projet
          </LinkButton>
          <LinkButton to="/app/integrations?tab=app" variant="outline">
            Intégrer
          </LinkButton>
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[1fr_1.1fr]">
        <div>
          <Section title="Agents rattachés" meta={`${attached.length}`}>
            <Panel className="divide-y">
              {attached.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link to={`/app/agents/${a.id}`} className="text-[14px] font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="mt-0.5">
                      <AgentStatus status={a.status} />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => link.mutate({ agentId: a.id, on: false })}>
                    Détacher
                  </Button>
                </div>
              ))}
              {attached.length === 0 && <p className="px-4 py-4 text-[14px] text-muted-foreground">Aucun agent. Rattachez-en un ci-dessous ou créez-en un.</p>}
            </Panel>
            {others.length > 0 && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (attach) link.mutate({ agentId: attach, on: true }, { onSuccess: () => setAttach('') })
                }}
              >
                <NativeSelect value={attach} onChange={(e) => setAttach(e.target.value)} aria-label="Agent à rattacher" className="flex-1">
                  <option value="">Choisir un agent à rattacher…</option>
                  {others.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="submit" variant="outline" disabled={!attach}>
                  Rattacher
                </Button>
              </form>
            )}
          </Section>
          <Section title="Zone sensible">
            <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="text-[14px] font-medium">Supprimer le projet</div>
                <div className="text-[13px] text-muted-foreground">Les agents sont conservés mais détachés.</div>
              </div>
              <Button variant="destructive" onClick={() => setDel(true)}>
                Supprimer
              </Button>
            </Panel>
          </Section>
        </div>
        <div>
          <Settings key={JSON.stringify(p)} project={p} />
        </div>
      </div>

      <ConfirmDialog open={del} onOpenChange={setDel} title={`Supprimer « ${p.name} » ?`} description="Environnements et domaines seront perdus. Les agents restent disponibles, sans projet." confirmText={p.name} confirmLabel="Supprimer le projet" pending={remove.isPending} onConfirm={() => remove.mutate(undefined)} />
    </>
  )
}
