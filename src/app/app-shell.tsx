import { Bell, LogOut, Menu, Moon, Search, ShieldAlert, Sun } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Suspense, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { api, isDemo } from '@/api'
import { useMe, useNotifications, useSettings } from '@/api/hooks'
import { LogoMark } from '@/components/brand/logo'
import { LinkButton } from '@/components/common/link-button'
import { Kbd } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { StatusDot } from '@/components/common/status'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ROLES } from '@/lib/labels'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { CommandPalette } from './command-palette'
import { NAV } from './nav'
import { MOD, useGlobalShortcuts } from './shortcuts'
import { ShortcutsDialog } from './shortcuts-dialog'
import { useUiState } from './ui-state'

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-6">
      {NAV.map((g) => (
        <div key={g.group ?? 'root'}>
          {g.group && <div className="mb-1.5 px-3 text-[12.5px] font-medium text-muted-foreground">{g.group}</div>}
          <ul className="grid gap-0.5">
            {g.items.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.to === '/app' || n.to === '/app/agents'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex h-8 items-center gap-2.5 rounded-md px-3 text-[14px] transition-colors',
                      isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )
                  }
                >
                  <n.icon className="size-4 shrink-0" strokeWidth={1.7} />
                  <span className="truncate">{n.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarTop() {
  const { setPaletteOpen } = useUiState()
  const notif = useNotifications()
  const unread = notif.data?.filter((n) => !n.read).length ?? 0
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 pl-1.5">
        <Link to="/" className="flex items-center gap-2 rounded-md text-[16px] font-extrabold tracking-[-0.04em]" aria-label="ForgeAgent, retour au site">
          <LogoMark className="size-6" /> ForgeAgent
        </Link>
        <LinkButton to="/app/notifications" variant="ghost" size="icon-sm" aria-label={`Notifications, ${unread} non lues`} className="relative text-muted-foreground">
          <Bell />
          {unread > 0 && <span className="absolute top-1 right-1 size-2 rounded-full bg-cobalt" />}
        </LinkButton>
      </div>
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md bg-secondary/70 px-3 text-[14px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Search className="size-4" /> <span className="flex-1 text-left">Rechercher…</span>
        <Kbd>{MOD}</Kbd>
        <Kbd>K</Kbd>
      </button>
    </div>
  )
}

function SidebarBottom() {
  const { resolved, toggle } = useTheme()
  const settings = useSettings()
  const me = useMe()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const kill = settings.data?.killSwitch
  return (
    <div className="grid gap-2 pt-4">
      <div className="rounded-md bg-secondary/50 px-3 py-2.5 text-[13px]">
        <div className="flex items-center gap-2 font-medium">
          <StatusDot tone={kill ? 'danger' : 'ok'} pulse={!kill} />
          {kill ? 'Arrêt d’urgence actif' : isDemo ? 'Mode démo · données fictives' : 'Instance connectée'}
        </div>
        <div className="mt-1 text-muted-foreground">{isDemo ? 'Aucun back-end branché' : 'API ForgeAgent · Claude'}</div>
      </div>
      <div className="flex items-center justify-between gap-1 px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="hex flex size-7 shrink-0 items-center justify-center bg-foreground text-[11px] font-bold text-background">
            {(me.data?.name ?? '?')
              .split(' ')
              .map((x) => x[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0 text-[13px] leading-tight">
            <div className="truncate font-medium">{me.data?.name ?? '…'}</div>
            <div className="text-muted-foreground">{me.data ? ROLES[me.data.role] : ''}</div>
          </div>
        </div>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={`Passer en thème ${resolved === 'dark' ? 'clair' : 'sombre'}`} className="text-muted-foreground">
            {resolved === 'dark' ? <Sun /> : <Moon />}
          </Button>
          {!isDemo && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Se déconnecter"
              className="text-muted-foreground"
              onClick={async () => {
                await api.auth.logout().catch(() => null)
                qc.clear()
                navigate('/login')
              }}
            >
              <LogOut />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AppShell() {
  useGlobalShortcuts()
  const location = useLocation()
  const reduce = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const settings = useSettings()
  const me = useMe()
  const current = NAV.flatMap((g) => g.items).find((n) => location.pathname === n.to) ?? null

  // Real back-end: the console requires a session. Demo mode always has one.
  if (!isDemo && me.isPending) return <LoadingBlock className="px-6" label="Vérification de la session…" />
  if (!isDemo && me.isError) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />

  return (
    <div className="min-h-svh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-background">
        Aller au contenu
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col px-3 py-4 lg:flex">
        <SidebarTop />
        <div className="scrollbar-thin -mx-1 mt-6 flex-1 overflow-y-auto px-1">
          <NavList />
        </div>
        <SidebarBottom />
      </aside>

      <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 bg-background/95 px-4 lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
          <Menu />
        </Button>
        <span className="truncate text-[15px] font-semibold">{current?.label ?? 'ForgeAgent'}</span>
        <MobileSearch />
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[86vw] max-w-[320px] gap-0 p-3">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <SidebarTop />
          <div className="scrollbar-thin mt-6 flex-1 overflow-y-auto">
            <NavList onNavigate={() => setMenuOpen(false)} />
          </div>
          <SidebarBottom />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-[248px]">
        {settings.data?.killSwitch && (
          <div className="flex items-center gap-3 bg-danger px-4 py-2.5 text-[14px] font-medium text-white md:px-10 dark:text-[#0b0c0e]">
            <ShieldAlert className="size-4 shrink-0" />
            <span className="flex-1">Arrêt d’urgence actif : tous les agents sont en pause.</span>
            <Link to="/app/security#kill" className="underline underline-offset-2">
              Gérer
            </Link>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-24 sm:px-6 md:px-10 md:pt-9">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <Suspense fallback={<LoadingBlock />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <CommandPalette />
      <ShortcutsDialog />
    </div>
  )
}

function MobileSearch() {
  const { setPaletteOpen } = useUiState()
  return (
    <Button variant="ghost" size="icon-sm" onClick={() => setPaletteOpen(true)} aria-label="Rechercher">
      <Search />
    </Button>
  )
}
