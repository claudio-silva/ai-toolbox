import { useState } from 'react'
import { ChevronRight, Inbox, MessageCircleQuestion } from 'lucide-react'
import type { Question, Request, State } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Empty, Inline, Mono, Note, Panel } from '@/components/bits'

const GROUPS = [
  { key: 'queued', label: 'Queued', dot: 'bg-st-progress', open: true },
  { key: 'scheduled', label: 'Scheduled', dot: 'bg-st-review', open: true },
  { key: 'done', label: 'Done', dot: 'bg-st-accepted', open: false },
  { key: 'dropped', label: 'Dropped', dot: 'bg-st-pending', open: false },
] as const

function QuestionCard({ q }: { q: Question }) {
  const open = q.state !== 'answered'
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-xl border px-3.5 py-3', open ? 'border-st-progress/40 bg-st-progress/6' : 'bg-background/50')}>
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
        <Mono className="font-semibold text-foreground">{q.id}</Mono>
        <span>{q.date}</span>
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-medium', open ? 'bg-st-progress/18 text-st-progress' : 'bg-muted')}>{q.status || 'open'}</span>
      </div>
      <p className={cn('text-[13px] leading-snug', !open && 'text-muted-foreground')}><Inline text={q.text} /></p>
      {q.default && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Default taken:</span> <Inline text={q.default} /></p>
      )}
    </div>
  )
}

function RequestRow({ r }: { r: Request }) {
  const closed = r.state === 'done' || r.state === 'dropped'
  return (
    <li className="grid grid-cols-[2.25rem_1fr] gap-x-1 gap-y-1 px-1 py-2.5">
      <Mono className="pt-px font-semibold">{r.id}</Mono>
      <span className={cn('text-[13px] leading-snug', closed && 'text-muted-foreground')}><Inline text={r.text} /></span>
      <span />
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px] leading-snug text-muted-foreground">
        {r.affects && <><dt className="font-medium">Affects</dt><dd><Inline text={r.affects} /></dd></>}
        {r.slot && <><dt className="font-medium">Slot</dt><dd><Inline text={r.slot} /></dd></>}
        <dt className="font-medium">Status</dt><dd>{r.status || r.state} · {r.date}</dd>
      </dl>
    </li>
  )
}

export function Queue({ state }: { state: State }) {
  const { requests, questions } = state.queue
  const [shown, setShown] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.key, g.open])))
  const openQs = questions.filter((q) => q.state !== 'answered')
  const answered = questions.filter((q) => q.state === 'answered')
  const other = requests.filter((r) => !GROUPS.some((g) => g.key === r.state))
  return (
    <div className="flex flex-col gap-4">
      <Panel title={openQs.length ? `Questions for you · ${openQs.length}` : 'Questions for you'} icon={MessageCircleQuestion}>
        {questions.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No questions. When the crew needs a decision from you, it asks in <Mono>.crew/queue.md</Mono> and carries on with a default.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {openQs.map((q) => <QuestionCard key={q.id} q={q} />)}
            {answered.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> {answered.length} answered
                </summary>
                <div className="mt-1.5 flex flex-col gap-2">{answered.map((q) => <QuestionCard key={q.id} q={q} />)}</div>
              </details>
            )}
          </div>
        )}
      </Panel>

      {requests.length === 0 ? (
        <Empty icon={Inbox} title="No requests">
          Ask for a change while the crew works with <Mono>/crew request</Mono>; it lands in the queue and is folded in at the right slot.
        </Empty>
      ) : (
        <Panel title="Requests" icon={Inbox} bodyClassName="px-3 pb-2">
          {GROUPS.map((g) => {
            const items = requests.filter((r) => r.state === g.key)
            if (!items.length) return null
            return (
              <div key={g.key} className="border-t first:border-t-0">
                <button onClick={() => setShown((s) => ({ ...s, [g.key]: !s[g.key] }))} className="flex w-full items-center gap-2 px-1 py-2 text-left text-[12px] font-semibold">
                  <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', shown[g.key] && 'rotate-90')} />
                  <span className={cn('size-2 rounded-full', g.dot)} />
                  {g.label}
                  <span className="tabular font-normal text-muted-foreground">{items.length}</span>
                </button>
                {shown[g.key] && <ul className="divide-y divide-border/60 pb-1">{items.map((r) => <RequestRow key={r.id} r={r} />)}</ul>}
              </div>
            )
          })}
          {other.length > 0 && (
            <div className="border-t">
              <div className="px-1 py-2 text-[12px] font-semibold">Other</div>
              <ul className="divide-y divide-border/60 pb-1">{other.map((r) => <RequestRow key={r.id} r={r} />)}</ul>
            </div>
          )}
        </Panel>
      )}
      <Note>From <Mono>.crew/queue.md</Mono>.</Note>
    </div>
  )
}
