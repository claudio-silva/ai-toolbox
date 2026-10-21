import { useState } from 'react'
import {
  Activity, ArrowRight, BatteryWarning, Bot, Bug, ChevronRight, Coffee, Crown, FileClock, GitBranch, Inbox, MessageCircleQuestion, Shrink, Sparkles, Timer,
} from 'lucide-react'
import type { LeadInfo, State } from '@/lib/types'
import type { Tab } from '@/lib/persist'
import { pct, span, usd, when } from '@/lib/format'
import { rates } from '@/lib/rates'
import { Duration } from '@/components/Duration'
import { Chip, Empty, HelpBody, HelpButton, Inline, Mono, Note, Panel, Stat, StatusBar, StatusIcon, StatusLegend, Terms } from '@/components/bits'
import { crewNow, elapsedLabel, TimeBar, TimeHelp } from '@/components/TimeSplit'
import { AgentRow } from '@/components/AgentRow'
import { JournalRow } from '@/components/JournalRow'
import type { Doc } from '@/components/DocSheet'
import { LEAD_STATE, leadKey, leadName, modelName } from '@/lib/lead'
import { LeadActions } from '@/components/LeadControls'
import { capital } from '@/lib/format'
import { cn } from '@/lib/utils'

const LEAD_LINE: Record<LeadInfo['state']['state'], string> = {
  working: 'Working', agents: 'Idle while agents work', waiting: 'Waiting for you', stopped: 'Stopped by you', closed: 'Claude Code closed',
}

// A lead, above its subagents: its state and model, which open its conversation, and its controls.
function LeadLine({ state, l, onOpen }: { state: State; l: LeadInfo | null; onOpen: () => void }) {
  const st = l?.state.state ?? state.lead.state
  const busy = st === 'working'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/60 p-1 pr-2">
      <button onClick={onOpen} aria-label="Open the lead's conversation" className="group flex min-w-0 flex-1 basis-56 items-center gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/60">
        <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[oklch(0.6_0.2_320)] text-primary-foreground">
          <Crown className="size-4" />
          {busy && <span className="crew-pulse absolute -top-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-primary" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold">{l ? leadName(state, l) : 'Lead'}</span>
          <span className={cn('truncate text-xs', busy ? 'text-primary' : st === 'waiting' ? 'text-st-progress' : 'text-muted-foreground')}>
            {[LEAD_LINE[st], l?.model && modelName(l.model), l?.effort && capital(l.effort)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>
      <LeadActions lead={l} className="ml-auto" />
    </div>
  )
}

// The leads of other task sets or checkouts, one line each; a click opens one.
function OtherLeads({ state, onAgent }: { state: State; onAgent: (id: string) => void }) {
  const me = state.roster.lead?.session
  const others = state.roster.leads.filter((l) => l.session !== me)
  if (!others.length) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[12px] text-muted-foreground">
      <span>Other leads:</span>
      {others.map((l) => {
        const st = LEAD_STATE[l.state.state]
        return (
          <button key={l.session} onClick={() => onAgent(leadKey(l))} className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground">
            <span className={cn('size-2 shrink-0 rounded-full', st.dot, st.pulse && 'crew-pulse')} />
            <span className="truncate">{l.setTitle ?? l.label}</span>
            <span className={cn(l.state.state === 'waiting' && 'text-st-progress')}>· {st.label.toLowerCase()}</span>
          </button>
        )
      })}
    </div>
  )
}

// A path from the project's root when it is under it.
function relPath(state: State, p: string) {
  return p.startsWith(`${state.repo.root}/`) ? p.slice(state.repo.root.length + 1) : p
}

function SetHero({ state, onTask, onDoc }: { state: State; onTask: (id: string) => void; onDoc: (d: Doc) => void }) {
  const cur = state.current!
  const now = cur.currentTask ? cur.tasks.find((t) => t.id === cur.currentTask) : null
  const nowTime = now ? cur.timing?.perTask.find((p) => p.id === now.id) : undefined
  const nowRate = now ? rates(state).task(now.id) : 0
  const done = cur.total > 0 && cur.accepted === cur.total
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="pointer-events-none absolute -top-24 -right-20 size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-3 px-4 pt-4 pb-4 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Task set
              {cur.where && <Chip className="normal-case">worktree {cur.where}</Chip>}
            </div>
            <button onClick={() => onDoc({ path: cur.file, title: cur.title, sub: cur.rel })} className="text-left text-[17px] leading-snug font-semibold tracking-tight hover:underline hover:decoration-muted-foreground/40 hover:underline-offset-4">
              {cur.title}
            </button>
            {cur.stage && <p className="mt-1 text-[12.5px] text-muted-foreground"><Inline text={cur.stage} /></p>}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="tabular text-3xl leading-none font-semibold tracking-tight">{pct(cur.accepted, cur.total)}</span>
            <span className="tabular mt-1 text-xs text-muted-foreground">{cur.accepted}/{cur.total} accepted</span>
          </div>
        </div>
        <StatusBar counts={cur.counts} total={cur.total} className="h-2.5" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusLegend counts={cur.counts} />
          {cur.branch && (
            <span className="inline-flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
              <GitBranch className="size-3 shrink-0" /><span className="truncate">{cur.branch.split(' ')[0]}</span>
            </span>
          )}
        </div>
        {now && (
          <button onClick={() => onTask(now.id)} className="group flex items-center gap-2.5 rounded-xl border bg-background/60 px-3 py-2 text-left transition-colors hover:bg-accent/60">
            <StatusIcon status={now.status} />
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Now</span>
            <Mono className="font-semibold">{now.id}</Mono>
            <span className="min-w-0 flex-1 truncate text-[13px]">{now.title}</span>
            {nowTime && nowTime.active > 0 && <Duration secs={nowTime.active} live={nowRate > 0} rate={nowRate} className="shrink-0 text-xs text-muted-foreground" />}
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-xl bg-st-accepted/10 px-3 py-2 text-[13px] text-st-accepted">
            <Sparkles className="size-4" /> Every task is accepted.
          </div>
        )}
      </div>
    </section>
  )
}

