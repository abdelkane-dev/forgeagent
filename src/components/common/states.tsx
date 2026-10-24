import type { UseQueryResult } from '@tanstack/react-query'
import { RotateCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { HexLoader } from './hex-loader'

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3 rounded-lg bg-card px-6 py-10 md:px-8', className)}>
      <span className="hex size-5 bg-secondary" aria-hidden />
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        {description && <p className="mt-1 max-w-[52ch] text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Erreur inconnue'
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-lg bg-card px-6 py-8 md:px-8', className)}>
      <TriangleAlert className="size-5 text-danger" aria-hidden />
      <div>
        <p className="text-[15px] font-semibold">Chargement impossible</p>
        <p className="mt-1 max-w-[60ch] text-[14px] text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> Réessayer
        </Button>
      )}
    </div>
  )
}

export function LoadingBlock({ label = 'Chargement…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-10 text-[14px] text-muted-foreground', className)} aria-busy>
      <HexLoader /> {label}
    </div>
  )
}

export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-busy aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', className)} aria-busy aria-label="Chargement">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-lg" />
      ))}
    </div>
  )
}

/**
 * Renders the loading / error / data states of a query in one place.
 * `skeleton` keeps the layout stable while loading.
 */
export function Async<T>({
  query,
  skeleton,
  children,
}: {
  query: UseQueryResult<T>
  skeleton?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <>{skeleton ?? <RowsSkeleton />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  return <>{children(query.data)}</>
}
