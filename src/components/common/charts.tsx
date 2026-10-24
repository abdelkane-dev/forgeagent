import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { compact, num } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Column chart with a y-scale. The highlighted column (the current period)
 * takes the one chart hue; every other column is ink at low contrast.
 */
export function ColumnChart({
  data,
  highlight = data.length - 1,
  height = 200,
  unit = '',
  label,
}: {
  data: { label: string; value: number; secondary?: number }[]
  highlight?: number
  height?: number
  unit?: string
  label: string
}) {
  const reduce = useReducedMotion()
  const max = Math.max(...data.map((d) => d.value), 1)
  const step = niceStep(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).reverse()

  return (
    <figure aria-label={label} className="w-full">
      <div className="flex gap-3" style={{ height }}>
        <div className="flex flex-col justify-between pb-6 text-right text-[12px] text-muted-foreground tabular" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-[6px] pb-6 sm:gap-3">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="h-px w-full bg-border/60" />
            ))}
          </div>
          {data.map((d, i) => (
            <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
              <motion.div
                className={cn('relative w-full rounded-t-[3px]', i === highlight ? 'bg-cobalt' : 'bg-foreground/22 group-hover:bg-foreground/35')}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: `${(d.value / top) * 100}%`, transformOrigin: 'bottom' }}
              >
                {d.secondary !== undefined && d.secondary > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-b-none bg-danger/80"
                    style={{ height: `${Math.max((d.secondary / d.value) * 100, 2)}%` }}
                  />
                )}
              </motion.div>
              <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-md bg-popover px-2 py-1 text-[12px] whitespace-nowrap opacity-0 shadow-float transition-opacity group-hover:opacity-100 tabular">
                {num(d.value)}
                {unit}
                {d.secondary !== undefined && <span className="text-danger"> · {num(d.secondary)} err.</span>}
              </span>
              <span
                className={cn(
                  'absolute -bottom-6 left-1/2 -translate-x-1/2 text-[12px] whitespace-nowrap',
                  i === highlight ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </figure>
  )
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Horizontal meter with a cap marker, e.g. spend against budget. */
export function Meter({ value, max, className, tone }: { value: number; max: number; className?: string; tone?: 'cobalt' | 'warn' | 'danger' }) {
  const pct = Math.min(100, (value / max) * 100)
  const t = tone ?? (pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'cobalt')
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', t === 'cobalt' ? 'bg-cobalt' : t === 'warn' ? 'bg-warn' : 'bg-danger')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** KPI strip of equal cells: label over value with a muted unit. */
export function KpiStrip({ items, className }: { items: { label: string; value: ReactNode; unit?: string; hint?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border md:grid-cols-4', className)}>
      {items.map((k) => (
        <div key={k.label} className="bg-card px-5 py-4">
          <div className="text-[13px] font-medium text-muted-foreground">{k.label}</div>
          <div className="mt-1.5 flex items-baseline gap-1 text-[26px] leading-none font-semibold tracking-[-0.03em] tabular">
            {k.value}
            {k.unit && <span className="text-[14px] font-medium text-muted-foreground">{k.unit}</span>}
          </div>
          {k.hint && <div className="mt-2 text-[12.5px] text-muted-foreground">{k.hint}</div>}
        </div>
      ))}
    </div>
  )
}
