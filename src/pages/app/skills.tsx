import { Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useSkills } from '@/api/hooks'
import type { Skill } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Field, NativeSelect } from '@/components/common/field'
import { PageHeader } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const CATEGORIES: Record<Skill['category'], string> = {
  reporting: 'Rapports',
  alerting: 'Alertes',
  analysis: 'Analyse',
  content: 'Contenu',
  documents: 'Documents',
  search: 'Recherche',
  security: 'Sécurité',
}

export default function Skills() {
  const skills = useSkills()
  const agents = useAgents()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [cat, setCat] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category: 'analysis' as Skill['category'] })
  const [attachSkill, setAttachSkill] = useState<Skill | null>(null)
  const [attachTo, setAttachTo] = useState('')
  const [del, setDel] = useState<Skill | null>(null)

  const create = useAction(() => api.skills.create(form), { invalidate: [keys.skills], success: (s) => `Skill « ${s.name} » créée`, onSuccess: () => { setCreateOpen(false); setForm({ name: '', description: '', category: 'analysis' }) } })
  const attach = useAction(
    async ({ skill, agentId }: { skill: Skill; agentId: string }) => {
      const a = agents.data!.find((x) => x.id === agentId)!
      return api.agents.update(agentId, { skillIds: [...new Set([...a.skillIds, skill.id])] }, `Skill « ${skill.name} » ajoutée`)
    },
    { invalidate: [keys.agents, keys.skills], success: (a, v) => `${v.skill.name} ajoutée à ${a.name}`, onSuccess: () => setAttachSkill(null) },
  )
  const remove = useAction((id: string) => api.skills.remove(id), { invalidate: [keys.skills, keys.agents], success: 'Skill supprimée', onSuccess: () => setDel(null) })

  const list = useMemo(() => {
    const n = q.toLowerCase()
    return (skills.data ?? []).filter((s) => (!cat || s.category === cat) && (!n || `${s.name} ${s.description}`.toLowerCase().includes(n)))
  }, [skills.data, q, cat])

  const candidates = attachSkill ? (agents.data ?? []).filter((a) => !a.skillIds.includes(attachSkill.id)) : []

  return (
    <>
      <PageHeader
        title="Skills"
        description="Bibliothèque de compétences réutilisables. Une skill s’ajoute à un agent sans toucher à sa configuration."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Créer une skill
          </Button>
        }
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} placeholder="Rechercher une skill" className="pl-9" aria-label="Rechercher une skill" />
        </div>
        <NativeSelect value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Catégorie" className="sm:w-52">
          <option value="">Toutes les catégories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Async query={skills}>
        {() =>
          list.length === 0 ? (
            <EmptyState title="Aucune skill trouvée" description="Changez la recherche ou créez la skill qui vous manque." action={<Button size="sm" onClick={() => setCreateOpen(true)}>Créer une skill</Button>} />
          ) : (
            <ul className="grid gap-px overflow-hidden rounded-lg bg-border md:grid-cols-2">
              {list.map((s) => (
                <li key={s.id} className="flex flex-col justify-between gap-4 bg-card p-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-semibold">{s.name}</h2>
                      <Tag>{CATEGORIES[s.category]}</Tag>
                    </div>
                    <p className="mt-1.5 text-[14px] text-muted-foreground">{s.description}</p>
                    <p className="mt-3 text-[13px] text-muted-foreground">
                      v{s.version} · {s.author}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAttachSkill(s)
                        setAttachTo('')
                      }}
                    >
                      <Plus /> Ajouter à un agent
                    </Button>
                    {!s.builtin && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${s.name}`} onClick={() => setDel(s)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une skill</DialogTitle>
            <DialogDescription>Décrivez ce que la skill fait : ForgeAgent génère ses instructions et ses outils, à relire ensuite.</DialogDescription>
          </DialogHeader>
          <form
            id="skill-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (form.name.trim().length >= 2) create.mutate(undefined)
            }}
          >
            <Field label="Nom" htmlFor="sk-name">
              <Input id="sk-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tri des tickets" autoFocus />
            </Field>
            <Field label="Description" htmlFor="sk-desc">
              <Textarea id="sk-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Classe les tickets entrants par urgence et équipe." />
            </Field>
            <Field label="Catégorie" htmlFor="sk-cat">
              <NativeSelect id="sk-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Skill['category'] })}>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="skill-form" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attachSkill} onOpenChange={(o) => !o && setAttachSkill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter « {attachSkill?.name} » à un agent</DialogTitle>
            <DialogDescription>Une nouvelle version de l’agent est publiée, l’ancienne reste restaurable.</DialogDescription>
          </DialogHeader>
          {candidates.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">Tous vos agents utilisent déjà cette skill.</p>
          ) : (
            <NativeSelect value={attachTo} onChange={(e) => setAttachTo(e.target.value)} aria-label="Agent">
              <option value="">Choisir un agent…</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachSkill(null)}>
              Annuler
            </Button>
            <Button disabled={!attachTo || attach.isPending} onClick={() => attachSkill && attach.mutate({ skill: attachSkill, agentId: attachTo })}>
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Supprimer « ${del?.name ?? ''} » ?`} description="La skill sera retirée de tous les agents qui l’utilisent." confirmLabel="Supprimer la skill" pending={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  )
}
