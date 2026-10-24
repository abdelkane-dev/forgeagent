import { ArrowUpRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAgents, useForgeAgents, useForgeRequest, useForgeRequests, useMyApprovals } from '@/api/hooks'
import type { TeamAgentInfo, TeamRequest, TeamRole } from '@/api/types'
import { Crest } from '@/components/brand/crest'
import { LinkButton } from '@/components/common/link-button'
import { PageHeader, Panel, Section } from '@/components/common/page'
import { EmptyState, LoadingBlock } from '@/components/common/states'
import { StatusDot, Tag } from '@/components/common/status'
import { clock, compact, duration, relative, usd } from '@/lib/format'
import { L, MODELS, TEAM, TEAM_ORDER } from '@/labels'
import { cn } from '@/lib/utils'

const REQ: Record<TeamRequest['status'], { label: string; tone: 'ok' | 'warn' | 'danger' | 'ember' | 'muted' }> = {
  running: { label: 'En cours', tone: 'ember' },
  awaiting_approval: { label: 'Validation attendue', tone: 'warn' },
  done: { label: 'Terminée', tone: 'ok' },
  failed: { label: 'Échec', tone: 'danger' },
  vetoed: { label: 'Refusée par la Sentinelle', tone: 'danger' },
  stopped: { label: 'Arrêtée (limite)', tone: 'danger' },
}
const modelName = (m: string) => MODELS[m as keyof typeof MODELS]?.label ?? m
const who = (r: string) => (r in TEAM ? TEAM[r as TeamRole].name : r === 'user' ? 'Vous' : r === 'system' ? 'Système' : r)

function Member({ info }: { info: TeamAgentInfo }) {
  const t = TEAM[info.role]
  const working = info.status === 'working'
  return (
    <Panel className={cn('relative grid gap-3 p-5', working && 'glow-molten')}>
      <div className="flex items-start gap-3">
        <Crest role={info.role} active={working} />
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-semibold">{t.name}</h3>
          <p className="text-[13px] text-muted-foreground">{t.role}</p>
          <p className="mt-1 text-[13px] italic" style={{ color: t.accent }}>
            « {t.motto} »
          </p>
        </div>
      </div>
      <p className="text-[13.5px] text-muted-foreground">{t.mission}</p>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <StatusDot tone={working ? 'ember' : info.status === 'queued' ? 'warn' : 'muted'} pulse={working} />
          {working ? 'Au travail' : info.status === 'queued' ? 'En file' : 'Disponible'}
        </span>
        <Tag>{modelName(info.model)}</Tag>
        {info.escalationModel && <Tag>anomalie : {modelName(info.escalationModel)}</Tag>}
      </div>
      {info.currentTask ? (
        <Link to={`/app/agents/${info.currentTask.agentId}?tab=overview`} className="flex items-center gap-2 rounded-md bg-ember/10 px-3 py-2 text-[13.5px] hover:bg-ember/15">
          <span className="min-w-0 flex-1 truncate">
            Travaille sur <b className="font-semibold">{info.currentTask.agentName}</b>
          </span>
          <ArrowUpRight className="size-3.5" />
        </Link>
      ) : (
        <p className="rounded-md bg-secondary/50 px-3 py-2 text-[13.5px] text-muted-foreground">Aucune tâche en cours sur vos agents.</p>
      )}
      <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
        <div>
          <dt className="text-muted-foreground">Tokens</dt>
          <dd className="text-[15px] font-semibold tabular">{compact(info.tokens)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Coût</dt>
          <dd className="text-[15px] font-semibold tabular">{usd(info.cost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Tâches</dt>
          <dd className="text-[15px] font-semibold tabular">
            {info.tasksDone}
            {info.tasksFailed > 0 && <span className="text-danger"> · {info.tasksFailed} ✗</span>}
          </dd>
        </div>
      </dl>
      <p className="font-mono text-[11.5px] text-muted-foreground">{info.capabilities.join(' · ')}</p>
    </Panel>
  )
}

function Replay({ agentId, requestId }: { agentId: string; requestId: string }) {
  const q = useForgeRequest(agentId, requestId)
  if (q.isPending) return <LoadingBlock />
  if (!q.data) return null
  const { request, tasks, events } = q.data
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Section title="Tâches" meta={`${tasks.length}`} className="mb-0">
        <Panel className="divide-y">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
              <StatusDot tone={t.status === 'done' ? 'ok' : t.status === 'running' ? 'ember' : t.status === 'queued' ? 'warn' : 'danger'} pulse={t.status === 'running'} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{TEAM[t.role].name}</span> <span className="text-muted-foreground">· {TEAM[t.role].role}</span>
              </span>
              <span className="text-muted-foreground tabular">{compact(t.tokens)} tok.</span>
              <span className="hidden text-muted-foreground tabular sm:inline">{duration(t.durationMs)}</span>
            </div>
          ))}
        </Panel>
      </Section>
      <Section title="Échanges" meta={`rejouables · ${events.length}`} className="mb-0">
        <ol className="scrollbar-thin max-h-[420px] overflow-y-auto rounded-lg bg-[#120e0b] px-4 py-3 font-mono text-[12.5px] leading-[1.8] text-[#efe7df]" aria-label="Échanges dans l’ordre">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-white/40">{clock(e.at)}</span> <span className="text-[#f5a25a]">{who(e.fromRole)}</span>
              {e.toRole && <span className="text-white/50"> → {who(e.toRole)}</span>} <span>{e.type}</span>
            </li>
          ))}
        </ol>
        {request.error && <p className="mt-3 text-[13.5px] text-danger">{request.error}</p>}
      </Section>
    </div>
  )
}

