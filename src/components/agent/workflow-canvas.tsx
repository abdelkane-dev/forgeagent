import { useRef, type PointerEvent as RPointerEvent } from 'react'
import type { WorkflowNode, WorkflowNodeKind } from '@/api/types'
import { NODE_KINDS } from '@/labels'
import { cn } from '@/lib/utils'

type Wf = { nodes: WorkflowNode[] }

export const NODE_W = 200
const NODE_H = 64
const KIND_MARK: Record<WorkflowNodeKind, string> = {
  trigger: 'bg-muted-foreground',
  model: 'bg-ember',
  condition: 'bg-warn',
  approval: 'bg-warn',
  tool: 'bg-foreground',
  output: 'bg-ok',
}

/** Drag-and-drop canvas of one workflow's steps (keyboard: arrows move, Delete removes). */
export function WorkflowCanvas<T extends Wf>({ wf, setWf, selected, setSelected, running }: { wf: T; setWf: (w: T) => void; selected: string | null; setSelected: (id: string | null) => void; running: number }) {
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const height = Math.max(320, ...wf.nodes.map((n) => n.y + NODE_H + 40))

  const move = (id: string, x: number, y: number) => setWf({ ...wf, nodes: wf.nodes.map((n) => (n.id === id ? { ...n, x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) } : n)) })

  const onDown = (e: RPointerEvent, n: WorkflowNode) => {
    const rect = area.current!.getBoundingClientRect()
    drag.current = { id: n.id, dx: e.clientX - rect.left + area.current!.scrollLeft - n.x, dy: e.clientY - rect.top + area.current!.scrollTop - n.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setSelected(n.id)
  }
  const onMove = (e: RPointerEvent) => {
    if (!drag.current) return
    const rect = area.current!.getBoundingClientRect()
    move(drag.current.id, e.clientX - rect.left + area.current!.scrollLeft - drag.current.dx, e.clientY - rect.top + area.current!.scrollTop - drag.current.dy)
  }

  return (
    <div ref={area} className="scrollbar-thin relative overflow-auto rounded-lg bg-card" style={{ height: Math.min(height + 8, 520) }} data-ui>
      <div className="relative min-w-[820px]" style={{ height }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {wf.nodes.slice(1).map((n, i) => {
            const a = wf.nodes[i]
            const x1 = a.x + NODE_W
            const y1 = a.y + NODE_H / 2
            const x2 = n.x
            const y2 = n.y + NODE_H / 2
            const mid = (x1 + x2) / 2
            const active = running > i
            return (
              <path
                key={n.id}
                d={x2 > x1 ? `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}` : `M${a.x + NODE_W / 2} ${a.y + NODE_H} C${a.x + NODE_W / 2} ${a.y + NODE_H + 40} ${n.x + NODE_W / 2} ${n.y - 40} ${n.x + NODE_W / 2} ${n.y}`}
                fill="none"
                stroke={active ? 'var(--ember)' : 'var(--input)'}
                strokeWidth={2}
                className="transition-[stroke] duration-300"
              />
            )
          })}
        </svg>
        {wf.nodes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            onPointerDown={(e) => onDown(e, n)}
            onKeyDown={(e) => {
              const d = e.shiftKey ? 40 : 8
              const k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key]
              if (k) {
                e.preventDefault()
                move(n.id, n.x + k[0], n.y + k[1])
              }
              if (e.key === 'Delete') setWf({ ...wf, nodes: wf.nodes.filter((x) => x.id !== n.id) })
            }}
            onFocus={() => setSelected(n.id)}
            aria-label={`${NODE_KINDS[n.kind]} : ${n.label}. Flèches pour déplacer.`}
            className={cn(
              'absolute flex cursor-grab touch-none flex-col justify-center rounded-md bg-raised px-3 text-left transition-[box-shadow,background-color] active:cursor-grabbing',
              selected === n.id && 'ring-2 ring-foreground',
              running === i && 'bg-ember text-ember-ink',
            )}
            style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
          >
            <span className={cn('flex items-center gap-1.5 text-[12px]', running === i ? 'text-ember-ink/80' : 'text-muted-foreground')}>
              <span className={cn('hex size-2', running === i ? 'bg-ember-ink' : KIND_MARK[n.kind])} /> {NODE_KINDS[n.kind]}
            </span>
            <span className="truncate text-[14px] font-medium">{n.label}</span>
          </button>
        ))}
        {wf.nodes.length === 0 && <p className="absolute inset-0 grid place-items-center text-[14px] text-muted-foreground">Ajoutez une première étape avec les boutons ci-dessus.</p>}
      </div>
    </div>
  )
}

