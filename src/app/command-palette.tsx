import { Boxes, FolderKanban, Moon, Plus, ShieldAlert, SquareTerminal, Sun, Keyboard, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAgents, useProjects, useSkills } from '@/api/hooks'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { AgentStatus } from '@/components/common/status'
import { useTheme } from '@/lib/theme'
import { NAV } from './nav'
import { useUiState } from './ui-state'

/** ⌘K: jump to any page, agent, project or skill, or run a common action. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setShortcutsOpen } = useUiState()
  const navigate = useNavigate()
  const { resolved, toggle } = useTheme()
  const agents = useAgents()
  const projects = useProjects()
  const skills = useSkills()

  const run = (fn: () => void) => {
    setPaletteOpen(false)
    fn()
  }

  return (
    <CommandDialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      title="Palette de commandes"
      description="Rechercher une page, un agent ou une action"
      className="sm:max-w-xl"
    >
      <Command loop>
        <CommandInput placeholder="Rechercher une page, un agent, une action…" />
        <CommandList className="max-h-[min(60vh,420px)]">
          <CommandEmpty>Aucun résultat. Essayez « agent », « clé » ou « logs ».</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem onSelect={() => run(() => navigate('/app/agents/new'))}>
              <Plus /> Forger un agent <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/app/test'))}>
              <SquareTerminal /> Tester un agent
            </CommandItem>
            <CommandItem onSelect={() => run(() => navigate('/app/settings?tab=platform'))}>
              <ShieldAlert /> Arrêt d’urgence de tous les agents
            </CommandItem>
            <CommandItem onSelect={() => run(toggle)}>
              {resolved === 'dark' ? <Sun /> : <Moon />} Passer en thème {resolved === 'dark' ? 'clair' : 'sombre'}
              <CommandShortcut>T</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setShortcutsOpen(true))}>
              <Keyboard /> Raccourcis clavier <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          {!!agents.data?.length && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Agents">
                {agents.data.map((a) => (
                  <CommandItem key={a.id} value={`agent ${a.name} ${a.id}`} onSelect={() => run(() => navigate(`/app/agents/${a.id}`))}>
                    <Boxes /> <span className="flex-1 truncate">{a.name}</span>
                    <AgentStatus status={a.status} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {!!projects.data?.length && (
            <CommandGroup heading="Projets">
              {projects.data.map((p) => (
                <CommandItem key={p.id} value={`projet ${p.name}`} onSelect={() => run(() => navigate(`/app/projects/${p.id}`))}>
                  <FolderKanban /> {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!skills.data?.length && (
            <CommandGroup heading="Skills">
              {skills.data.map((s) => (
                <CommandItem key={s.id} value={`skill ${s.name}`} onSelect={() => run(() => navigate(`/app/skills?q=${encodeURIComponent(s.name)}`))}>
                  <Sparkles /> {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          {NAV.map((g) => (
            <CommandGroup key={g.group ?? 'root'} heading={g.group ?? 'Pages'}>
              {g.items.map((n) => (
                <CommandItem key={n.to} value={`${n.label} ${n.keywords ?? ''}`} onSelect={() => run(() => navigate(n.to))}>
                  <n.icon /> {n.label}
                  {n.key && <CommandShortcut>G {n.key.toUpperCase()}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
