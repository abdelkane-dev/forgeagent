import { motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Rising sparks (FORGE_THEME §6): decorative particles, transform/opacity only,
 * never over text. Rendered nothing when the user prefers reduced motion.
 */
export function Sparks({ count = 18, className, burst = false }: { count?: number; className?: string; burst?: boolean }) {
  const reduce = useReducedMotion()
  const parts = useMemo(
    () =>
      Array.from({ length: Math.min(count, 24) }, (_, i) => {
        // Deterministic pseudo-random spread so renders are stable.
        const r = (n: number) => {
          const x = Math.sin((i + 1) * 9301 + n * 49297) * 233280
          return x - Math.floor(x)
        }
        return { left: r(1) * 100, size: 2 + r(2) * 3, delay: r(3) * (burst ? 0.3 : 4), dur: (burst ? 0.9 : 2.6) + r(4) * 1.8, drift: (r(5) - 0.5) * 60, rise: 80 + r(6) * 160 }
      }),
    [count, burst],
  )
  if (reduce) return null
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 rounded-full"
          style={{ left: `${p.left}%`, width: p.size, height: p.size, background: i % 3 ? 'var(--ember)' : 'var(--amber)', boxShadow: '0 0 6px var(--ember)' }}
          initial={{ y: 0, x: 0, opacity: 0 }}
          animate={{ y: -p.rise, x: p.drift, opacity: [0, 1, 0] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: burst ? 0 : Infinity, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

/** Heat shimmer: an animated turbulence filter applied to a decorative layer only. */
export function HeatShimmer({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <svg className={cn('pointer-events-none absolute inset-0 size-full', className)} aria-hidden>
      <defs>
        <filter id="forge-heat">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="3">
            <animate attributeName="baseFrequency" dur="6s" values="0.012 0.06;0.014 0.08;0.012 0.06" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="14" />
        </filter>
        <linearGradient id="forge-heat-fill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--ember)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="40%" width="100%" height="60%" fill="url(#forge-heat-fill)" filter="url(#forge-heat)" />
    </svg>
  )
}
