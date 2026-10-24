import type { AgentStatus, LogLevel } from '@/api/types'
import { STATUS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const TONE = {
  ok: 'bg-ok',
  muted: 'bg-muted-foreground/60',
  danger: 'bg-danger',
  warn: 'bg-warn',
  cobalt: 'bg-cobalt',
} as const

export type Tone = keyof typeof TONE

/** Small hexagonal status mark, the motif at text size. */
export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('hex absolute inset-0 animate-ping opacity-60', TONE[tone])} />}
      <span className={cn('hex relative size-2', TONE[tone])} />
    </span>
  )
}

export function AgentStatus({ status, className }: { status: AgentStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium', className)}>
      <StatusDot tone={s.tone} pulse={status === 'active'} />
      <span className={status === 'error' ? 'text-danger' : status === 'active' ? '' : 'text-muted-foreground'}>{s.label}</span>
    </span>
  )
}

export const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-warn',
  error: 'text-danger',
}

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-secondary px-2 text-[12.5px] font-medium whitespace-nowrap text-secondary-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
