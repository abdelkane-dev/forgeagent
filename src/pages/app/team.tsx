import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, useAction, useTeam } from '@/api/hooks'
import type { Role, TeamMember } from '@/api/types'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Field, NativeSelect } from '@/components/common/field'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { Async } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { relative } from '@/lib/format'
import { ROLES } from '@/lib/labels'

const MATRIX: [string, Record<Role, boolean>][] = [
  ['Voir les agents et les traces', { admin: true, editor: true, viewer: true }],
  ['Créer et modifier des agents', { admin: true, editor: true, viewer: false }],
  ['Tester en bac à sable', { admin: true, editor: true, viewer: true }],
  ['Déployer en production', { admin: true, editor: true, viewer: false }],
  ['Approuver les actions sensibles', { admin: true, editor: false, viewer: false }],
  ['Gérer les clés API', { admin: true, editor: false, viewer: false }],
  ['Gérer l’équipe et les accès', { admin: true, editor: false, viewer: false }],
  ['Déclencher l’arrêt d’urgence', { admin: true, editor: true, viewer: false }],
]

export default function Team() {
  const team = useTeam()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [err, setErr] = useState('')
  const [del, setDel] = useState<TeamMember | null>(null)
  const invite = useAction(() => api.team.invite(email, role), {
    invalidate: [keys.team, keys.audit],
    onSuccess: async (m) => {
      setInviteOpen(false)
      setEmail('')
      if (m.inviteUrl) {
        await navigator.clipboard.writeText(m.inviteUrl).catch(() => null)
        toast.success('Invitation créée : lien copié, transmettez-le au membre', { description: m.inviteUrl, duration: 10_000 })
      } else toast.success(`Invitation envoyée à ${m.email}`)
    },
  })
  const setMemberRole = useAction(({ id, r }: { id: string; r: Role }) => api.team.setRole(id, r), { invalidate: [keys.team], success: (m) => `${m.name} est maintenant ${ROLES[m.role].toLowerCase()}` })
  const remove = useAction((id: string) => api.team.remove(id), { invalidate: [keys.team], success: 'Accès retiré', onSuccess: () => setDel(null) })

  return (
    <>
      <PageHeader
        title="Équipe et accès"
        description="Qui peut voir, modifier, déployer et approuver. ForgeAgent est un outil d’équipe technique : aucun accès client final."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus /> Inviter un membre
          </Button>
        }
      />
      <Section title="Membres">
        <Async query={team}>
          {(list) => (
            <Panel className="divide-y">
              {list.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hex flex size-8 shrink-0 items-center justify-center bg-secondary text-[11px] font-bold">
                      {m.name
                        .split(' ')
                        .map((x) => x[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium">{m.name}</div>
                      <div className="truncate text-[13px] text-muted-foreground">
                        {m.email} · {m.invited ? 'invitation en attente' : `actif ${relative(m.lastActiveAt)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <NativeSelect value={m.role} onChange={(e) => setMemberRole.mutate({ id: m.id, r: e.target.value as Role })} aria-label={`Rôle de ${m.name}`} className="w-44">
                      {(Object.keys(ROLES) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLES[r]}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${m.name}`} onClick={() => setDel(m)} disabled={m.id === 'usr_1'}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </Panel>
          )}
        </Async>
      </Section>
      <Section title="Permissions par rôle">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="text-left text-[12.5px] text-muted-foreground">
                <th className="pb-2 font-medium">Permission</th>
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <th key={r} className="w-32 pb-2 text-center font-medium">
                    {ROLES[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map(([label, roles]) => (
                <tr key={label} className="border-t">
                  <td className="py-3">{label}</td>
                  {(Object.keys(ROLES) as Role[]).map((r) => (
                    <td key={r} className="py-3 text-center">
                      {roles[r] ? <Check className="mx-auto size-4 text-ok" aria-label="Autorisé" /> : <Minus className="mx-auto size-4 text-muted-foreground/60" aria-label="Non autorisé" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un membre</DialogTitle>
            <DialogDescription>L’invitation expire au bout de 7 jours.</DialogDescription>
          </DialogHeader>
          <form
            id="invite"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!/^\S+@\S+\.\S+$/.test(email)) return setErr('Adresse email invalide.')
              setErr('')
              invite.mutate(undefined)
            }}
          >
            <Field label="Email" htmlFor="inv-email" error={err}>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@bonaco.pro" autoFocus aria-invalid={!!err} />
            </Field>
            <Field label="Rôle" htmlFor="inv-role">
              <NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLES) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLES[r]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" form="invite" disabled={invite.isPending}>
              {invite.isPending ? 'Envoi…' : 'Envoyer l’invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title={`Retirer l’accès de ${del?.name ?? ''} ?`} description="Ses sessions sont fermées immédiatement. Ses actions passées restent dans le journal d’audit." confirmLabel="Retirer l’accès" pending={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} />
    </>
  )
}
