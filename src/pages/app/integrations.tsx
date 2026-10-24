import { KeyRound, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useAgents, useApiKeys, useConnectors, useProjects, useWebhooks } from '@/api/hooks'
import type { ApiKey } from '@/api/types'
import { CodeBlock } from '@/components/common/code-block'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { CopyButton } from '@/components/common/copy-button'
import { ChipGroup, Field, NativeSelect } from '@/components/common/field'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { UnderlineTabs } from '@/components/common/underline-tabs'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { relative } from '@/lib/format'
import { agentSnippets, API_HOST } from '@/lib/snippets'

const TABS = [
  ['snippets', 'Code d’intégration'],
  ['site', 'Site existant'],
  ['app', 'Application en cours'],
  ['mcp', 'Connecteurs MCP'],
  ['keys', 'Clés API'],
  ['webhooks', 'Webhooks'],
] as const
type Tab = (typeof TABS)[number][0]

function AgentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const agents = useAgents()
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label="Agent" className="sm:w-72">
      {agents.data?.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </NativeSelect>
  )
}

function useAgentChoice() {
  const agents = useAgents()
  const [id, setId] = useState('')
  return [id || agents.data?.[0]?.id || 'agt_8f3k2', setId] as const
}

function Snippets() {
  const [agentId, setAgentId] = useAgentChoice()
  return (
    <div className="grid gap-5">
      <AgentPicker value={agentId} onChange={setAgentId} />
      <CodeBlock snippets={agentSnippets(agentId)} />
      <p className="text-[14px] text-muted-foreground">Exemples générés pour votre instance auto-hébergée. Remplacez l’hôte par l’adresse de votre back-end ForgeAgent.</p>
    </div>
  )
}

function ExistingSite() {
  const [agentId, setAgentId] = useAgentChoice()
  const [url, setUrl] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const verify = useAction((u: string) => api.agents.pingSite(agentId, u), {
    invalidate: [keys.agent(agentId)],
    onSuccess: (s) => setResult(s.status === 'connected' ? `Installation détectée sur ${s.url} · ${s.latencyMs} ms` : `Aucune réponse de ${s.url}. Le script est-il bien en place ?`),
  })
  const snippet = agentSnippets(agentId)[0]
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_1.1fr]">
      <ol className="grid content-start gap-6">
        <li>
          <h3 className="text-[15px] font-semibold">Choisir l’agent</h3>
          <div className="mt-2">
            <AgentPicker value={agentId} onChange={setAgentId} />
          </div>
        </li>
        <li>
          <h3 className="text-[15px] font-semibold">Coller le script avant la fin de la page</h3>
          <p className="mt-1 text-[14px] text-muted-foreground">Fonctionne sur tout site déjà en ligne : HTML, WordPress, Webflow, Shopify ou application monopage.</p>
        </li>
        <li>
          <h3 className="text-[15px] font-semibold">Vérifier l’installation</h3>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setResult(null)
              if (url) verify.mutate(url)
            }}
          >
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://monsite.com" aria-label="Adresse du site" required />
            <Button type="submit" disabled={verify.isPending}>
              <Wifi /> {verify.isPending ? 'Vérification…' : 'Vérifier'}
            </Button>
          </form>
          {result && (
            <p className="mt-3 flex items-center gap-2 text-[14px]" role="status">
              <StatusDot tone={result.startsWith('Installation') ? 'ok' : 'danger'} /> {result}
            </p>
          )}
        </li>
      </ol>
      <CodeBlock snippets={[snippet]} />
    </div>
  )
}

function InProgressApp() {
  const projects = useProjects()
  const [agentId, setAgentId] = useAgentChoice()
  const [fw, setFw] = useState<string[]>(['React'])
  const [env, setEnv] = useState('test')
  const [projectId, setProjectId] = useState('')
  const [generated, setGenerated] = useState(false)
  const pid = projectId || projects.data?.[0]?.id || ''
  const slug = projects.data?.find((p) => p.id === pid)?.slug ?? 'bonaco-pro'
  const code = `// ${fw.join(' · ')} · projet ${slug} · environnement ${env}
// À appeler depuis votre back-end : la clé ne doit jamais partir dans le navigateur.
// Clé de test (fa_test_…) en test et préproduction : exécution en bac à sable imposée.
const FORGE_URL = process.env.FORGE_URL ?? "${API_HOST}"

export async function runAgent(input: string) {
  const res = await fetch(\`\${FORGE_URL}/v1/agents/${agentId}/run\`, {
    method: "POST",
    headers: { Authorization: \`Bearer \${process.env.FORGE_API_KEY}\`, "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) throw new Error((await res.json()).message)
  return res.json() as Promise<{ content: string; status: string; meta: { cost: number } }>
}

// Exemple : déléguer une tâche à l’agent depuis votre code
export const checkErrors = () => runAgent("Vérifie les erreurs des 10 dernières minutes")`
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr]">
      <div className="grid content-start gap-5">
        <Field label="Framework">
          <ChipGroup label="Framework" value={fw} onChange={setFw} options={['React', 'Vue', 'Next.js', 'Svelte', 'Mobile', 'Node'].map((x) => ({ value: x, label: x }))} />
        </Field>
        <Field label="Projet" htmlFor="ia-prj">
          <NativeSelect id="ia-prj" value={pid} onChange={(e) => setProjectId(e.target.value)}>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Environnement" htmlFor="ia-env">
          <NativeSelect id="ia-env" value={env} onChange={(e) => setEnv(e.target.value)}>
            <option value="test">Test</option>
            <option value="staging">Préproduction</option>
            <option value="production">Production</option>
          </NativeSelect>
        </Field>
        <Field label="Agent">
          <AgentPicker value={agentId} onChange={setAgentId} />
        </Field>
        <Button className="w-fit" onClick={() => setGenerated(true)}>
          Générer le code
        </Button>
      </div>
      {generated ? <CodeBlock snippets={[{ id: 'sdk', label: 'forge.ts', code }]} /> : <EmptyState title="Code d’intégration" description="Choisissez le framework, le projet et l’environnement, puis générez le code à coller dans votre application." />}
    </div>
  )
}

