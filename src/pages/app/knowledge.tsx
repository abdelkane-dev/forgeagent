import { FileUp, Globe, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useAgents, useKnowledge, useMemories } from '@/api/hooks'
import type { KnowledgeDoc } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { HexLoader } from '@/components/common/hex-loader'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { date, num } from '@/lib/format'

const KIND: Record<KnowledgeDoc['kind'], string> = { pdf: 'PDF', docx: 'Word', website: 'Site web', markdown: 'Markdown' }

function Documents() {
  const docs = useKnowledge()
  const [url, setUrl] = useState('')
  const [del, setDel] = useState<KnowledgeDoc | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const add = useAction((d: Pick<KnowledgeDoc, 'name' | 'kind'> & { content?: string }) => api.knowledge.add(d), { invalidate: [keys.knowledge], success: (d) => `Indexation de ${d.name} lancée`, onSuccess: () => setUrl('') })
  const remove = useAction((id: string) => api.knowledge.remove(id), { invalidate: [keys.knowledge], success: 'Source retirée', onSuccess: () => setDel(null) })

  return (
    <>
      <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto]">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              new URL(url)
              add.mutate({ name: url, kind: 'website' })
            } catch {
              /* native validation shows the error */
            }
          }}
        >
          <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.bonaco.pro" aria-label="Adresse d’un site à indexer" />
          <Button type="submit" disabled={add.isPending}>
            <Globe /> Indexer le site
          </Button>
        </form>
        <input
          ref={file}
          type="file"
          accept=".pdf,.docx,.md,.txt"
          className="sr-only"
          aria-label="Importer un fichier"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const ext = f.name.split('.').pop()?.toLowerCase()
            // Text formats are sent as text; PDF and Word need server-side extraction.
            const content = ext === 'md' || ext === 'txt' ? (await f.text()).slice(0, 200_000) : undefined
            add.mutate({ name: f.name, kind: ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : 'markdown', content })
            e.target.value = ''
          }}
        />
        <Button variant="outline" onClick={() => file.current?.click()}>
          <FileUp /> Importer un fichier
        </Button>
      </div>
      <Async query={docs}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState title="Aucune source" description="Indexez un site ou importez un document : vos agents pourront s’y référer et le citer." />
          ) : (
            <Panel className="divide-y">
              {list.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{d.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Tag>{KIND[d.kind]}</Tag> {d.size} · {num(d.chunks)} extraits
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-2 text-[13.5px]">
                      {d.status === 'indexing' ? <HexLoader /> : <StatusDot tone={d.status === 'indexed' ? 'ok' : 'danger'} />}
                      <span title={d.error ?? undefined}>{d.status === 'indexed' ? 'Indexé' : d.status === 'indexing' ? 'Indexation…' : 'Échec'}</span>
                    </span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${d.name}`} onClick={() => setDel(d)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </Panel>
          )
        }
      </Async>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Retirer cette source ?" description={`${del?.name ?? ''} et ses extraits ne seront plus consultables par les agents.`} confirmLabel="Retirer" pending={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  )
}

function Memories() {
  const mem = useMemories()
  const agents = useAgents()
  const forget = useAction((id: string) => api.memories.remove(id), { invalidate: [['memories']], success: 'Souvenir oublié' })
  const name = (id: string) => agents.data?.find((a) => a.id === id)?.name ?? id
  return (
    <Async query={mem}>
      {(list) =>
        list.length === 0 ? (
          <EmptyState title="Aucun souvenir" description="Les agents avec mémoire à long terme enregistrent ici préférences et faits appris." />
        ) : (
          <>
            {[...new Set(list.map((m) => m.agentId))].map((agentId) => (
              <Section key={agentId} title={name(agentId)}>
                <Panel className="divide-y">
                  {list
                    .filter((m) => m.agentId === agentId)
                    .map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-[14px]">{m.text}</p>
                          <p className="text-[12.5px] text-muted-foreground">{date(m.createdAt)}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => forget.mutate(m.id)}>
                          Oublier
                        </Button>
                      </div>
                    ))}
                </Panel>
              </Section>
            ))}
          </>
        )
      }
    </Async>
  )
}

export default function Knowledge() {
  const [tab, setTab] = useState<'docs' | 'memory'>('docs')
  return (
    <>
      <PageHeader title="Connaissances et mémoire" description="Les documents que vos agents consultent, et ce qu’ils ont retenu." />
      <UnderlineTabs label="Vue" value={tab} onChange={setTab} className="mb-8" items={[{ value: 'docs', label: 'Documents' }, { value: 'memory', label: 'Mémoire' }]} />
      {tab === 'docs' ? <Documents /> : <Memories />}
    </>
  )
}
