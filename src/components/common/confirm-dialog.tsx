import { useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Destructive confirmation. When `confirmText` is given, the user must type it
 * (e.g. the agent's name) before the action unlocks.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Supprimer',
  confirmText,
  onConfirm,
  pending,
  tone = 'danger',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  confirmText?: string
  onConfirm: () => void
  pending?: boolean
  tone?: 'danger' | 'default'
}) {
  const [typed, setTyped] = useState('')
  const locked = !!confirmText && typed.trim() !== confirmText

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped('')
        onOpenChange(o)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {confirmText && (
          <label className="grid gap-2 text-[14px]">
            <span>
              Tapez <b className="font-semibold">{confirmText}</b> pour confirmer
            </span>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" />
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            className={tone === 'danger' ? 'bg-danger text-white hover:bg-danger/90 dark:bg-danger dark:text-[#0b0c0e]' : ''}
            disabled={locked || pending}
            onClick={onConfirm}
          >
            {pending ? 'En cours…' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