function Connectors() {
  const connectors = useConnectors()
  const toggle = useAction(({ id, enabled }: { id: string; enabled: boolean }) => api.connectors.toggle(id, enabled), { invalidate: [keys.connectors], success: (c) => `${c.name} ${c.enabled ? 'activé' : 'désactivé'}` })
  return (
    <Async query={connectors}>
      {(list) => (
        <Panel className="divide-y">
          {list.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[14px] font-medium">
                  <StatusDot tone={c.enabled ? 'ok' : 'muted'} /> {c.name}
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {c.description} · <code className="text-[12.5px]">{c.endpoint}</code>
                </div>
              </div>
              <Switch checked={c.enabled} onCheckedChange={(v) => toggle.mutate({ id: c.id, enabled: v })} aria-label={`Activer ${c.name}`} />
            </div>
          ))}
        </Panel>
      )}
    </Async>
  )
}

function Keys() {
  const list = useApiKeys()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [env, setEnv] = useState<ApiKey['environment']>('test')
  const [scope, setScope] = useState<'secret' | 'publishable'>('secret')
  const [keyProject, setKeyProject] = useState('')
  const projects = useProjects()
  const [secret, setSecret] = useState<string | null>(null)
  const [revoke, setRevoke] = useState<ApiKey | null>(null)
  const create = useAction(
    () => api.apiKeys.create(name || 'Nouvelle clé', env, { scope, projectId: keyProject || projects.data?.[0]?.id || null }),
    { invalidate: [keys.apiKeys], onSuccess: (r) => setSecret(r.secret) },
  )
  const rotate = useAction((id: string) => api.apiKeys.rotate(id), { invalidate: [keys.apiKeys], onSuccess: (r) => setSecret(r.secret) })
  const del = useAction((id: string) => api.apiKeys.revoke(id), { invalidate: [keys.apiKeys], success: 'Clé révoquée', onSuccess: () => setRevoke(null) })

  return (
    <>
      <Section
        title="Clés API"
        meta="les secrets ne sont affichés qu’une fois"
        action={
          <Button
            onClick={() => {
              setSecret(null)
              setName('')
              setCreateOpen(true)
            }}
          >
            <Plus /> Créer une clé
          </Button>
        }
      >
        <Async query={list}>
          {(ks) =>
            ks.length === 0 ? (
              <EmptyState title="Aucune clé" description="Créez une clé pour appeler vos agents depuis un back-end." />
            ) : (
              <Panel className="divide-y">
                {ks.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <KeyRound className="size-4 text-muted-foreground" />
                      <div>
                        <div className="text-[14px] font-medium">
                          {k.name} <Tag className="ml-1">{k.scope === 'publishable' ? 'Widget (publiable)' : k.environment === 'live' ? 'Production' : 'Test'}</Tag>
                        </div>
                        <div className="text-[13px] text-muted-foreground">
                          <code>{k.prefix}••••••••</code> · créée {relative(k.createdAt)} · utilisée {relative(k.lastUsedAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => rotate.mutate(k.id)} disabled={rotate.isPending}>
                        <RefreshCw /> Régénérer
                      </Button>
                      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoke(k)}>
                        Révoquer
                      </Button>
                    </div>
                  </div>
                ))}
              </Panel>
            )
          }
        </Async>
      </Section>

      <Dialog open={createOpen || !!secret} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setSecret(null) } }}>
        <DialogContent>
          {secret ? (
            <>
              <DialogHeader>
                <DialogTitle>Copiez votre clé maintenant</DialogTitle>
                <DialogDescription>Pour votre sécurité, elle ne sera plus jamais affichée. Stockez-la dans une variable d’environnement.</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-md bg-secondary p-2 pl-3">
                <code className="min-w-0 flex-1 truncate text-[13px]">{secret}</code>
                <CopyButton text={secret} />
              </div>
              <DialogFooter>
                <Button onClick={() => { setSecret(null); setCreateOpen(false) }}>J’ai copié la clé</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Créer une clé API</DialogTitle>
                <DialogDescription>Une clé par service, pour pouvoir la révoquer sans tout casser.</DialogDescription>
              </DialogHeader>
              <Field label="Nom" htmlFor="k-name">
                <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Worker de facturation" autoFocus />
              </Field>
              <Field label="Type" htmlFor="k-scope" hint={scope === 'publishable' ? 'Pour le widget : visible dans la page, limitée au projet et à ses domaines autorisés.' : 'Pour votre back-end (Bearer). Ne la mettez jamais dans une page web.'}>
                <NativeSelect id="k-scope" value={scope} onChange={(e) => setScope(e.target.value as 'secret' | 'publishable')}>
                  <option value="secret">Secrète (serveur à serveur)</option>
                  <option value="publishable">Publiable (widget)</option>
                </NativeSelect>
              </Field>
              <Field label="Projet" htmlFor="k-prj">
                <NativeSelect id="k-prj" value={keyProject || projects.data?.[0]?.id || ''} onChange={(e) => setKeyProject(e.target.value)}>
                  {projects.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {scope === 'secret' && (
                <Field label="Environnement" htmlFor="k-env" hint="Une clé de test impose l’exécution en bac à sable.">
                  <NativeSelect id="k-env" value={env} onChange={(e) => setEnv(e.target.value as ApiKey['environment'])}>
                    <option value="test">Test</option>
                    <option value="live">Production</option>
                  </NativeSelect>
                </Field>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={() => create.mutate(undefined)} disabled={create.isPending}>
                  {create.isPending ? 'Création…' : 'Créer la clé'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={`Révoquer « ${revoke?.name ?? ''} » ?`}
        description="Les appels signés avec cette clé échoueront immédiatement (401). Cette action est irréversible."
        confirmLabel="Révoquer la clé"
        pending={del.isPending}
        onConfirm={() => revoke && del.mutate(revoke.id)}
      />
    </>
  )
}

const EVENTS = ['run.completed', 'run.failed', 'approval.requested', 'budget.threshold', 'version.deployed']

function Webhooks() {
  const list = useWebhooks()
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['run.completed'])
  const add = useAction(() => api.webhooks.create(url, events), { invalidate: [keys.webhooks], success: 'Webhook ajouté', onSuccess: () => setUrl('') })
  const test = useAction((id: string) => api.webhooks.test(id), { success: (r) => `Envoi de test : ${r.status} en ${r.latencyMs} ms` })
  const del = useAction((id: string) => api.webhooks.remove(id), { invalidate: [keys.webhooks], success: 'Webhook supprimé' })
  return (
    <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
      <Async query={list}>
        {(ws) =>
          ws.length === 0 ? (
            <EmptyState title="Aucun webhook" description="Recevez les événements de vos agents sur votre back-end." />
          ) : (
            <Panel className="divide-y self-start">
              {ws.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <code className="block truncate text-[13px]">{w.url}</code>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.events.map((e) => (
                        <Tag key={e}>{e}</Tag>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => test.mutate(w.id)} disabled={test.isPending}>
                      Tester
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Supprimer le webhook" onClick={() => del.mutate(w.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </Panel>
          )
        }
      </Async>
      <Panel className="p-5">
        <h3 className="mb-4 text-[15px] font-semibold">Ajouter un webhook</h3>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate(undefined)
          }}
        >
          <Field label="URL de destination" htmlFor="wh-url">
            <Input id="wh-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.bonaco.pro/hooks/forge" />
          </Field>
          <Field label="Événements">
            <ChipGroup label="Événements" value={events} onChange={setEvents} options={EVENTS.map((e) => ({ value: e, label: e }))} />
          </Field>
          <Button type="submit" disabled={add.isPending || !events.length}>
            <Plus /> Ajouter
          </Button>
        </form>
      </Panel>
    </div>
  )
}

export default function Integrations() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'snippets'
  return (
    <>
      <PageHeader title="Intégrations" description="Branchez vos agents à un site déjà en ligne, à une application en cours de développement ou à vos outils." />
      <UnderlineTabs label="Type d’intégration" value={tab} onChange={(v) => setParams({ tab: v })} items={TABS.map(([value, label]) => ({ value, label }))} className="mb-8" />
      {tab === 'snippets' && <Snippets />}
      {tab === 'site' && <ExistingSite />}
      {tab === 'app' && <InProgressApp />}
      {tab === 'mcp' && <Connectors />}
      {tab === 'keys' && <Keys />}
      {tab === 'webhooks' && <Webhooks />}
    </>
  )
}