function TimingMini({ state, goTab }: { state: State; goTab: (t: Tab) => void }) {
  const t = state.current?.timing
  if (!t) return null
  const r = rates(state)
  return (
    <Panel
      title="Timing"
      icon={Timer}
      action={<button onClick={() => goTab('timing')} className="text-xs text-muted-foreground hover:text-foreground">Details →</button>}
      help={<TimeHelp t={t} />}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Duration secs={t.active} live={r.active > 0} className="text-2xl font-semibold tracking-tight" />
        <span className="text-xs text-muted-foreground">crew at work, of {span(t.clock)} elapsed {elapsedLabel(t, state.today)}</span>
      </div>
      <div className="mt-2.5"><TimeBar t={t} r={r} values="time" now={crewNow(state, r)} /></div>
      {t.taskTime > 0 && t.criticalPath.ids.length > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          Critical path <span className="tabular text-foreground">{span(t.criticalPath.seconds)}</span> of <Duration secs={t.taskTime} live={r.taskTime > 0} rate={r.taskTime} /> task time
          {t.criticalPath.headroom >= 1 ? <> · parallel headroom <span className="tabular text-foreground">{span(t.criticalPath.headroom)}</span></> : ' · no parallel headroom'}
        </p>
      )}
    </Panel>
  )
}

function KeepAwake({ state }: { state: State }) {
  const [open, setOpen] = useState(false)
  const k = state.keepAwake
  if (!k) return null
  const text = k.on
    ? `Keeping the Mac awake ${k.mode === '12h' ? 'for 12 hours' : 'while Claude Code runs'}${k.since ? `, since ${when(k.since, state.today)}` : ''}.`
    : `Not keeping the Mac awake: ${
      k.stopped ? 'you stopped the crew.' : state.lead.state === 'closed' ? 'Claude Code is closed.' : 'no crew session has turned it on since Claude Code started.'
    }`
  return (
    <div className="rounded-xl border bg-card px-3.5 py-2.5 text-[12.5px] shadow-xs">
      <div className="flex items-start gap-2.5">
        <Coffee className={k.on ? 'mt-0.5 size-4 shrink-0 text-st-progress' : 'mt-0.5 size-4 shrink-0 text-muted-foreground'} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span>{text}</span>
          {k.on && k.battery && (
            <span className="inline-flex items-center gap-1 text-xs text-st-rework"><BatteryWarning className="size-3.5" /> On battery: macOS may still sleep when the lid closes.</span>
          )}
        </div>
        <HelpButton open={open} onClick={() => setOpen(!open)} />
      </div>
      {open && (
        <HelpBody className="mt-2">
          <p>
            So a long set isn't cut short by the Mac falling asleep, crew holds a macOS <Mono>caffeinate</Mono> assertion while it works: no
            idle sleep, and no system sleep on mains power. The display can still turn off.
          </p>
          <Terms
            items={[
              ['Turns on', <>When the crew starts or resumes (<Mono>crew session start</Mono>, the first thing /crew runs). It watches that Claude Code process.</>],
              ['Turns off', <>When that Claude Code process exits, when you stop the crew (<Mono>/crew stop</Mono>), or never turns on with <Mono>CREW_KEEP_AWAKE=0</Mono> in the environment.</>],
              ['12 hours', 'When crew cannot find the Claude Code process to watch, it holds for 12 hours instead.'],
              ['On battery', 'Closing the lid still sleeps a Mac on battery; keep it open or plugged in.'],
            ]}
          />
          <p>This card shows what crew holds right now, checked at each update of the page (at least once a minute).</p>
        </HelpBody>
      )}
    </div>
  )
}