export default function Forge() {
  const team = useForgeAgents()
  const requests = useForgeRequests()
  const approvals = useMyApprovals()
  const agents = useAgents()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<{ agentId: string; id: string } | null>(params.get('request') && params.get('agent') ? { agentId: params.get('agent')!, id: params.get('request')! } : null)
  const pending = approvals.data?.filter((a) => a.source === 'team') ?? []

  return (
    <>
      <PageHeader
        title={L.forge.title}
        description={L.forge.description}
        actions={
          <LinkButton to="/app/agents/new" className="glow-molten bg-ember text-ember-ink hover:bg-ember/90">
            <Plus /> {L.forge.newRequest}
          </LinkButton>
        }
      />

      {pending.length > 0 && (
        <Section title="Validations humaines en attente" meta={`${pending.length}`}>
          <Panel className="divide-y">
            {pending.map((a) => (
              <Link key={a.id} to={`/app/agents/${a.agentId}?tab=overview`} className="flex items-center gap-3 px-4 py-3 text-[14px] hover:bg-raised">
                <StatusDot tone="warn" pulse />
                <span className="min-w-0 flex-1">
                  <b className="font-medium">{a.action}</b> <span className="text-muted-foreground">· {a.reason}</span>
                </span>
                <span className="text-[13px] text-muted-foreground">{agents.data?.find((x) => x.id === a.agentId)?.name}</span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </Panel>
        </Section>
      )}

      <Section title="L’équipe" meta="activité sur vos agents uniquement">
        {team.isPending ? (
          <LoadingBlock />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {TEAM_ORDER.map((r) => {
              const info = team.data?.find((x) => x.role === r)
              return info ? <Member key={r} info={info} /> : null
            })}
          </div>
        )}
      </Section>

      <Section title="Demandes" meta={requests.data ? `${requests.data.length}` : undefined}>
        {!requests.data?.length ? (
          <EmptyState title="Aucune demande" description="Demandez à La Forge de construire un agent : elle le conçoit, le contrôle, le construit, le teste et le surveille." />
        ) : (
          <Panel className="divide-y">
            {requests.data.map((r) => (
              <div key={r.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left text-[14px] hover:bg-raised"
                  aria-expanded={open?.id === r.id}
                  onClick={() => {
                    const next = open?.id === r.id ? null : { agentId: r.agentId, id: r.id }
                    setOpen(next)
                    setParams(next ? { agent: next.agentId, request: next.id } : {})
                  }}
                >
                  <StatusDot tone={REQ[r.status].tone} pulse={r.status === 'running'} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.agentName}</span>{' '}
                    <span className="text-muted-foreground">· {r.kind === 'create_agent' ? 'construction' : 'surveillance'}</span>
                  </span>
                  <Tag>{REQ[r.status].label}</Tag>
                  <span className="text-muted-foreground tabular">
                    {r.steps} étapes · {compact(r.tokens)} tok. · {usd(r.cost)}
                  </span>
                  <span className="hidden w-28 text-right text-muted-foreground sm:inline">{relative(r.createdAt)}</span>
                </button>
                {open?.id === r.id && (
                  <div className="px-4 pb-5">
                    <Replay agentId={r.agentId} requestId={r.id} />
                  </div>
                )}
              </div>
            ))}
          </Panel>
        )}
      </Section>
    </>
  )
}
