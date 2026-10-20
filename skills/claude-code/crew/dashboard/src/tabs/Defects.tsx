import type { ReactNode } from 'react'
import { Bug, ChevronRight, Flame, MapPin } from 'lucide-react'
import type { Defect, State, Task } from '@/lib/types'
import { dayLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Empty, Explain, HelpHead, Inline, Mono, Panel, Stat, StatusIcon, Terms } from '@/components/bits'

const STATE_CLS: Record<string, string> = {
  deferred: 'bg-st-progress/16 text-st-progress',
  scheduled: 'bg-st-review/14 text-st-review',
  fixed: 'bg-st-accepted/14 text-st-accepted',
  dropped: 'bg-muted text-muted-foreground',
}

const SEVERITY_CLS: Record<string, string> = {
  medium: 'bg-st-progress/14 text-st-progress',
  high: 'bg-st-rework/14 text-st-rework',
}

function StatePill({ state }: { state: string }) {
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium', STATE_CLS[state] ?? 'bg-muted text-muted-foreground')}>{state || 'logged'}</span>
}

function Severity({ s }: { s: string }) {
  return <span className={cn('rounded-md px-1.5 py-0 text-[10.5px] font-semibold uppercase', SEVERITY_CLS[s] ?? 'bg-muted text-muted-foreground')}>{s}</span>
}

function Promoted() {
  return <span className="inline-flex items-center gap-1 rounded-md bg-st-rework/14 px-1.5 text-[10.5px] font-semibold text-st-rework"><Flame className="size-3" />promoted</span>
}

function Where({ children }: { children: ReactNode }) {
  return (
    <Chip className="max-w-full gap-1 py-0 text-[10.5px] whitespace-normal">
      <MapPin className="size-3 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </Chip>
  )
}

// "logged today", "logged yesterday", "logged Tue, Oct 20".
function logged(date: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const l = dayLabel(date, today)
  return `logged ${l === 'Today' || l === 'Yesterday' ? l.toLowerCase() : l}`
}

// A note that names a task of the set ("as T13") links to it, with the task's status.
function NoteText({ note, tasks, onTask }: { note: string; tasks: Task[]; onTask: (id: string) => void }) {
  const m = /\bT\d{2,}\b/.exec(note)
  const task = m ? tasks.find((t) => t.id === m[0]) : undefined
  if (!m || !task) return <span className="text-[10.5px] text-muted-foreground"><Inline text={note} /></span>
  return (
    <span className="text-[10.5px] text-muted-foreground">
      {note.slice(0, m.index)}
      <button onClick={() => onTask(task.id)} className="rounded px-0.5 font-mono font-semibold text-foreground hover:bg-accent">
        <StatusIcon status={task.status} className="mr-0.5 inline size-3 align-[-2px]" />{task.id}
      </button>
      {note.slice(m.index + m[0].length)}
    </span>
  )
}

function DefectRow({ d, today, tasks, onTask }: { d: Defect; today: string; tasks: Task[]; onTask: (id: string) => void }) {
  const closed = d.state === 'fixed' || d.state === 'dropped'
  // A hand-written status may carry its own note: "scheduled (as T13)".
  const statusNote = d.status && d.status !== d.state ? d.status.slice(d.state.length).replace(/^[\s(]+|\)$/g, '') : ''
  const note = d.note || statusNote
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline gap-2">
        <Mono className="shrink-0 font-semibold">{d.id}</Mono>
        <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', closed && 'text-muted-foreground')}><Inline text={d.text} /></span>
        <StatePill state={d.state} />
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-8">
        {d.severity && <Severity s={d.severity} />}
        {d.promoted && <Promoted />}
        {d.where && <Where><Inline text={d.where} /></Where>}
        {d.from && <Chip className="py-0 text-[10.5px]">found in {d.from}</Chip>}
        {d.state === 'deferred' && <Chip className="py-0 text-[10.5px]">due: {d.slot || 'end of set'}</Chip>}
        {note && <NoteText note={note} tasks={tasks} onTask={onTask} />}
        <span className="text-[10.5px] text-muted-foreground">· {logged(d.date, today)}</span>
      </div>
    </li>
  )
}

