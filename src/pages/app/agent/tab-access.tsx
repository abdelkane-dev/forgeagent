import { KeyRound, Plus, RefreshCw, Trash2, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import { keys, useAction, useKeys, useMe, useMembers } from '@/api/hooks'
import type { AgentRole, ApiKey } from '@/api/types'
import { CopyButton } from '@/components/common/copy-button'
import { Field, NativeSelect } from '@/components/common/field'
import { Panel, Section } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { Tag } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { date, relative } from '@/lib/format'
import { AGENT_ROLES } from '@/labels'
import type { TabProps } from '.'
import { can, RoleNote } from './shared'

function OneTime({ value, label, onClose }: { value: string; label: string; onClose: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-amber/15 px-3 py-2 text-[13px]" role="status">
      <span className="min-w-0 flex-1">
        {label} : <code className="font-mono break-all">{value}</code>
      </span>
      <CopyButton text={value} />
      <Button variant="ghost" size="sm" onClick={onClose}>
        J’ai copié
      </Button>
    </div>
  )
}

function Members({ agent }: TabProps) {
  const members = useMembers(agent.id)
  const me = useMe()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AgentRole>('viewer')
  const [invite, setInvite] = useState<string | null>(null)
  const inv = [keys.of(agent.id, 'members'), keys.of(agent.id, 'audit')]
  const add = useAction(() => api.members.add(agent.id, email, role), { invalidate: inv, success: 'Membre ajouté', onSuccess: (r) => (setEmail(''), setInvite(r.inviteUrl ?? null)) })
  const setR = useAction(({ userId, r }: { userId: string; r: AgentRole }) => api.members.setRole(agent.id, userId, r), { invalidate: [...inv, keys.agent(agent.id)], success: 'Rôle modifié' })
  const remove = useAction((userId: string) => api.members.remove(agent.id, userId), { invalidate: inv, success: 'Membre retiré' })
  const owner = can(agent, 'owner')

  return (
    <Section title="Membres" meta={members.data ? `${members.data.length}` : undefined} description="Être membre de cet agent ne donne aucun accès aux autres agents.">
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        {members.isPending ? (
          <LoadingBlock />
        ) : (
          <Panel className="divide-y">
            {members.data?.map((m) => (
              <div key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="hex flex size-8 shrink-0 items-center justify-center bg-secondary text-[11px] font-bold">
                  {m.name
                    .split(' ')
                    .map((x) => x[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">
                    {m.name} {m.userId === me.data?.id && <span className="text-muted-foreground">(vous)</span>}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {m.email} · depuis {date(m.addedAt)}
                    {m.invited ? ' · invitation envoyée' : ''}
                  </div>
                </div>
                {owner ? (
                  <>
                    <NativeSelect aria-label={`Rôle de ${m.name}`} className="w-40" value={m.role} onChange={(e) => setR.mutate({ userId: m.userId, r: e.target.value as AgentRole })}>
                      {(Object.keys(AGENT_ROLES) as AgentRole[]).map((r) => (
                        <option key={r} value={r}>
                          {AGENT_ROLES[r].label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${m.name}`} onClick={() => remove.mutate(m.userId)}>
                      <UserMinus />
                    </Button>
                  </>
                ) : (
                  <Tag>{AGENT_ROLES[m.role].label}</Tag>
                )}
              </div>
            ))}
          </Panel>
        )}
        <div>
          {owner ? (
            <Panel className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">Ajouter un membre</h3>
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  add.mutate(undefined)
                }}
              >
                <Field label="Email" htmlFor="mb-email" hint="Sans compte, une invitation est créée.">
                  <Input id="mb-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="collegue@bonaco.pro" />
                </Field>
                <Field label="Rôle sur cet agent" htmlFor="mb-role" hint={AGENT_ROLES[role].hint}>
                  <NativeSelect id="mb-role" value={role} onChange={(e) => setRole(e.target.value as AgentRole)}>
                    <option value="viewer">{AGENT_ROLES.viewer.label}</option>
                    <option value="editor">{AGENT_ROLES.editor.label}</option>
                  </NativeSelect>
                </Field>
                <Button type="submit" disabled={add.isPending} className="w-fit">
                  <Plus /> Ajouter
                </Button>
              </form>
              {invite && <OneTime value={invite} label="Lien d’invitation" onClose={() => setInvite(null)} />}
            </Panel>
          ) : (
            <RoleNote agent={agent} min="owner" />
          )}
          <dl className="mt-4 grid gap-2 text-[13px] text-muted-foreground">
            {(Object.keys(AGENT_ROLES) as AgentRole[]).map((r) => (
              <div key={r}>
                <dt className="inline font-medium text-foreground">{AGENT_ROLES[r].label} : </dt>
                <dd className="inline">{AGENT_ROLES[r].hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Section>
  )
}

function Keys({ agent }: TabProps) {
  const list = useKeys(agent.id)
  const [name, setName] = useState('')
  const [env, setEnv] = useState<ApiKey['environment']>('test')
  const [scope, setScope] = useState<ApiKey['scope']>('secret')
  const [secret, setSecret] = useState<string | null>(null)
  const inv = [keys.of(agent.id, 'keys'), keys.of(agent.id, 'audit')]
  const create = useAction(() => api.keys.create(agent.id, name, env, scope), { invalidate: inv, success: 'Clé créée', onSuccess: (r) => (setName(''), setSecret(r.secret)) })
  const rotate = useAction((id: string) => api.keys.rotate(agent.id, id), { invalidate: inv, success: 'Clé régénérée : l’ancienne ne fonctionne plus', onSuccess: (r) => setSecret(r.secret) })
  const revoke = useAction((id: string) => api.keys.revoke(agent.id, id), { invalidate: inv, success: 'Clé révoquée' })
  const owner = can(agent, 'owner')
  return (
    <Section title="Clés API" description="Chaque clé appartient à cet agent seul et n’ouvre que lui. Le secret est haché côté serveur et ne s’affiche qu’une fois.">
      <Panel className="divide-y">
        {!list.data?.length && <p className="px-4 py-4 text-[14px] text-muted-foreground">Aucune clé.</p>}
        {list.data?.map((k) => (
          <div key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <KeyRound className="size-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                {k.name} <Tag>{k.scope === 'publishable' ? 'Publiable (widget)' : 'Secrète'}</Tag> <Tag>{k.environment === 'test' ? 'Test' : 'Production'}</Tag>
              </div>
              <div className="font-mono text-[12.5px] text-muted-foreground">
                {k.prefix}… · créée {relative(k.createdAt)} · utilisée {relative(k.lastUsedAt)}
              </div>
            </div>
            {owner && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => rotate.mutate(k.id)} disabled={rotate.isPending}>
                  <RefreshCw /> Régénérer
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Révoquer ${k.name}`} onClick={() => revoke.mutate(k.id)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>
        ))}
      </Panel>
      {owner ? (
        <form
          className="mt-4 grid max-w-3xl gap-3 sm:grid-cols-[1fr_150px_190px_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(undefined)
          }}
        >
          <Field label="Nom" htmlFor="k-name">
            <Input id="k-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Serveur Bonaco" />
          </Field>
          <Field label="Environnement" htmlFor="k-env">
            <NativeSelect id="k-env" value={env} onChange={(e) => setEnv(e.target.value as ApiKey['environment'])}>
              <option value="test">Test</option>
              <option value="live">Production</option>
            </NativeSelect>
          </Field>
          <Field label="Type" htmlFor="k-scope">
            <NativeSelect id="k-scope" value={scope} onChange={(e) => setScope(e.target.value as ApiKey['scope'])}>
              <option value="secret">Secrète (serveur)</option>
              <option value="publishable">Publiable (widget)</option>
            </NativeSelect>
          </Field>
          <Button type="submit" disabled={create.isPending}>
            <Plus /> Créer
          </Button>
        </form>
      ) : (
        <div className="mt-4">
          <RoleNote agent={agent} min="owner" />
        </div>
      )}
      {secret && <OneTime value={secret} label="Secret, affiché une seule fois" onClose={() => setSecret(null)} />}
    </Section>
  )
}

export default function AccessTab(props: TabProps) {
  return (
    <div className="grid gap-14">
      <Members {...props} />
      <Keys {...props} />
    </div>
  )
}
