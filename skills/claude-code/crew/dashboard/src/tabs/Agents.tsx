// The crew's agents and what they said: the lead first (the only one the founder can write
// to), then the running subagents, then the finished ones. The selected one's transcript fills
// the rest, and follows it as it grows.

import type { ReactNode } from 'react'
import { Bot, ChevronDown, Crown, LoaderCircle } from 'lucide-react'
import type { Agent, PastAgent, State } from '@/lib/types'
import { useClockBase } from '@/lib/clock'
import { contextOf, leadBlocker, modelName, useTranscript } from '@/lib/lead'
import { modelShort, when } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Mono } from '@/components/bits'
import { Duration } from '@/components/Duration'
import { Transcript } from '@/components/Transcript'
import { Composer } from '@/components/Composer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const LEAD_STATE: Record<State['lead']['state'], { label: string; dot: string; pulse?: boolean }> = {
  working: { label: 'Working', dot: 'bg-primary', pulse: true },
  agents: { label: 'Idle, agents working', dot: 'bg-st-review' },
  waiting: { label: 'Waiting for you', dot: 'bg-st-progress' },
  stopped: { label: 'Stopped by you', dot: 'bg-muted-foreground/60' },
  closed: { label: 'Claude Code closed', dot: 'bg-muted-foreground/40' },
}

const STATUS_TONE: Record<string, string> = {
  ACCEPT: 'text-st-accepted', DONE: 'text-st-accepted', finished: 'text-st-accepted',
  CHANGES: 'text-st-rework', PARTIAL: 'text-st-progress', BLOCKED: 'text-st-blocked', interrupted: 'text-muted-foreground',
}

function Avatar({ icon: Icon, tone, dot, pulse }: { icon: typeof Bot; tone: string; dot?: string; pulse?: boolean }) {
  return (
    <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-lg', tone)}>
      <Icon className="size-4" />
      {dot && <span className={cn('absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card', dot, pulse && 'crew-pulse')} />}
    </span>
  )
}

