import { cn } from '@/lib/utils'

/** The forge motif as a loader: three hexagons lighting in turn. */
export function HexLoader({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} role="status" aria-label="Chargement">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="hex size-2.5 animate-pulse bg-ember"
          style={{ animationDelay: `${i * 160}ms`, animationDuration: '900ms' }}
        />
      ))}
    </span>
  )
}
