import { cn } from '@/lib/utils'

/**
 * ForgeAgent mark: the forge ingot (pointy-top hexagon) with an F whose
 * middle bar ends in a node, the agent plugged into the system.
 */
export function LogoMark({ className, title = 'ForgeAgent' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} role="img" aria-label={title}>
      <path d="M16 1.5 28.6 8.75v14.5L16 30.5 3.4 23.25V8.75Z" fill="var(--cobalt)" />
      <path d="M11.5 22.5v-13h9.5M11.5 16h6" fill="none" stroke="var(--cobalt-ink)" strokeWidth="3" strokeLinecap="square" />
      <circle cx="21.2" cy="16" r="2.1" fill="var(--cobalt-ink)" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 font-extrabold tracking-[-0.04em] text-[19px]', className)}>
      <LogoMark />
      <span>ForgeAgent</span>
    </span>
  )
}
