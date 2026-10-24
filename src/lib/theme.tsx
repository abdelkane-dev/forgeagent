import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'system'
const KEY = 'fa:theme'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

function resolve(t: Theme): 'dark' | 'light' {
  if (t !== 'system') return t
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const Ctx = createContext<{ theme: Theme; resolved: 'dark' | 'light'; setTheme: (t: Theme) => void; toggle: () => void } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(read)
  const [resolved, setResolved] = useState(() => resolve(read()))

  useEffect(() => {
    const apply = () => {
      const r = resolve(theme)
      setResolved(r)
      document.documentElement.classList.toggle('dark', r === 'dark')
    }
    apply()
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(KEY, t)
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
  }, [])

  const toggle = useCallback(() => setTheme(resolve(theme) === 'dark' ? 'light' : 'dark'), [theme, setTheme])

  return <Ctx.Provider value={{ theme, resolved, setTheme, toggle }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useTheme must be used inside ThemeProvider')
  return c
}
