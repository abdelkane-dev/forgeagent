import type { AgentStatus as Status } from '@/api/types'
import { STATUS } from '@/labels'
import { cn } from '@/lib/utils'

const TONE = {
  ok: 'bg-ok',
  muted: 'bg-muted-foreground/60',
  danger: 'bg-danger',
  warn: 'bg-warn',
  ember: 'bg-ember',
} as const

export type Tone = keyof typeof TONE

/** Small status mark for generic states (logs, checks, notifications). */
export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', TONE[tone])} />}
      <span className={cn('relative size-2 rounded-full', TONE[tone])} />
    </span>
  )
}

/**
 * Agent state as a piece of metal at a given heat (FORGE_THEME §2):
 * cold grey, ember, molten orange, quench blue, cracked red. The label is always shown.
 */
const METAL: Record<Status, { color: string; anim: string; text: string }> = {
  inactive: { color: 'var(--state-cold)', anim: '', text: 'text-muted-foreground' },
  starting: { color: 'var(--state-ember)', anim: 'animate-breathe', text: 'text-foreground' },
  active: { color: 'var(--state-molten)', anim: 'animate-flicker', text: 'text-foreground' },
  validated: { color: 'var(--state-quench)', anim: '', text: 'text-foreground' },
  error: { color: 'var(--state-crack)', anim: 'animate-breathe', text: 'text-[var(--state-crack)]' },
}

export function MetalSwatch({ status, className }: { status: Status; className?: string }) {
  const m = METAL[status]
  const hot = status === 'active' || status === 'starting'
  return (
    <span className={cn('relative inline-flex size-2.5 shrink-0', className)} aria-hidden>
      {hot && <span className={cn('absolute -inset-1 rounded-[3px] blur-[3px]', m.anim)} style={{ background: m.color, opacity: 0.55 }} />}
      <span className="relative size-2.5 overflow-hidden rounded-[3px]" style={{ background: m.color }}>
        {status === 'validated' && <span className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/55 group-hover/metal:animate-sheen" />}
        {status === 'error' && (
          <svg viewBox="0 0 10 10" className="absolute inset-0 size-full">
            <path d="M4 0 5.5 3.5 3.8 5.5 6 10" fill="none" stroke="var(--background)" strokeWidth="1.3" />
          </svg>
        )}
      </span>
    </span>
  )
}

export function AgentStatus({ status, className }: { status: Status; className?: string }) {
  const s = STATUS[status] ?? STATUS.inactive
  return (
    <span className={cn('group/metal inline-flex items-center gap-1.5 text-[13px] font-medium', METAL[status]?.text, className)} title={s.hint}>
      <MetalSwatch status={status in METAL ? status : 'inactive'} />
      <span>{s.label}</span>
    </span>
  )
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-md bg-secondary px-2 text-[12.5px] font-medium whitespace-nowrap text-secondary-foreground', className)}>
      {children}
    </span>
  )
}