export function Overview({ state, goTab, onTask, onDoc, onAgent }: {
  state: State
  goTab: (t: Tab) => void
  onTask: (id: string) => void
  onDoc: (d: Doc) => void
  onAgent: (id: string) => void
}) {
  const q = state.queue.counts
  const d = state.defects.summary
  const c = state.compactions?.summary
  const openDefects = d.deferred + d.scheduled
  const recent = state.journal.entries.slice(-8).reverse()
  return (
    <div className="flex flex-col gap-4">
      {state.current ? (
        <SetHero state={state} onTask={onTask} onDoc={onDoc} />
      ) : (
        <Empty icon={FileClock} title="No task set yet">
          The planner writes one under <Mono>.crew/tasks/</Mono> once the plan is agreed. It shows up here as soon as it lands.
        </Empty>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          icon={MessageCircleQuestion}
          label="Questions"
          value={q.openQuestions}
          sub={q.openQuestions ? 'waiting for you' : 'none open'}
          tone={q.openQuestions ? 'warn' : undefined}
          onClick={() => goTab('queue')}
        />
        <Stat
          icon={Inbox}
          label="Requests"
          value={q.queued + q.scheduled}
          sub={q.queued + q.scheduled ? `${q.queued} queued · ${q.scheduled} scheduled` : `${q.done} done`}
          onClick={() => goTab('queue')}
        />
        <Stat
          icon={Bug}
          label="Defects"
          value={openDefects}
          sub={openDefects ? `${d.deferred} deferred${d.deferredMedium ? ` · ${d.deferredMedium} medium` : ''}` : d.total ? `${d.fixed} fixed` : 'none logged'}
          tone={d.deferredMedium ? 'warn' : undefined}
          onClick={() => goTab('defects')}
        />
        <Stat
          icon={Shrink}
          label="Compactions"
          value={c ? c.lead.count + c.sub.count : 0}
          sub={c ? (c.net != null ? `net ${usd(c.net)}` : `lead ${c.lead.count} · agents ${c.sub.count}`) : 'none yet'}
          onClick={() => goTab('compactions')}
        />
      </div>

      <Panel
        title={state.agents.length ? `Live agents · ${state.agents.length}` : 'Live agents'}
        icon={Bot}
        action={<button onClick={() => goTab('agents')} className="text-xs text-muted-foreground hover:text-foreground">Agents →</button>}
      >
        <div className="flex flex-col gap-2">
          <LeadLine state={state} l={state.roster.lead} onOpen={() => onAgent(state.roster.lead ? leadKey(state.roster.lead) : 'lead')} />
          {state.agents.map((a) => <AgentRow key={a.id} agent={a} onTask={onTask} onOpen={() => onAgent(a.id)} />)}
          {!state.agents.length && <p className="px-1 text-[12.5px] text-muted-foreground">No subagents running.</p>}
          <OtherLeads state={state} onAgent={onAgent} />
        </div>
      </Panel>

      <TimingMini state={state} goTab={goTab} />

      <KeepAwake state={state} />

      {state.handoff && (
        <Panel
          title="Handoff"
          icon={FileClock}
          action={<button onClick={() => onDoc({ path: state.handoff!.path, title: 'Crew handoff', sub: `${relPath(state, state.handoff!.path)}${state.handoff!.written ? ` · ${state.handoff!.written}` : ''}` })} className="text-xs text-muted-foreground hover:text-foreground">Open →</button>}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            {state.handoff.written && <><dt className="text-muted-foreground">Written</dt><dd>{state.handoff.written}</dd></>}
            {state.handoff.where && <><dt className="text-muted-foreground">Where</dt><dd><Inline text={state.handoff.where} /></dd></>}
            {state.handoff.next && <><dt className="text-muted-foreground">Next</dt><dd><Inline text={state.handoff.next} /></dd></>}
          </dl>
        </Panel>
      )}

      <Panel title="Recent activity" icon={Activity} action={<button onClick={() => goTab('journal')} className="text-xs text-muted-foreground hover:text-foreground">Journal →</button>}>
        {recent.length ? (
          <div className="divide-y divide-border/60">
            {recent.map((e, i) => <JournalRow key={i} e={e} compact />)}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Nothing in the journal yet.</p>
        )}
      </Panel>

      <Note>
        This page follows the crew's files and updates by itself. The lead never reads it; it is for you.
      </Note>
    </div>
  )
}
