import type { TeamRole } from '@/api/types'
import { TEAM } from '@/labels'
import { cn } from '@/lib/utils'

/**
 * Crests of the internal team (FORGE_THEME §3): one shield shape, one glyph per role,
 * tinted with the role's accent. Decorative: the name and role are always written next to it.
 */
const GLYPH: Record<TeamRole, React.ReactNode> = {
  // anvil with a crown
  orchestrator: (
    <>
      <path d="M11 13.5 13 10l3 2.4L19 10l2 3.5Z" />
      <path d="M8.5 17h13l3-1.4v2.2l-2.6 1.4h-3.4l-.8 2.2H21v2H11.3v-2h2.5l-.7-2.2H11c-1.4 0-2.5-.9-2.5-2.2Z" />
    </>
  ),
  // compass
  architect: (
    <>
      <circle cx="16" cy="9.5" r="1.8" />
      <path d="M15.2 11 10.5 24M16.8 11l4.7 13M12.2 19.5h7.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // hammer
  builder: (
    <g transform="rotate(-35 16 16)">
      <rect x="10" y="8" width="12" height="5.5" rx="1.2" />
      <rect x="14.9" y="13.5" width="2.3" height="11" rx="1.1" />
    </g>
  ),
  // shield with an eye
  security: (
    <>
      <path d="M16 8.5 22 11v4.6c0 3.6-2.6 6.4-6 7.4-3.4-1-6-3.8-6-7.4V11Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12.6 16s1.4-2.2 3.4-2.2 3.4 2.2 3.4 2.2-1.4 2.2-3.4 2.2-3.4-2.2-3.4-2.2Z" />
    </>
  ),
  // quench drop over a wave
  tester: (
    <>
      <path d="M16 8.5c2.6 3.3 4 5.6 4 7.6a4 4 0 0 1-8 0c0-2 1.4-4.3 4-7.6Z" />
      <path d="M9.5 23c1.6-1.4 3.2-1.4 4.8 0s3.2 1.4 4.8 0 2.4-1.2 3.4-.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  // watched flame
  supervisor: (
    <>
      <path d="M16 7.5c1 3 4.6 4.6 4.6 9.1A4.6 4.6 0 0 1 11.4 16.6c0-2.2 1.1-3.6 2.2-4.6.1 1.6.8 2.6 1.6 3 0-3.1.3-5.4.8-7.5Z" />
      <path d="M11 24.5h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
}

export function Crest({ role, className, active }: { role: TeamRole; className?: string; active?: boolean }) {
  const accent = TEAM[role].accent
  return (
    <span className={cn('relative inline-flex size-12 shrink-0', className)} aria-hidden>
      {active && <span className="absolute inset-0 rounded-full blur-md animate-breathe" style={{ background: accent, opacity: 0.35 }} />}
      <svg viewBox="0 0 32 32" className="relative size-full" style={{ color: accent }}>
        <path d="M16 2.5 28 6.5v9.2c0 7-5 12.2-12 13.8C9 27.9 4 22.7 4 15.7V6.5Z" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
        <g fill="currentColor">{GLYPH[role]}</g>
      </svg>
    </span>
  )
}
