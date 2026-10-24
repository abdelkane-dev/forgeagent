import { Download, RefreshCw } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { api } from '@/api'
import { keys, useAction, useDocs } from '@/api/hooks'
import { CopyButton } from '@/components/common/copy-button'
import { Panel, Section } from '@/components/common/page'
import { LoadingBlock } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { relative } from '@/lib/format'
import type { TabProps } from '.'
import { can } from './shared'

/** Minimal markdown for generated docs: headings, lists, quotes, code fences, **bold**, `code`. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part.startsWith('`') ? <code key={i} className="rounded bg-secondary px-1 font-mono text-[13px]">{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
  )
}

function Markdown({ source }: { source: string }) {
  const out: ReactNode[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('```')) {
      const code: string[] = []
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      out.push(<pre key={i} className="my-3 overflow-x-auto rounded-md bg-[#120e0b] p-4 font-mono text-[12.5px] leading-relaxed text-[#efe7df]">{code.join('\n')}</pre>)
    } else if (l.startsWith('# ')) out.push(<h1 key={i} className="mb-3 text-[24px] font-bold tracking-[-0.03em]">{l.slice(2)}</h1>)
    else if (l.startsWith('## ')) out.push(<h2 key={i} className="mt-6 mb-2 text-[17px] font-semibold">{l.slice(3)}</h2>)
    else if (l.startsWith('> ')) out.push(<blockquote key={i} className="my-2 border-l-2 border-ember pl-3 text-muted-foreground">{inline(l.slice(2))}</blockquote>)
    else if (l.startsWith('- ')) out.push(<li key={i} className="ml-5 list-disc">{inline(l.slice(2))}</li>)
    else if (l.trim()) out.push(<p key={i} className="my-2">{inline(l)}</p>)
  }
  return <div className="text-[14.5px] leading-relaxed">{out}</div>
}

export default function DocsTab({ agent }: TabProps) {
  const docs = useDocs(agent.id)
  const regen = useAction(() => api.docs.regenerate(agent.id), { invalidate: [keys.of(agent.id, 'docs')], success: 'Documentation régénérée' })
  if (docs.isPending) return <LoadingBlock />
  const doc = docs.data?.current
  const save = () => {
    if (!doc) return
    const url = URL.createObjectURL(new Blob([doc.markdown], { type: 'text/markdown' }))
    Object.assign(document.createElement('a'), { href: url, download: `${agent.id}-v${doc.version}.md` }).click()
    URL.revokeObjectURL(url)
  }
  return (
    <Section
      title="Documentation générée"
      meta={doc ? `v${doc.version} · ${relative(doc.generatedAt)}` : undefined}
      description="Rédigée automatiquement à partir de la configuration, des intégrations et des évaluations de cet agent, à chaque changement."
      action={
        <div className="flex gap-2">
          {doc && <CopyButton text={doc.markdown} />}
          <Button variant="outline" size="sm" onClick={save} disabled={!doc}>
            <Download /> Markdown
          </Button>
          {can(agent, 'editor') && (
            <Button variant="outline" size="sm" onClick={() => regen.mutate(undefined)} disabled={regen.isPending}>
              <RefreshCw /> Régénérer
            </Button>
          )}
        </div>
      }
    >
      <Panel className="max-w-[860px] p-6 md:p-8">{doc ? <Markdown source={doc.markdown} /> : <p className="text-muted-foreground">Pas encore de documentation.</p>}</Panel>
    </Section>
  )
}
