import { cn } from '@/lib/utils'

/** ForgeAgent mark: an anvil struck by a hammer, with one spark (FORGE_THEME §7). */
export function LogoMark({ className, title = 'ForgeAgent' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} role="img" aria-label={title}>
      <path
        d="M3.5 15.5h19.5l5-2.5v3.6l-4.4 2.4H18l-1.4 3.6H21v3.4H8.6V22.6h4.2L11.6 19H7.2c-2 0-3.7-1.6-3.7-3.5Z"
        fill="var(--ember)"
      />
      <g transform="rotate(-38 21 8)" fill="var(--foreground)">
        <rect x="15.5" y="3" width="11" height="5" rx="1.2" />
        <rect x="20" y="8" width="2.2" height="9" rx="1.1" />
      </g>
      <path d="m9 9 .9 2.1L12 12l-2.1.9L9 15l-.9-2.1L6 12l2.1-.9Z" fill="var(--amber)" />
    </svg>
  )
}

/** Monochrome anvil glyph for menus: same drawing as the mark, in the current text colour. */
export function ForgeGlyph({ className }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-4 shrink-0', className)} aria-hidden="true" fill="currentColor">
      <path d="M3.5 15.5h19.5l5-2.5v3.6l-4.4 2.4H18l-1.4 3.6H21v3.4H8.6V22.6h4.2L11.6 19H7.2c-2 0-3.7-1.6-3.7-3.5Z" />
      <g transform="rotate(-38 21 8)">
        <rect x="15.5" y="3" width="11" height="5" rx="1.2" />
        <rect x="20" y="8" width="2.2" height="9" rx="1.1" />
      </g>
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
