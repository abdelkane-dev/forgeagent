import { FileUp, Plus, Search, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useKnowledge, useMemories } from '@/api/hooks'
import type { KnowledgeDoc, KnowledgeHit } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Field, NativeSelect, SwitchRow } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { date, relative } from '@/lib/format'
import type { TabProps } from '.'
import { can, fileToBase64, RoleNote, useUpdate } from './shared'

const KIND: Record<KnowledgeDoc['kind'], string> = { pdf: 'PDF', docx: 'Word', website: 'Site web', markdown: 'Markdown', text: 'Texte' }

function Sources({ agent }: TabProps) {
  const docs = useKnowledge(agent.id)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<KnowledgeDoc['kind']>('markdown')
  const [content, setContent] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const inv = [keys.of(agent.id, 'knowledge'), keys.of(agent.id, 'audit'), keys.of(agent.id, 'docs')]
  const add = useAction((input: Parameters<typeof api.knowledge.add>[1]) => api.knowledge.add(agent.id, input), {
    invalidate: inv,
    success: 'Source ajoutée : indexation en cours',
    onSuccess: () => {
      setName('')
      setContent('')
    },
  })
  const remove = useAction((id: string) => api.knowledge.remove(agent.id, id), { invalidate: inv, success: 'Source retirée avec ses vecteurs' })

  const upload = async (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    add.mutate({ name: f.name, kind: ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : ext === 'md' ? 'markdown' : 'text', file: await fileToBase64(f) })
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <Section title="Sources de l’agent" meta={docs.data ? `${docs.data.length}` : undefined} className="mb-0">
        {docs.isPending ? (
          <LoadingBlock />
        ) : !docs.data?.length ? (
          <EmptyState title="Aucune source" description="Ajoutez un texte, un fichier ou un site : il ne servira qu’à cet agent." />
        ) : (
          <Panel className="divide-y">
            {docs.data.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <StatusDot tone={d.status === 'indexed' ? 'ok' : d.status === 'failed' ? 'danger' : 'warn'} pulse={d.status === 'indexing'} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{d.name}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {KIND[d.kind]} · {d.size} · {d.status === 'indexing' ? 'indexation…' : d.status === 'failed' ? (d.error ?? 'échec') : `${d.chunks} extrait(s)`} · {date(d.createdAt)}
                  </div>
                </div>
                {d.hasFile && <Tag>Fichier</Tag>}
                {can(agent, 'editor') && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${d.name}`} onClick={() => remove.mutate(d.id)}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </Panel>
        )}
      </Section>
      <div className="grid content-start gap-4">
        <RoleNote agent={agent} min="editor" />
        {can(agent, 'editor') && (
          <Panel className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Ajouter une source</h3>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                add.mutate({ name: name || (kind === 'website' ? content : 'note.md'), kind, content })
              }}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <Field label="Nom" htmlFor="k-name">
                  <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guide administrateur" />
                </Field>
                <Field label="Type" htmlFor="k-kind">
                  <NativeSelect id="k-kind" value={kind} onChange={(e) => setKind(e.target.value as KnowledgeDoc['kind'])}>
                    <option value="markdown">Markdown</option>
                    <option value="text">Texte</option>
                    <option value="website">Site web</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label={kind === 'website' ? 'Adresse du site' : 'Contenu'} htmlFor="k-content">
                {kind === 'website' ? (
                  <Input id="k-content" type="url" required value={content} onChange={(e) => setContent(e.target.value)} placeholder="https://docs.bonaco.pro" />
                ) : (
                  <Textarea id="k-content" rows={5} required value={content} onChange={(e) => setContent(e.target.value)} placeholder="Collez le texte à indexer" />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={add.isPending}>
                  <Plus /> Indexer
                </Button>
                <Button type="button" variant="outline" onClick={() => file.current?.click()} disabled={add.isPending}>
                  <FileUp /> Téléverser un fichier
                </Button>
                <input ref={file} type="file" accept=".pdf,.docx,.md,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </div>
              <p className="text-[12.5px] text-muted-foreground">Les fichiers sont rangés sous le dossier de cet agent, 5 Mo au plus.</p>
            </form>
          </Panel>
        )}
        <SearchBox agentId={agent.id} />
      </div>
    </div>
  )
}

function SearchBox({ agentId }: { agentId: string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const search = useAction((query: string) => api.knowledge.search(agentId, query), { onSuccess: (r) => setHits(r) })
  return (
    <Panel className="p-5">
      <h3 className="mb-1 text-[15px] font-semibold">Recherche sémantique</h3>
      <p className="mb-4 text-[13px] text-muted-foreground">Ce que l’agent retrouvera dans ses propres sources, et seulement les siennes.</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) search.mutate(q)
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Comment ajouter un rôle ?" aria-label="Question" />
        <Button type="submit" variant="outline" disabled={search.isPending}>
          <Search /> Chercher
        </Button>
      </form>
      {hits && (
        <ul className="mt-4 grid gap-3">
          {hits.length === 0 && <li className="text-[14px] text-muted-foreground">Aucun extrait pertinent.</li>}
          {hits.map((h, i) => (
            <li key={i} className="rounded-md bg-secondary/50 px-3 py-2 text-[13.5px]">
              <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                <span className="truncate">{h.docName}</span>
                <span className="tabular">{Math.round(h.score * 100)} %</span>
              </div>
              {h.chunk}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function Memory({ agent }: TabProps) {
  const mem = useMemories(agent.id)
  const update = useUpdate(agent)
  const [confirm, setConfirm] = useState(false)
  const [text, setText] = useState('')
  const inv = [keys.of(agent.id, 'memories'), keys.of(agent.id, 'audit')]
  const add = useAction((t: string) => api.memories.add(agent.id, t), { invalidate: inv, success: 'Souvenir ajouté', onSuccess: () => setText('') })
  const forget = useAction((id: string) => api.memories.remove(agent.id, id), { invalidate: inv, success: 'Souvenir oublié' })
  const clear = useAction(() => api.memories.clear(agent.id), { invalidate: inv, success: 'Mémoire effacée', onSuccess: () => setConfirm(false) })
  const editor = can(agent, 'editor')
  return (
    <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
      <Section
        title="Mémoire"
        meta={mem.data ? `${mem.data.length}` : undefined}
        className="mb-0"
        action={
          editor ? (
            <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirm(true)} disabled={!mem.data?.length}>
              Tout effacer
            </Button>
          ) : undefined
        }
      >
        {mem.isPending ? (
          <LoadingBlock />
        ) : !mem.data?.length ? (
          <EmptyState title="Aucun souvenir" description="L’agent n’a encore rien mémorisé." />
        ) : (
          <Panel className="divide-y">
            {mem.data.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14px]">{m.text}</p>
                  <p className="text-[12.5px] text-muted-foreground">
                    {m.kind === 'long' ? 'Long terme' : `Court terme${m.sessionId ? ` · session ${m.sessionId}` : ''}`} · {relative(m.createdAt)}
                  </p>
                </div>
                {editor && (
                  <Button variant="outline" size="sm" onClick={() => forget.mutate(m.id)}>
                    Oublier
                  </Button>
                )}
              </div>
            ))}
          </Panel>
        )}
      </Section>
      <div className="grid content-start gap-4">
        {editor && (
          <Panel className="p-5">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (text.trim()) add.mutate(text)
              }}
            >
              <Field label="Ajouter un souvenir long terme" htmlFor="m-text">
                <Input id="m-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Les alertes partent sur #incidents" />
              </Field>
              <Button type="submit" variant="outline" disabled={add.isPending}>
                <Plus /> Mémoriser
              </Button>
            </form>
          </Panel>
        )}
        <Panel className="divide-y px-4">
          <SwitchRow title="Mémoire à long terme" disabled={!editor} checked={agent.memory.longTerm} onChange={(v) => update.mutate({ patch: { memory: { ...agent.memory, longTerm: v } } })} />
          <div className="flex items-center justify-between gap-3 py-3">
            <label htmlFor="m-turns" className="text-[14px] font-medium">
              Mémoire courte (échanges gardés)
            </label>
            <NativeSelect id="m-turns" className="w-28" disabled={!editor} value={agent.memory.shortTermTurns} onChange={(e) => update.mutate({ patch: { memory: { ...agent.memory, shortTermTurns: Number(e.target.value) } } })}>
              {[0, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <label htmlFor="m-ret" className="text-[14px] font-medium">
              Conservation
            </label>
            <NativeSelect id="m-ret" className="w-36" disabled={!editor} value={agent.memory.retentionDays} onChange={(e) => update.mutate({ patch: { memory: { ...agent.memory, retentionDays: Number(e.target.value) } } })}>
              {[30, 90, 365].map((d) => (
                <option key={d} value={d}>
                  {d === 365 ? '1 an' : `${d} jours`}
                </option>
              ))}
            </NativeSelect>
          </div>
        </Panel>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Effacer toute la mémoire ?" description={`${agent.name} oubliera tous ses souvenirs. Les conversations passées restent dans les traces.`} confirmLabel="Effacer la mémoire" pending={clear.isPending} onConfirm={() => clear.mutate(undefined)} />
    </div>
  )
}

export default function KnowledgeTab(props: TabProps) {
  return (
    <div className="grid gap-14">
      <Sources {...props} />
      <Memory {...props} />
    </div>
  )
}
