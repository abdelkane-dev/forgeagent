import { ArrowUpRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useProjects } from '@/api/hooks'
import type { Environment } from '@/api/types'
import { ENV_LABEL } from '@/labels'
import { Field } from '@/components/common/field'
import { PageHeader } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'


export default function Projects() {
  const projects = useProjects()
  const agents = useAgents()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [err, setErr] = useState('')
  const create = useAction(() => api.projects.create({ name: name.trim(), description: desc.trim() }), {
    invalidate: [keys.projects],
    success: (p) => `Projet « ${p.name} » créé`,
    onSuccess: (p) => {
      setOpen(false)
      setName('')
      setDesc('')
      navigate(`/app/projects/${p.id}`)
    },
  })

  return (
    <>
      <PageHeader
        title="Projets"
        description="Chaque projet regroupe les agents d’une application, ses environnements et ses domaines autorisés."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Nouveau projet
          </Button>
        }
      />
      <Async query={projects}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="Aucun projet" description="Créez un projet pour rattacher vos agents à une application, par exemple Bonaco Pro." action={<Button onClick={() => setOpen(true)}>Créer un projet</Button>} />
          ) : (
            <ul className="grid gap-3">
              {list.map((p) => {
                const count = agents.data?.filter((a) => a.projectIds.includes(p.id)).length ?? 0
                return (
                  <li key={p.id}>
                    <Link to={`/app/projects/${p.id}`} className="group grid gap-4 rounded-lg bg-card p-5 transition-colors hover:bg-raised md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[17px] font-semibold">
                          {p.name} <Tag>{count} agent{count > 1 ? 's' : ''}</Tag>
                        </div>
                        <p className="mt-1 text-[14px] text-muted-foreground">{p.description || 'Sans description'}</p>
                        {p.stack.length > 0 && <p className="mt-2 text-[13px] text-muted-foreground">{p.stack.join(' · ')}</p>}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
                        {(Object.keys(ENV_LABEL) as Environment[]).map((e) => (
                          <span key={e} className="flex items-center gap-1.5">
                            <StatusDot tone={p.environments[e].deployed ? 'ok' : 'muted'} />
                            <span className={p.environments[e].deployed ? '' : 'text-muted-foreground'}>{ENV_LABEL[e]}</span>
                          </span>
                        ))}
                      </div>
                      <ArrowUpRight className="hidden size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 md:block" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )
        }
      </Async>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
            <DialogDescription>Une application ou un site que vos agents vont servir.</DialogDescription>
          </DialogHeader>
          <form
            id="new-project"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim().length < 2) return setErr('Le nom doit faire au moins 2 caractères.')
              setErr('')
              create.mutate(undefined)
            }}
          >
            <Field label="Nom" htmlFor="p-name" error={err}>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bonaco Pro" autoFocus aria-invalid={!!err} />
            </Field>
            <Field label="Description" htmlFor="p-desc">
              <Textarea id="p-desc" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Application métier : surveillance, anti-abus, administration." />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="new-project" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer le projet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
