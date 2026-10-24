import { Kbd } from '@/components/common/page'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NAV_FLAT } from './nav'
import { MOD } from './shortcuts'
import { useUiState } from './ui-state'

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUiState()
  const rows: [string[], string][] = [
    [[MOD, 'K'], 'Palette de commandes'],
    [['/'], 'Rechercher'],
    [['C'], 'Créer un agent'],
    [['T'], 'Basculer le thème'],
    [['?'], 'Afficher les raccourcis'],
    ...NAV_FLAT.filter((n) => n.key).map((n) => [['G', n.key!.toUpperCase()], n.label] as [string[], string]),
  ]
  return (
    <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>Utilisables partout dans la console, hors champs de saisie.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1">
          {rows.map(([k, label]) => (
            <li key={label} className="flex items-center justify-between py-1.5 text-[14px]">
              <span>{label}</span>
              <span className="flex gap-1">
                {k.map((x, i) => (
                  <Kbd key={i}>{x}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
