import { ExternalLink, KeyRound, Plus, Send, Trash2, Webhook as WebhookIcon, Wifi, X } from 'lucide-react'
import { useState } from 'react'
import { api, isDemo } from '@/api'
import { keys, useAction, useIntegrations, useSecrets, useWebhooks } from '@/api/hooks'
import type { AgentIntegration, IntegrationInput } from '@/api/types'
import { CodeBlock } from '@/components/common/code-block'
import { CopyButton } from '@/components/common/copy-button'
import { Field, NativeSelect } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clock, relative } from '@/lib/format'
import { agentSnippets, API_HOST } from '@/lib/snippets'
import type { TabProps } from '.'
import { can, RoleNote, useUpdate } from './shared'

const STATE: Record<AgentIntegration['status'], { tone: 'ok' | 'warn' | 'danger'; label: string }> = {
  connected: { tone: 'ok', label: 'Connecté' },
  pending: { tone: 'warn', label: 'Widget absent' },
  unreachable: { tone: 'danger', label: 'Injoignable' },
}
const KIND: Record<AgentIntegration['kind'], string> = { website: 'Site web', app: 'Application', service: 'Service' }

function Sites({ agent }: TabProps) {
  const list = useIntegrations(agent.id)
  const secrets = useSecrets(agent.id)
  const inv = [keys.of(agent.id, 'integrations'), keys.agent(agent.id), keys.of(agent.id, 'audit'), keys.of(agent.id, 'docs')]
  const empty: IntegrationInput = { kind: 'website', name: '', url: '', environment: 'test', secretName: null }
  const [f, setF] = useState(empty)
  const [event, setEvent] = useState('ping')
  const [lines, setLines] = useState<{ at: string; text: string; ok: boolean }[]>([])
  const add = useAction((input: IntegrationInput) => api.integrations.create(agent.id, input), { invalidate: inv, success: 'Intégration ajoutée : son origine est autorisée', onSuccess: () => setF(empty) })
  const remove = useAction((id: string) => api.integrations.remove(agent.id, id), { invalidate: inv, success: 'Intégration retirée' })
  const check = useAction((id: string) => api.integrations.check(agent.id, id), {
    invalidate: inv,
    onSuccess: (i) => setLines((l) => [...l, { at: new Date().toISOString(), text: `${i.url} : ${STATE[i.status].label}${i.latencyMs ? ` · ${i.latencyMs} ms` : ''}`, ok: i.status === 'connected' }]),
  })
  const send = useAction((e: string) => api.integrations.sendEvent(agent.id, e), {
    invalidate: [keys.of(agent.id, 'audit')],
    onSuccess: (r) => setLines((l) => [...l, { at: new Date().toISOString(), text: `${event} → ${r.response} · ${r.latencyMs} ms`, ok: r.ok }]),
  })
  const editor = can(agent, 'editor')
  const connected = list.data?.some((i) => i.status === 'connected')

  return (
    <div className="grid gap-8 xl:grid-cols-[1.2fr_1fr]">
      <div className="grid content-start gap-6">
        <Section title="Sites, applications et services" meta={list.data ? `${list.data.length}` : undefined} className="mb-0">
          {list.isPending ? (
            <LoadingBlock />
          ) : !list.data?.length ? (
            <EmptyState title="Aucune intégration" description="Reliez le site où le widget de cet agent est installé." />
          ) : (
            <Panel className="divide-y">
              {list.data.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <StatusDot tone={STATE[i.status].tone} pulse={i.status === 'connected'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      {i.name} <Tag>{KIND[i.kind]}</Tag> <Tag>{i.environment === 'test' ? 'Test' : 'Production'}</Tag>
                    </div>
                    <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:underline">
                      {i.url} <ExternalLink className="size-3" />
                    </a>
                    <div className="text-[12.5px] text-muted-foreground">
                      {STATE[i.status].label} · vérifié {relative(i.lastCheckAt)}
                      {i.secretName ? ` · identifiants : ${i.secretName}` : ''}
                    </div>
                  </div>
                  {editor && (
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => check.mutate(i.id)} disabled={check.isPending}>
                        <Wifi /> Vérifier
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${i.name}`} onClick={() => remove.mutate(i.id)}>
                        <Trash2 />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </Panel>
          )}
        </Section>
        <RoleNote agent={agent} min="editor" />
        {editor && (
          <Panel className="p-5">
            <h3 className="mb-4 text-[15px] font-semibold">Relier un site</h3>
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                add.mutate(f)
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom" htmlFor="i-name">
                  <Input id="i-name" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Console Bonaco Pro" />
                </Field>
                <Field label="Adresse" htmlFor="i-url" hint={!isDemo ? `Site de démo local : ${API_HOST}/demo-site?agent=${agent.id}&key=…` : undefined}>
                  <Input id="i-url" type="url" required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://app.bonaco.pro" />
                </Field>
                <Field label="Type" htmlFor="i-kind">
                  <NativeSelect id="i-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as IntegrationInput['kind'] })}>
                    {Object.entries(KIND).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Environnement" htmlFor="i-env">
                  <NativeSelect id="i-env" value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value as IntegrationInput['environment'] })}>
                    <option value="test">Test</option>
                    <option value="production">Production</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Identifiants (secret de cet agent)" htmlFor="i-secret">
                <NativeSelect id="i-secret" value={f.secretName ?? ''} onChange={(e) => setF({ ...f, secretName: e.target.value || null })}>
                  <option value="">Aucun</option>
                  {secrets.data?.map((x) => (
                    <option key={x.id} value={x.name}>
                      {x.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" disabled={add.isPending} className="w-fit">
                <Plus /> Relier
              </Button>
            </form>
          </Panel>
        )}
      </div>
      <div className="grid content-start gap-4">
        <div className="overflow-hidden rounded-lg bg-[#120e0b] text-[#efe7df]" data-ui>
          <div className="flex items-center justify-between gap-2 bg-white/[0.04] px-4 py-2.5 text-[13px] font-medium text-white/80">
            Console d’interaction
            {editor && (
              <div className="flex gap-2">
                <NativeSelect aria-label="Événement" value={event} onChange={(e) => setEvent(e.target.value)} className="h-7 border-white/15 bg-transparent text-[12.5px] text-white">
                  <option value="ping">ping</option>
                  <option value="page.context">page.context</option>
                  <option value="ui.highlight">ui.highlight</option>
                  <option value="api.call">api.call</option>
                  <option value="notify.admin">notify.admin</option>
                </NativeSelect>
                <Button size="sm" variant="secondary" className="h-7" onClick={() => send.mutate(event)} disabled={send.isPending || !connected}>
                  <Send /> Envoyer
                </Button>
              </div>
            )}
          </div>
          <div className="h-[260px] overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.75]" role="log" aria-live="polite">
            {lines.length === 0 && <p className="text-white/50">Vérifiez une intégration ou envoyez un événement : les réponses des pages ouvertes s’affichent ici. Les actions sur le site exigent la permission « Agir sur le site externe ».</p>}
            {lines.map((l, i) => (
              <div key={i}>
                <span className="text-white/40">{clock(l.at)}</span> <span className={l.ok ? 'text-[#7fd6a8]' : 'text-[#ff8f7a]'}>{l.ok ? '✓' : '✗'}</span> {l.text}
              </div>
            ))}
            {(check.isPending || send.isPending) && <div className="text-white/50">… en attente de réponse</div>}
          </div>
        </div>
        <Origins agent={agent} />
      </div>
    </div>
  )
}

function Origins({ agent }: { agent: TabProps['agent'] }) {
  const update = useUpdate(agent)
  const [o, setO] = useState('')
  const editor = can(agent, 'editor')
  return (
    <Panel className="p-5">
      <h3 className="text-[15px] font-semibold">Origines autorisées du widget</h3>
      <p className="mb-3 text-[13px] text-muted-foreground">La clé publiable de cet agent n’est acceptée que depuis ces origines exactes.</p>
      <ul className="mb-3 flex flex-wrap gap-2">
        {agent.allowedOrigins.length === 0 && <li className="text-[14px] text-muted-foreground">Aucune origine.</li>}
        {agent.allowedOrigins.map((x) => (
          <li key={x}>
            <Tag className="gap-1 font-mono">
              {x}
              {editor && (
                <button type="button" aria-label={`Retirer ${x}`} className="opacity-60 hover:opacity-100" onClick={() => update.mutate({ patch: { allowedOrigins: agent.allowedOrigins.filter((y) => y !== x) } })}>
                  <X className="size-3" />
                </button>
              )}
            </Tag>
          </li>
        ))}
      </ul>
      {editor && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            try {
              const origin = new URL(o).origin
              update.mutate({ patch: { allowedOrigins: [...new Set([...agent.allowedOrigins, origin])] } }, { onSuccess: () => setO('') })
            } catch {
              /* the input's own validation explains it */
            }
          }}
        >
          <Input type="url" required value={o} onChange={(e) => setO(e.target.value)} placeholder="https://admin.bonaco.pro" aria-label="Nouvelle origine" />
          <Button type="submit" variant="outline">
            Ajouter
          </Button>
        </form>
      )}
    </Panel>
  )
}

function Secrets({ agent }: TabProps) {
  const list = useSecrets(agent.id)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const inv = [keys.of(agent.id, 'secrets'), keys.of(agent.id, 'audit')]
  const put = useAction(() => api.secrets.put(agent.id, name, value), { invalidate: inv, success: 'Secret chiffré et enregistré', onSuccess: () => (setName(''), setValue('')) })
  const remove = useAction((n: string) => api.secrets.remove(agent.id, n), { invalidate: inv, success: 'Secret supprimé' })
  const owner = can(agent, 'owner')
  return (
    <Section title="Secrets" meta={list.data ? `${list.data.length}` : undefined} description="Chiffrés avec une clé propre à cet agent. Leur valeur ne s’affiche jamais et n’est jamais exportée.">
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Panel className="divide-y">
          {!list.data?.length && <p className="px-4 py-4 text-[14px] text-muted-foreground">Aucun secret.</p>}
          {list.data?.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-4 py-3">
              <KeyRound className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13.5px]">{x.name}</div>
                <div className="text-[12.5px] text-muted-foreground">Mis à jour {relative(x.createdAt)} · utilisé {relative(x.lastUsedAt)}</div>
              </div>
              {owner && (
                <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${x.name}`} onClick={() => remove.mutate(x.name)}>
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
        </Panel>
        {owner ? (
          <Panel className="p-5">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                put.mutate(undefined)
              }}
            >
              <Field label="Nom" htmlFor="s-name" hint="MAJUSCULES_AVEC_TIRETS_BAS">
                <Input id="s-name" required pattern="[A-Z][A-Z0-9_]{1,63}" value={name} onChange={(e) => setName(e.target.value.toUpperCase())} placeholder="BONACO_API_TOKEN" className="font-mono" />
              </Field>
              <Field label="Valeur" htmlFor="s-value">
                <Input id="s-value" type="password" required autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
              <Button type="submit" disabled={put.isPending} className="w-fit">
                Enregistrer le secret
              </Button>
            </form>
          </Panel>
        ) : (
          <RoleNote agent={agent} min="owner" />
        )}
      </div>
    </Section>
  )
}

function Webhooks({ agent }: TabProps) {
  const list = useWebhooks(agent.id)
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const inv = [keys.of(agent.id, 'webhooks'), keys.of(agent.id, 'audit')]
  const create = useAction(() => api.webhooks.create(agent.id, url, ['run.completed', 'run.failed', 'approval.requested', 'approval.resolved']), {
    invalidate: inv,
    success: 'Webhook ajouté',
    onSuccess: (w) => (setUrl(''), setSecret(w.signingSecret ?? null)),
  })
  const remove = useAction((id: string) => api.webhooks.remove(agent.id, id), { invalidate: inv, success: 'Webhook supprimé' })
  const test = useAction((id: string) => api.webhooks.test(agent.id, id), { success: (r) => `Réponse ${r.status} en ${r.latencyMs} ms` })
  return (
    <Section title="Webhooks sortants" description="Signés avec un secret propre à chaque webhook (X-Forge-Signature).">
      <Panel className="divide-y">
        {!list.data?.length && <p className="px-4 py-4 text-[14px] text-muted-foreground">Aucun webhook.</p>}
        {list.data?.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <WebhookIcon className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px]">{w.url}</div>
              <div className="text-[12.5px] text-muted-foreground">{w.events.join(', ')}</div>
            </div>
            {can(agent, 'editor') && (
              <Button variant="outline" size="sm" onClick={() => test.mutate(w.id)} disabled={test.isPending}>
                Tester
              </Button>
            )}
            {can(agent, 'owner') && (
              <Button variant="ghost" size="icon-sm" aria-label="Supprimer le webhook" onClick={() => remove.mutate(w.id)}>
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
      </Panel>
      {can(agent, 'owner') && (
        <form
          className="mt-4 flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(undefined)
          }}
        >
          <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://app.bonaco.pro/hooks/forgeagent" aria-label="Adresse du webhook" />
          <Button type="submit" variant="outline" disabled={create.isPending}>
            <Plus /> Ajouter
          </Button>
        </form>
      )}
      {secret && (
        <div className="mt-4 flex max-w-xl items-center gap-2 rounded-md bg-amber/15 px-3 py-2 text-[13px]" role="status">
          <span className="flex-1">
            Secret de signature, affiché une seule fois : <code className="font-mono">{secret}</code>
          </span>
          <CopyButton text={secret} />
        </div>
      )}
    </Section>
  )
}

export default function IntegrationTab(props: TabProps) {
  return (
    <div className="grid gap-14">
      <Sites {...props} />
      <Secrets {...props} />
      <Webhooks {...props} />
      <Section title="Intégrer cet agent" description="Les clés se créent dans Équipe et accès. Une clé n’ouvre que cet agent.">
        <CodeBlock snippets={agentSnippets(props.agent.id)} />
      </Section>
    </div>
  )
}
