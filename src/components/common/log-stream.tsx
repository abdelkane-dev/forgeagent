import { Pause, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import { useAgents, useLogs } from '@/api/hooks'
import type { ID, LogEntry, LogLevel } from '@/api/types'
import { Button } from '@/components/ui/button'
import { clock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { StatusDot } from './status'

const LEVELS: (LogLevel | 'all')[] = ['all', 'info', 'warn', 'error', 'debug']
const LEVEL_TONE: Record<LogLevel, string> = {
  debug: 'text-white/45',
  info: 'text-[#9fb4ff]',
  warn: 'text-[#f0b44c]',
  error: 'text-[#ff7b7b]',
}

/** Live tail of agent logs, styled as a terminal. */
export function LogStream({ agentId, height = 'h-[360px]', className }: { agentId?: ID; height?: string; className?: string }) {
  const initial = useLogs(agentId)
  const agents = useAgents()
  const [live, setLive] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [level, setLevel] = useState<LogLevel | 'all'>('all')
  const [cleared, setCleared] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    const off = api.logs.subscribe(
      (e) => {
        if (!pausedRef.current) setLive((l) => [...l.slice(-300), e])
      },
      { agentId },
    )
    return off
  }, [agentId])

  const rows = [...(cleared ? [] : (initial.data ?? [])), ...live].filter((l) => level === 'all' || l.level === level)

  useEffect(() => {
    const el = box.current
    if (el && !paused) el.scrollTop = el.scrollHeight
  }, [rows.length, paused])

  const name = (id: ID) => agents.data?.find((a) => a.id === id)?.name ?? id

  return (
    <div className={cn('overflow-hidden rounded-lg bg-[#0e1013] text-[#e6e8ec] dark:bg-[#08090b]', className)} data-ui>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.04] px-2 py-1.5">
        <div className="flex items-center gap-2 pl-1.5 text-[13px] font-medium text-white/80">
          <StatusDot tone={paused ? 'muted' : 'ok'} pulse={!paused} />
          {paused ? 'En pause' : 'En direct'}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-md bg-white/5 p-0.5" role="radiogroup" aria-label="Niveau">
            {LEVELS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={level === l}
                onClick={() => setLevel(l)}
                className={cn(
                  'h-7 rounded-[5px] px-2 text-[12.5px] font-medium transition-colors',
                  level === l ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white',
                )}
              >
                {l === 'all' ? 'Tout' : l}
              </button>
            ))}
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? 'Reprendre' : 'Mettre en pause'}
          >
            {paused ? <Play /> : <Pause />}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => {
              setLive([])
              setCleared(true)
            }}
            aria-label="Vider la console"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div
        ref={box}
        className={cn('scrollbar-thin overflow-y-auto px-3 py-2.5 font-mono text-[12.5px] leading-[1.75]', height)}
        role="log"
        aria-live="polite"
        aria-label="Journal en direct"
      >
        {initial.isPending && <p className="text-white/45">Connexion au flux…</p>}
        {initial.isError && <p className="text-[#ff7b7b]">Flux indisponible : {initial.error.message}</p>}
        {rows.map((l) => (
          <div key={l.id} className="grid grid-cols-[auto_auto_1fr] gap-x-3 hover:bg-white/[0.03] sm:grid-cols-[auto_3.2rem_10rem_1fr]">
            <span className="text-white/40 tabular">{clock(l.at)}</span>
            <span className={cn('uppercase', LEVEL_TONE[l.level])}>{l.level}</span>
            {!agentId && <span className="hidden truncate text-white/55 sm:block">{name(l.agentId)}</span>}
            <span className={cn('break-words', l.level === 'error' ? 'text-[#ffb3b3]' : 'text-white/90', agentId && 'sm:col-span-2')}>
              {l.message}
            </span>
          </div>
        ))}
        {!initial.isPending && rows.length === 0 && <p className="text-white/45">Aucune ligne pour ce filtre. Les nouvelles lignes s’afficheront ici.</p>}
      </div>
    </div>
  )
}
