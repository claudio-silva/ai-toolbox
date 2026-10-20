import { Bug, ChevronRight, Flame } from 'lucide-react'
import type { Defect, State } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Chip, Empty, Inline, Mono, Note, Panel, Stat } from '@/components/bits'

const STATE_CLS: Record<string, string> = {
  deferred: 'bg-st-progress/16 text-st-progress',
  scheduled: 'bg-st-review/14 text-st-review',
  fixed: 'bg-st-accepted/14 text-st-accepted',
  dropped: 'bg-muted text-muted-foreground',
}

function DefectRow({ d }: { d: Defect }) {
  const closed = d.state === 'fixed' || d.state === 'dropped'
  return (
    <li className="flex flex-col gap-1.5 py-2.5">
      <div className="flex items-baseline gap-2">
        <Mono className="shrink-0 font-semibold">{d.id}</Mono>
        <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', closed && 'text-muted-foreground')}><Inline text={d.text} /></span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium', STATE_CLS[d.state] ?? 'bg-muted text-muted-foreground')}>{d.state || 'logged'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-8">
        {d.severity && (
          <span className={cn('rounded-md px-1.5 py-0 text-[10.5px] font-semibold uppercase', d.severity === 'medium' ? 'bg-st-progress/14 text-st-progress' : d.severity === 'high' ? 'bg-st-rework/14 text-st-rework' : 'bg-muted text-muted-foreground')}>
            {d.severity}
          </span>
        )}
        {d.promoted && <span className="inline-flex items-center gap-1 rounded-md bg-st-rework/14 px-1.5 text-[10.5px] font-semibold text-st-rework"><Flame className="size-3" />promoted</span>}
        {d.where && <Chip className="max-w-full py-0 text-[10.5px] whitespace-normal" title="Where"><Inline text={d.where} /></Chip>}
        {d.from && <Chip className="py-0 text-[10.5px]" title="Found in">from {d.from}</Chip>}
        {d.slot && <Chip className="py-0 text-[10.5px]" title="Slot">slot: {d.slot}</Chip>}
        <span className="text-[10.5px] text-muted-foreground">{d.date}</span>
        {d.status && d.status !== d.state && <span className="text-[10.5px] text-muted-foreground">· {d.status.slice(d.state.length).replace(/^[\s(]+|\)$/g, '')}</span>}
      </div>
    </li>
  )
}

export function Defects({ state }: { state: State }) {
  const { items, summary: s } = state.defects
  if (!items.length) {
    return (
      <Empty icon={Bug} title="No defects logged">
        Review findings that are low or medium severity and safe to leave for later are deferred here with <Mono>crew defect</Mono>, then scheduled or fixed.
      </Empty>
    )
  }
  const open = items.filter((d) => d.state !== 'fixed' && d.state !== 'dropped')
  const closed = items.filter((d) => d.state === 'fixed' || d.state === 'dropped')
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Deferred" value={s.deferred} sub={s.deferredMedium ? `${s.deferredMedium} medium` : 'all low'} tone={s.deferredMedium ? 'warn' : undefined} />
        <Stat label="Scheduled" value={s.scheduled} />
        <Stat label="Fixed" value={s.fixed} sub={s.dropped ? `${s.dropped} dropped` : undefined} tone={s.fixed ? 'good' : undefined} />
        <Stat label="Promoted" value={s.promoted} sub={`of ${s.total} logged`} tone={s.promoted ? 'bad' : undefined} />
      </div>

      <Panel title={`Open · ${open.length}`} icon={Bug} bodyClassName="px-4 pb-2">
        {open.length ? <ul className="divide-y divide-border/60">{open.map((d) => <DefectRow key={d.id} d={d} />)}</ul> : <p className="pb-2 text-[12.5px] text-muted-foreground">None open.</p>}
      </Panel>

      {closed.length > 0 && (
        <details className="group rounded-xl border bg-card shadow-xs">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold">
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
            Closed <span className="tabular font-normal text-muted-foreground">{closed.length}</span>
          </summary>
          <ul className="divide-y divide-border/60 px-4 pb-2">{closed.map((d) => <DefectRow key={d.id} d={d} />)}</ul>
        </details>
      )}

      <Note>
        From <Mono>.crew/defects.md</Mono>. A promoted defect is one whose deferral backfired: it blocked another task's check or broke other work, so it was
        fixed at once. Many promotions mean the leaf test is being read too loosely.
      </Note>
    </div>
  )
}
