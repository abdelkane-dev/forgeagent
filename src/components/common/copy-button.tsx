import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function CopyButton({
  text,
  label = 'Copier',
  className,
  iconOnly,
}: {
  text: string
  label?: string
  className?: string
  iconOnly?: boolean
}) {
  const [done, setDone] = useState(false)
  const onClick = async () => {
    const ok = await copyText(text)
    if (!ok) return toast.error('Copie impossible : sélectionnez le texte manuellement')
    setDone(true)
    setTimeout(() => setDone(false), 1600)
  }
  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon-sm' : 'sm'}
      onClick={onClick}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      aria-label={iconOnly ? label : undefined}
    >
      {done ? <Check className="text-ok" /> : <Copy />}
      {!iconOnly && <span aria-live="polite">{done ? 'Copié' : label}</span>}
    </Button>
  )
}
