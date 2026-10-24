import { ArrowRight, Upload } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAgents, useTemplates } from '@/api/hooks'
import type { AgentType } from '@/api/types'
import { NativeSelect } from '@/components/common/field'
import { PageHeader } from '@/components/common/page'
import { Async, CardsSkeleton } from '@/components/common/states'
import { Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AGENT_TYPE_ORDER, AGENT_TYPES } from '@/lib/labels'

export default function Templates() {
  const templates = useTemplates()
  const agents = useAgents()
  const navigate = useNavigate()
  const [type, setType] = useState<AgentType | ''>('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishId, setPublishId] = useState('')

  const use = (id: string) => {
    try {
      localStorage.removeItem('fa:agent-draft')
    } catch {
      /* ignore */
    }
    navigate(`/app/agents/new?template=${id}`)
  }

  return (
    <>
      <PageHeader
        title="Modèles d’agents"
        description="Partez d’une configuration éprouvée, puis adaptez-la à votre projet."
        actions={
          <Button variant="outline" onClick={() => setPublishOpen(true)}>
            <Upload /> Publier un de mes agents
          </Button>
        }
      />
      <NativeSelect value={type} onChange={(e) => setType(e.target.value as AgentType | '')} aria-label="Type" className="mb-6 sm:w-60">
        <option value="">Tous les types</option>
        {AGENT_TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {AGENT_TYPES[t].label}
          </option>
        ))}
      </NativeSelect>
      <Async query={templates} skeleton={<CardsSkeleton />}>
        {(list) => (
          <ul className="grid gap-px overflow-hidden rounded-lg bg-border md:grid-cols-2">
            {list
              .filter((t) => !type || t.type === type)
              .map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => use(t.id)} className="group flex h-full w-full flex-col justify-between gap-5 bg-card p-5 text-left transition-colors hover:bg-raised">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[16px] font-semibold">{t.name}</h2>
                        <Tag>{AGENT_TYPES[t.type].label}</Tag>
                      </div>
                      <p className="mt-1.5 text-[14px] text-muted-foreground">{t.description}</p>
                      <p className="mt-3 text-[13px] text-muted-foreground">{t.capabilities.join(' · ')}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold">
                      Utiliser ce modèle <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Async>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publier un agent comme modèle</DialogTitle>
            <DialogDescription>Les secrets, la mémoire et les données du projet ne sont jamais inclus. Le modèle passe en relecture avant d’être visible.</DialogDescription>
          </DialogHeader>
          <NativeSelect value={publishId} onChange={(e) => setPublishId(e.target.value)} aria-label="Agent à publier">
            <option value="">Choisir un agent…</option>
            {agents.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!publishId}
              onClick={() => {
                setPublishOpen(false)
                toast.success('Modèle soumis à relecture')
              }}
            >
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
