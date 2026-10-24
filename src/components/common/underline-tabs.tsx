import { motion } from 'motion/react'
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Underline tabs on a full-width rule with a 2px indicator as wide as the label.
 * Arrow keys move between tabs (WAI-ARIA tabs pattern).
 */
export function UnderlineTabs<T extends string>({
  value,
  onChange,
  items,
  className,
  label,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode; count?: number }[]
  className?: string
  label: string
}) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = (i + d + items.length) % items.length
    refs.current[next]?.focus()
    onChange(items[next].value)
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b px-1', className)}
    >
      {items.map((it, i) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative flex h-10 shrink-0 items-center gap-1.5 rounded-t-md px-2.5 text-[14px] font-medium whitespace-nowrap transition-colors',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {it.label}
            {it.count !== undefined && (
              <span className="tabular rounded-[4px] bg-secondary px-1.5 text-[12px] text-muted-foreground">{it.count}</span>
            )}
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
