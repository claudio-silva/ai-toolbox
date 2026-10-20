import {
  Activity, ArrowRight, BatteryWarning, Bot, Bug, Coffee, FileClock, GitBranch, Inbox, MessageCircleQuestion, Shrink, Sparkles, Timer,
} from 'lucide-react'
import type { State } from '@/lib/types'
import type { Tab } from '@/lib/persist'
import { hm, pct, span, usd } from '@/lib/format'
import { rates } from '@/lib/rates'
import { Duration } from '@/components/Duration'
import { Chip, Empty, Inline, Mono, Note, Panel, Stat, StatusBar, StatusIcon, StatusLegend } from '@/components/bits'
import { AgentRow } from '@/components/AgentRow'
import { JournalRow } from '@/components/JournalRow'
import type { Doc } from '@/components/DocSheet'

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
  const parts = [
    { k: 'busy', v: t.busy, rate: r.busy, cls: 'bg-ph-build', label: 'agents at work' },
    { k: 'idle', v: t.idle, rate: r.idle, cls: 'bg-st-progress/60', label: 'lead and waiting' },
    { k: 'slept', v: t.slept, rate: 0, cls: 'bg-sleep', label: 'asleep' },
  ]
  const sum = t.busy + t.idle + t.slept
  return (
    <Panel title="Timing" icon={Timer} action={<button onClick={() => goTab('timing')} className="text-xs text-muted-foreground hover:text-foreground">Details →</button>}>
      <div className="flex items-baseline gap-2">
        <Duration secs={t.clock} live={r.clock > 0} className="text-2xl font-semibold tracking-tight" />
        <span className="text-xs text-muted-foreground">
          on the clock since {hm(t.t0)}{t.until ? `, to ${hm(t.until)}` : ''}
        </span>
      </div>
      <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {sum > 0 && parts.map((p) => p.v > 0 && <div key={p.k} className={`h-full ${p.cls}`} style={{ width: `${(p.v * 100) / sum}%` }} title={`${p.label} ${span(p.v)}`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.k} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${p.cls}`} />{p.label} <Duration secs={p.v} live={p.rate > 0} className="text-foreground" /></span>
        ))}
      </div>
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
  const k = state.keepAwake
  if (!k) return null
  const text = k.on
    ? k.mode === '12h' ? 'Keeping the Mac awake for 12 hours (no Claude process to watch).' : 'Keeping the Mac awake while Claude runs.'
    : k.stopped ? 'Not keeping the Mac awake: you stopped the run.' : 'Not keeping the Mac awake.'
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-[12.5px] shadow-xs">
      <Coffee className={k.on ? 'mt-0.5 size-4 shrink-0 text-st-progress' : 'mt-0.5 size-4 shrink-0 text-muted-foreground'} />
      <div className="flex flex-col gap-0.5">
        <span>{text}</span>
        {k.on && k.battery && (
          <span className="inline-flex items-center gap-1 text-xs text-st-rework"><BatteryWarning className="size-3.5" /> On battery: macOS may still sleep when the lid closes.</span>
        )}
      </div>
    </div>
  )
}

export function Overview({ state, goTab, onTask, onDoc }: {
  state: State
  goTab: (t: Tab) => void
  onTask: (id: string) => void
  onDoc: (d: Doc) => void
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

      <Panel title={state.agents.length ? `Live agents · ${state.agents.length}` : 'Live agents'} icon={Bot}>
        {state.agents.length ? (
          <div className="flex flex-col gap-2">
            {state.agents.map((a) => <AgentRow key={a.id} agent={a} onTask={onTask} />)}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">No agents running.</p>
        )}
      </Panel>

      <TimingMini state={state} goTab={goTab} />

      <KeepAwake state={state} />

      {state.handoff && (
        <Panel
          title="Handoff"
          icon={FileClock}
          action={<button onClick={() => onDoc({ path: state.handoff!.path, title: 'Crew handoff', sub: `.crew/handoff.md${state.handoff!.written ? ` · ${state.handoff!.written}` : ''}` })} className="text-xs text-muted-foreground hover:text-foreground">Open →</button>}
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
