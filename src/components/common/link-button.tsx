import type { VariantProps } from 'class-variance-authority'
import { Link, type LinkProps } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** A router link styled as a button. */
export function LinkButton({
  variant,
  size,
  className,
  ...props
}: LinkProps & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
