import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Label above a control, with optional hint and inline error. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <label htmlFor={htmlFor} className="text-[14px] font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/** Native select, styled: accessible and mobile-friendly by default. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-9 w-full appearance-none rounded-md border border-input bg-transparent pr-9 pl-3 text-[14px] outline-none focus-visible:border-ring dark:bg-input/30 [&>option]:bg-popover"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/** Title + description + switch on one row. */
export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[14px] font-medium">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v)} disabled={disabled} className="mt-0.5" />
    </div>
  )
}

/** Toggleable chips for multi-select lists. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode }[]
  value: T[]
  onChange: (v: T[]) => void
  label: string
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium transition-colors',
              on ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground hover:bg-input',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
