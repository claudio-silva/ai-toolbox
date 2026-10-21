import { useState, type ReactNode } from 'react'
import { ArrowRight, Bug, ChevronRight, Flame, History, MapPin, X } from 'lucide-react'
import type { Defect, State, Task } from '@/lib/types'
import { dayLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Empty, Explain, HelpHead, Inline, Mono, Panel, PlaceChip, Stat, StatusIcon, Terms } from '@/components/bits'
import { manyPlaces, placeOf, tasksOf } from '@/lib/sets'
import { JournalRow } from '@/components/JournalRow'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

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

// A hand-written status may carry its own note: "scheduled (as T13)".
function noteOf(d: Defect): string {
  const statusNote = d.status && d.status !== d.state ? d.status.slice(d.state.length).replace(/^[\s(]+|\)$/g, '') : ''
  return d.note || statusNote
}

function DefectRow({ d, today, tasks, onTask, onOpen, place }: { d: Defect; today: string; tasks: Task[]; onTask: (id: string) => void; onOpen: () => void; place: boolean }) {
  const closed = d.state === 'fixed' || d.state === 'dropped'
  const note = noteOf(d)
  return (
    <li
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onOpen() }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onOpen() } }}
      role="button"
      tabIndex={0}
      title="Details"
      className="-mx-2 flex cursor-pointer flex-col gap-1.5 rounded-lg px-2 py-2.5 transition-colors outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-baseline gap-2">
        <Mono className="shrink-0 font-semibold">{d.id}</Mono>
        <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', closed && 'text-muted-foreground')}><Inline text={d.text} /></span>
        <StatePill state={d.state} />
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-8">
        {place && <PlaceChip place={placeOf(d)} />}
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

// The tasks a defect names: where it was found ("T07 review") and the one fixing it ("as T11").
function taskLink(text: string, tasks: Task[]): Task | undefined {
  const m = /\bT\d{2,}\b/.exec(text)
  return m ? tasks.find((t) => t.id === m[0]) : undefined
}

