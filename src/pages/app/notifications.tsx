import { ArrowUpRight, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { api } from '@/api'
import { keys, useAction, useNotifications } from '@/api/hooks'
import { PageHeader } from '@/components/common/page'
import { Async, EmptyState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { relative } from '@/lib/format'
import { cn } from '@/lib/utils'

export default function Notifications() {
  const list = useNotifications()
  const navigate = useNavigate()
  const all = useAction(() => api.notifications.markAllRead(), { invalidate: [keys.notifications], success: 'Tout est marqué comme lu' })
  const open = useAction((id: string) => api.notifications.markRead(id), { invalidate: [keys.notifications] })
  const unread = list.data?.filter((n) => !n.read).length ?? 0
  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est à jour.'}
        actions={
          <Button variant="outline" onClick={() => all.mutate(undefined)} disabled={!unread || all.isPending}>
            <CheckCheck /> Tout marquer comme lu
          </Button>
        }
      />
      <Async query={list}>
        {(ns) =>
          ns.length === 0 ? (
            <EmptyState title="Aucune notification" description="Les validations, erreurs et seuils de budget apparaîtront ici." />
          ) : (
            <ul className="grid gap-1">
              {ns.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      open.mutate(n.id)
                      navigate(n.href)
                    }}
                    className={cn('flex w-full items-center gap-4 rounded-lg px-4 py-3.5 text-left transition-colors hover:bg-card', !n.read && 'bg-card')}
                  >
                    <span className={cn('hex size-2.5 shrink-0', n.read ? 'bg-transparent' : 'bg-cobalt')} aria-label={n.read ? undefined : 'Non lue'} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[14.5px]', !n.read && 'font-semibold')}>{n.title}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {n.body} · {relative(n.at)}
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </>
  )
}