function Row({ active, onClick, avatar, title, sub, side, muted }: {
  active: boolean; onClick: () => void; avatar: ReactNode; title: ReactNode; sub: ReactNode; side?: ReactNode; muted?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active || undefined}
      className={cn(
        'flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/60',
        muted && !active && 'opacity-70 hover:opacity-100',
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{title}</span>
          {side && <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground tabular">{side}</span>}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">{sub}</span>
      </span>
    </button>
  )
}

function LeadRow({ state, active, onClick }: { state: State; active: boolean; onClick: () => void }) {
  const l = state.roster.lead
  const st = LEAD_STATE[state.lead.state]
  return (
    <Row
      active={active}
      onClick={onClick}
      avatar={<Avatar icon={Crown} tone="bg-gradient-to-br from-primary to-[oklch(0.6_0.2_320)] text-primary-foreground" dot={st.dot} pulse={st.pulse} />}
      title="Lead"
      sub={[st.label, l?.model ? modelName(l.model) : ''].filter(Boolean).join(' · ')}
    />
  )
}

function LiveRow({ a, active, onClick }: { a: Agent; active: boolean; onClick: () => void }) {
  const base = useClockBase()
  const start = a.runStart || a.started
  return (
    <Row
      active={active}
      onClick={onClick}
      avatar={<Avatar icon={Bot} tone="bg-primary/10 text-primary" dot="bg-primary" pulse />}
      title={agentTitle(a)}
      side={start ? <Duration secs={Math.max(0, base - start)} live /> : a.since}
      sub={[a.task, a.type].filter(Boolean).join(' · ')}
    />
  )
}

function PastRow({ a, active, onClick, today }: { a: PastAgent; active: boolean; onClick: () => void; today: string }) {
  return (
    <Row
      active={active}
      onClick={onClick}
      muted
      avatar={<Avatar icon={Bot} tone="bg-muted text-muted-foreground" />}
      title={agentTitle(a)}
      side={a.ended ? when(a.ended, today) : ''}
      sub={<><span className={STATUS_TONE[a.status] ?? ''}>{a.status || 'ended'}</span>{[a.task, a.type].filter(Boolean).map((x) => ` · ${x}`).join('')}</>}
    />
  )
}

// What to call an agent: its name, else what it was sent to do (less the task id shown beside it).
function agentTitle(a: Agent | PastAgent): string {
  return a.name || a.description.replace(/^[Tt]0*[0-9]+\s*/, '') || a.type
}

function Section({ children, n }: { children: ReactNode; n: number }) {
  return <div className="px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">{children} · {n}</div>
}

function AgentList({ state, sel, pick }: { state: State; sel: string; pick: (id: string) => void }) {
  const { agents, roster } = state
  return (
    <div className="flex flex-col gap-0.5 p-2">
      <LeadRow state={state} active={sel === 'lead'} onClick={() => pick('lead')} />
      <Section n={agents.length}>Running</Section>
      {agents.length ? agents.map((a) => <LiveRow key={a.id} a={a} active={sel === a.id} onClick={() => pick(a.id)} />)
        : <p className="px-2 pb-1 text-[11.5px] text-muted-foreground">None right now.</p>}
      {roster.past.length > 0 && (
        <>
          <Section n={roster.past.length}>Finished</Section>
          {roster.past.map((a) => <PastRow key={a.id} a={a} active={sel === a.id} onClick={() => pick(a.id)} today={state.today} />)}
        </>
      )}
    </div>
  )
}

// The selected agent: who it is, above its transcript.
function PaneHead({ state, sel, pick, onTask }: { state: State; sel: string; pick: (id: string) => void; onTask: (id: string) => void }) {
  const live = state.agents.find((a) => a.id === sel)
  const past = state.roster.past.find((a) => a.id === sel)
  const a = live ?? past
  const l = state.roster.lead
  const title = sel === 'lead' ? 'Lead' : a ? agentTitle(a) : sel
  const chips: ReactNode[] = []
  if (sel === 'lead') {
    chips.push(<Chip key="s">{LEAD_STATE[state.lead.state].label}</Chip>)
    if (l?.reach) chips.push(<Chip key="r" title="How the dashboard's messages reach the lead">{l.reach === 'paseo' ? 'via Paseo' : 'via inbox'}</Chip>)
  } else if (a) {
    chips.push(<Chip key="t">{a.type}</Chip>)
    // An agent the lead started without a model or effort runs on the session's; no chip says "default".
    if (a.model && a.model !== 'default') chips.push(<Chip key="m">{modelShort(a.model)}</Chip>)
    if (a.effort && a.effort !== 'default') chips.push(<Chip key="e">{a.effort}</Chip>)
    chips.push(<Chip key="st" className={live ? 'text-primary' : STATUS_TONE[past!.status]}>{live ? 'running' : past!.status || 'ended'}</Chip>)
  }
  const task = a?.task
  return (
    <div className="flex items-start gap-2 border-b px-3 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 rounded-md text-[14px] font-semibold md:pointer-events-none">
                {title}<ChevronDown className="size-4 text-muted-foreground md:hidden" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[60dvh] w-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => pick('lead')}>Lead</DropdownMenuItem>
              {state.agents.length > 0 && <DropdownMenuLabel>Running</DropdownMenuLabel>}
              {state.agents.map((x) => <DropdownMenuItem key={x.id} onSelect={() => pick(x.id)}>{agentTitle(x)} <span className="truncate text-muted-foreground">{x.task}</span></DropdownMenuItem>)}
              {state.roster.past.length > 0 && <DropdownMenuLabel>Finished</DropdownMenuLabel>}
              {state.roster.past.map((x) => <DropdownMenuItem key={x.id} onSelect={() => pick(x.id)} className="text-muted-foreground">{agentTitle(x)} <span className="truncate">{x.task}</span></DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          {task && <button onClick={() => onTask(task)} className="font-mono text-[12px] font-semibold hover:underline">{task}</button>}
          <div className="flex flex-wrap gap-1">{chips}</div>
        </div>
        {a?.description && a.name && <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{a.description}</p>}
        {sel !== 'lead' && <p className="mt-0.5 text-[10.5px] text-muted-foreground">Agent <Mono className="text-[10.5px]">{sel}</Mono></p>}
      </div>
    </div>
  )
}

export function Agents({ state, sel, pick, onTask }: { state: State; sel: string; pick: (id: string) => void; onTask: (id: string) => void }) {
  const known = sel === 'lead' || state.agents.some((a) => a.id === sel) || state.roster.past.some((a) => a.id === sel)
  const id = known ? sel : 'lead'
  const lead = state.roster.lead
  // A new lead session (or its first record) means another transcript: read it again.
  const { entries, status, more, earlier } = useTranscript(id, id === 'lead' ? lead?.session ?? '' : '')
  const empty = status === 'loading' ? <LoaderCircle className="size-4 animate-spin" />
    : status === 'error' ? 'Could not read the transcript.'
      : status === 'missing'
        ? id === 'lead' ? 'No transcript recorded for the lead yet: it appears once /crew runs in a session.' : "This agent's transcript is not available."
        : 'Nothing said yet.'
  return (
    <div className="flex h-[calc(100dvh-var(--header-h)-1.75rem)] min-h-[26rem] overflow-hidden rounded-2xl border bg-card shadow-xs">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r bg-muted/20 md:block">
        <AgentList state={state} sel={id} pick={pick} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <PaneHead state={state} sel={id} pick={pick} onTask={onTask} />
        <Transcript key={id} entries={entries} more={more} earlier={earlier} empty={empty} />
        {id === 'lead' && lead && <Composer lead={lead} used={contextOf(entries)} why={leadBlocker(state)} />}
        {id === 'lead' && !lead && <p className="border-t px-5 py-3 text-[12px] text-muted-foreground">{leadBlocker(state)}</p>}
      </section>
    </div>
  )
}
