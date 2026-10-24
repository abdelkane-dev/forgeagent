import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Page title row: title + optional description on the left, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-bold tracking-[-0.035em] md:text-[30px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-[15px] text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A titled block of a screen: 18/500 title, quiet action on the right. */
export function Section({
  title,
  meta,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('mb-12 last:mb-0', className)}>
      {(title || action) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2.5">
            {title && <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>}
            {meta && <span className="truncate text-[13px] text-muted-foreground">{meta}</span>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Raised surface: one tone step above the ground, no shadow at rest. */
export function Panel({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-lg bg-card text-card-foreground', className)} {...props}>
      {children}
    </div>
  )
}

/** Label + control row used in settings-like panels. */
export function Row({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="min-w-0">
        <div className="text-[14px] font-medium">{title}</div>
        {description && <div className="mt-0.5 text-[13px] text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] bg-secondary px-1 font-mono text-[11px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
