import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useTheme } from '@/lib/theme'
import { NAV_FLAT } from './nav'
import { useUiState } from './ui-state'

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** Global keyboard shortcuts: ⌘K palette, "g" + key navigation, ? help, t theme. */
export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const { toggle } = useTheme()
  const { setPaletteOpen, setShortcutsOpen } = useUiState()
  const pendingG = useRef<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return

      if (pendingG.current) {
        window.clearTimeout(pendingG.current)
        pendingG.current = null
        const item = NAV_FLAT.find((n) => n.key === e.key.toLowerCase())
        if (item) {
          e.preventDefault()
          navigate(item.to)
        }
        return
      }
      if (e.key === 'g') {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 900)
      } else if (e.key === '?') {
        setShortcutsOpen(true)
      } else if (e.key === 't') {
        toggle()
      } else if (e.key === 'c') {
        navigate('/app/agents/new')
      } else if (e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, toggle, setPaletteOpen, setShortcutsOpen])
}
