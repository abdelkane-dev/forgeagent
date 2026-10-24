import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

/** Global UI state: command palette and shortcuts dialog. */
const Ctx = createContext<{
  paletteOpen: boolean
  setPaletteOpen: (o: boolean) => void
  shortcutsOpen: boolean
  setShortcutsOpen: (o: boolean) => void
} | null>(null)

export function UiStateProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const value = useMemo(() => ({ paletteOpen, setPaletteOpen, shortcutsOpen, setShortcutsOpen }), [paletteOpen, shortcutsOpen])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUiState() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useUiState must be used inside UiStateProvider')
  return c
}
