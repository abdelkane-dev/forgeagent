import { Fragment, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CopyButton } from './copy-button'

/** Minimal tokenizer: strings, comments, keywords, numbers. Enough for snippets, no dependency. */
const RULES: [RegExp, string][] = [
  [/^(\/\/[^\n]*|#[^\n]*)/, 'text-muted-foreground'],
  [/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/, 'text-ok'],
  [/^\b(import|from|const|let|await|async|new|return|export|def|print|curl|npm|npx|pip|docker|git|cd)\b/, 'text-cobalt'],
  [/^\b(\d+(?:\.\d+)?)\b/, 'text-warn'],
  [/^(<\/?[a-zA-Z][\w-]*|\/?>)/, 'text-cobalt'],
]

function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  let rest = code
  let plain = ''
  let k = 0
  while (rest.length) {
    let matched = false
    for (const [re, cls] of RULES) {
      const m = rest.match(re)
      if (m) {
        if (plain) {
          out.push(<Fragment key={k++}>{plain}</Fragment>)
          plain = ''
        }
        out.push(
          <span key={k++} className={cls}>
            {m[0]}
          </span>,
        )
        rest = rest.slice(m[0].length)
        matched = true
        break
      }
    }
    if (!matched) {
      plain += rest[0]
      rest = rest.slice(1)
    }
  }
  if (plain) out.push(<Fragment key={k++}>{plain}</Fragment>)
  return out
}

export interface Snippet {
  id: string
  label: string
  code: string
}

/** Code block with optional language tabs and a copy button. */
export function CodeBlock({
  snippets,
  className,
  title,
}: {
  snippets: Snippet[] | string
  className?: string
  title?: string
}) {
  const list = typeof snippets === 'string' ? [{ id: 'code', label: title ?? '', code: snippets }] : snippets
  const [active, setActive] = useState(list[0].id)
  const current = list.find((s) => s.id === active) ?? list[0]

  return (
    <div className={cn('overflow-hidden rounded-lg bg-[#0e1013] text-[#e6e8ec] dark:bg-[#08090b]', className)} data-ui>
      <div className="flex h-10 items-center justify-between gap-2 bg-white/[0.04] pr-1.5 pl-1">
        <div className="flex min-w-0 gap-0.5 overflow-x-auto" role={list.length > 1 ? 'tablist' : undefined}>
          {list.length > 1
            ? list.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  type="button"
                  aria-selected={s.id === active}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    'h-8 shrink-0 rounded-md px-2.5 text-[13px] font-medium transition-colors',
                    s.id === active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white',
                  )}
                >
                  {s.label}
                </button>
              ))
            : current.label && <span className="px-2.5 text-[13px] font-medium text-white/60">{current.label}</span>}
        </div>
        <CopyButton text={current.code} className="text-white/70 hover:bg-white/10 hover:text-white" />
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-4 text-[13px] leading-[1.7]">
        <code>{highlight(current.code)}</code>
      </pre>
    </div>
  )
}