function TaskButton({ t, label, onTask }: { t: Task; label: string; onTask: (id: string) => void }) {
  return (
    <button onClick={() => onTask(t.id)} className="group flex w-full items-center gap-2.5 rounded-lg border bg-background/60 px-3 py-2 text-left transition-colors hover:bg-accent/60">
      <StatusIcon status={t.status} />
      <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <Mono className="font-semibold">{t.id}</Mono>
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{t.title}</span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function Field({ k, children }: { k: string; children: ReactNode }) {
  return <><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0">{children}</dd></>
}

// One defect in a side sheet. Its line in .crew/defects.md is the only record of it; the sheet
// adds what the rest of the crew's files say: the journal lines that name it, the tasks it
// names, and the other defects in the same place.
function DefectSheet({ state, d, onClose, onOpen, onTask }: {
  state: State; d: Defect | null; onClose: () => void; onOpen: (id: string) => void; onTask: (id: string) => void
}) {
  return (
    <Sheet open={Boolean(d)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {d && <DefectBody state={state} d={d} onOpen={onOpen} onTask={onTask} />}
      </SheetContent>
    </Sheet>
  )
}

function DefectBody({ state, d, onOpen, onTask }: { state: State; d: Defect; onOpen: (id: string) => void; onTask: (id: string) => void }) {
  const tasks = tasksOf(state, d.set)
  const note = noteOf(d)
  const found = d.from ? taskLink(d.from, tasks) : undefined
  const fixing = note ? taskLink(note, tasks) : undefined
  const re = new RegExp(`\\b${d.id}\\b`)
  const history = state.journal.entries.filter((e) => re.test(e.text)).reverse()
  const where = d.where.trim().toLowerCase()
  const near = where ? state.defects.items.filter((x) => x.id !== d.id && x.where.trim().toLowerCase() === where) : []
  return (
    <>
      <SheetHeader className="sticky top-0 z-10 border-b bg-background/90 px-5 pt-5 pb-4 backdrop-blur">
        <SheetClose className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-4" /><span className="sr-only">Close</span>
        </SheetClose>
        <div className="flex items-center gap-2 pr-8">
          <Mono className="text-sm font-semibold">{d.id}</Mono>
          <StatePill state={d.state} />
          {d.severity && <Severity s={d.severity} />}
          {d.promoted && <Promoted />}
        </div>
        <SheetTitle className="text-base leading-snug"><Inline text={d.text} /></SheetTitle>
        <SheetDescription className="text-[12px]">{logged(d.date, state.today)}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-5 py-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
          {d.where && <Field k="Where"><Inline text={d.where} /></Field>}
          {d.from && <Field k="Found in">{d.from}</Field>}
          {d.severity && <Field k="Severity">{d.severity}{d.promoted ? ', promoted: deferring it got in the way of other work' : ''}</Field>}
          {d.state === 'deferred' && <Field k="Due">{d.slot || 'end of set'}</Field>}
          {d.state !== 'deferred' && d.slot && <Field k="Slot">{d.slot}</Field>}
          <Field k="Status">{d.status || d.state || 'logged'}</Field>
          {note && <Field k="Note"><Inline text={note} /></Field>}
        </dl>

        {(found || fixing) && (
          <section className="flex flex-col gap-2">
            {fixing && <TaskButton t={fixing} label={d.state === 'fixed' ? 'Fixed in' : 'Fix in'} onTask={onTask} />}
            {found && found !== fixing && <TaskButton t={found} label="Found in" onTask={onTask} />}
          </section>
        )}

        <section className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><History className="size-3.5" /> In the journal</h3>
          {history.length ? (
            <div className="divide-y divide-border/60">{history.map((e, i) => <JournalRow key={i} e={e} />)}</div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No journal line names {d.id} (the page reads the journal's last {state.journal.entries.length} lines).</p>
          )}
        </section>

        {near.length > 0 && (
          <section className="flex flex-col gap-1">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><MapPin className="size-3.5" /> Also in {d.where}</h3>
            <ul className="flex flex-col">
              {near.map((x) => (
                <li key={x.id}>
                  <button onClick={() => onOpen(x.id)} className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-accent/60">
                    <Mono className="shrink-0 font-semibold">{x.id}</Mono>
                    <span className="min-w-0 flex-1 text-[12.5px]"><Inline text={x.text} /></span>
                    <StatePill state={x.state} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[11.5px] text-muted-foreground">
          A defect is one line in <Mono>.crew/defects.md</Mono>, written with <Mono>crew defect</Mono>. The rest comes from the journal and the task set.
        </p>
      </div>
    </>
  )
}

// When the open defects will be dealt with: the set's deferred ones at its end.
function DueLine({ state, open }: { state: State; open: Defect[] }) {
  // With several open sets, "this set" would be ambiguous.
  const cur = state.open.length > 1 ? null : state.current
  const atEnd = open.filter((d) => d.state === 'deferred' && (!d.slot || d.slot === 'end of set')).length
  const scheduled = open.filter((d) => d.state === 'scheduled').length
  if (!atEnd && !scheduled) return null
  const left = cur ? cur.total - cur.accepted : 0
  const parts: string[] = []
  if (atEnd) parts.push(`${atEnd} due at the end of ${state.open.length > 1 ? 'their' : 'this'} set${cur && left > 0 ? `, after ${left} more task${left === 1 ? '' : 's'}` : ''}`)
  if (scheduled) parts.push(`${scheduled} being fixed now`)
  return <p className="pb-1 text-[12px] text-muted-foreground">{parts.join(' · ')}. A deferred defect is fixed sooner only if it gets in the way (promoted).</p>
}

export function Defects({ state, onTask }: { state: State; onTask: (id: string) => void }) {
  const { items, summary: s } = state.defects
  const [shown, setShown] = useState<string | null>(null)
  if (!items.length) {
    return (
      <Empty icon={Bug} title="No defects logged">
        Review findings that are low or medium severity and safe to leave for later are deferred here with <Mono>crew defect</Mono>, then scheduled or fixed.
      </Empty>
    )
  }
  const place = manyPlaces(state)
  const open = items.filter((d) => d.state !== 'fixed' && d.state !== 'dropped')
  const closed = items.filter((d) => d.state === 'fixed' || d.state === 'dropped')
  const row = (d: Defect) => <DefectRow key={`${d.set}:${d.id}`} d={d} today={state.today} tasks={tasksOf(state, d.set)} onTask={onTask} onOpen={() => setShown(d.id)} place={place} />
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

      <DefectSheet
        state={state}
        d={items.find((d) => d.id === shown) ?? null}
        onClose={() => setShown(null)}
        onOpen={setShown}
        onTask={(id) => { setShown(null); onTask(id) }}
      />
    </div>
  )
}