function Legend() {
  return (
    <Explain title="What the labels mean">
      <p>
        A review or QA finding is fixed in its task when it matters: high severity, or something other work builds on. Otherwise it is a
        leaf (minor, on a surface no pending task touches, failing safely) and the lead may defer it here, in <Mono>.crew/defects.md</Mono>,
        and accept the task with it.
      </p>
      <HelpHead>Status</HelpHead>
      <Terms
        items={[
          [<StatePill state="deferred" />, 'Logged and left for later. It waits for the end of its set (the "due" label).'],
          [<StatePill state="scheduled" />, 'A task has been given the fix; the note names it ("as T13") and links to it.'],
          [<StatePill state="fixed" />, 'The fix was accepted.'],
          [<StatePill state="dropped" />, 'Closed without a fix (no longer relevant, or not worth it); the note or the journal says why.'],
        ]}
      />
      <HelpHead>Severity</HelpHead>
      <Terms
        items={[
          [<Severity s="low" />, 'Cosmetic or minor: spacing, alignment, copy. May move on to a later set.'],
          [<Severity s="medium" />, 'Noticeable but safe. Always fixed before its set closes.'],
          [<Promoted />, 'Deferring it backfired: it blocked another task\'s check or broke other work, so it was fixed at once. Many promotions mean too much is being deferred.'],
        ]}
      />
      <p>High severity is never deferred, so it never shows here.</p>
      <HelpHead>Labels</HelpHead>
      <Terms
        items={[
          [<Where>toolbar</Where>, 'Where it shows: a screen, a component or files. Briefs for tasks on that surface list it, so builders don\'t fix it on the side and reviewers don\'t report it again.'],
          [<Chip className="py-0 text-[10.5px]">found in T07 review</Chip>, 'Who found it: a task\'s review, QA, or the final review.'],
          [<Chip className="py-0 text-[10.5px]">due: end of set</Chip>, 'When it is due. "end of set": the set\'s last task fixes its deferred defects, before the final review. A low one may be moved on to a later set, which the label then names.'],
          ['logged …', 'The day it was logged.'],
        ]}
      />
    </Explain>
  )
}

// When the open defects will be dealt with: the set's deferred ones at its end.
function DueLine({ state, open }: { state: State; open: Defect[] }) {
  const cur = state.current
  const atEnd = open.filter((d) => d.state === 'deferred' && (!d.slot || d.slot === 'end of set')).length
  const scheduled = open.filter((d) => d.state === 'scheduled').length
  if (!atEnd && !scheduled) return null
  const left = cur ? cur.total - cur.accepted : 0
  const parts: string[] = []
  if (atEnd) parts.push(`${atEnd} due at the end of this set${cur && left > 0 ? `, after ${left} more task${left === 1 ? '' : 's'}` : ''}`)
  if (scheduled) parts.push(`${scheduled} being fixed now`)
  return <p className="pb-1 text-[12px] text-muted-foreground">{parts.join(' · ')}. A deferred defect is fixed sooner only if it gets in the way (promoted).</p>
}

export function Defects({ state, onTask }: { state: State; onTask: (id: string) => void }) {
  const { items, summary: s } = state.defects
  if (!items.length) {
    return (
      <Empty icon={Bug} title="No defects logged">
        Review findings that are low or medium severity and safe to leave for later are deferred here with <Mono>crew defect</Mono>, then scheduled or fixed.
      </Empty>
    )
  }
  const tasks = state.current?.tasks ?? []
  const open = items.filter((d) => d.state !== 'fixed' && d.state !== 'dropped')
  const closed = items.filter((d) => d.state === 'fixed' || d.state === 'dropped')
  const row = (d: Defect) => <DefectRow key={d.id} d={d} today={state.today} tasks={tasks} onTask={onTask} />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Deferred" value={s.deferred} sub={s.deferred ? (s.deferredMedium ? `${s.deferredMedium} medium` : 'all low') : 'none waiting'} tone={s.deferredMedium ? 'warn' : undefined} />
          <Stat label="Scheduled" value={s.scheduled} sub="being fixed" />
          <Stat label="Fixed" value={s.fixed} sub={s.dropped ? `${s.dropped} dropped` : undefined} tone={s.fixed ? 'good' : undefined} />
          <Stat label="Promoted" value={s.promoted} sub={`of ${s.total} logged`} tone={s.promoted ? 'bad' : undefined} />
        </div>
        <Legend />
      </div>

      <Panel title={`Open · ${open.length}`} icon={Bug} bodyClassName="px-4 pb-2">
        <DueLine state={state} open={open} />
        {open.length ? <ul className="divide-y divide-border/60">{open.map(row)}</ul> : <p className="pb-2 text-[12.5px] text-muted-foreground">None open.</p>}
      </Panel>

      {closed.length > 0 && (
        <details className="group rounded-xl border bg-card shadow-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            Closed <span className="tabular font-normal text-muted-foreground">{closed.length}</span>
          </summary>
          <ul className="divide-y divide-border/60 px-4 pb-2">{closed.map(row)}</ul>
        </details>
      )}
    </div>
  )
}
