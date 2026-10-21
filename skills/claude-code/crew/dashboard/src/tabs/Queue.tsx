import { useState, type ReactNode } from 'react'
import { CheckCheck, ChevronRight, Inbox, MessageCircleQuestion } from 'lucide-react'
import type { Question, Request, State } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Empty, Inline, Mono, Note, Panel } from '@/components/bits'

const STATE_CLS: Record<string, string> = {
  queued: 'bg-st-progress/16 text-st-progress',
  scheduled: 'bg-st-review/14 text-st-review',
  done: 'bg-st-accepted/14 text-st-accepted',
  dropped: 'bg-muted text-muted-foreground',
}

// When a request is due, from its slot. Slots are written by the lead: "now (urgent)", "after T05",
// "end of set", "milestone 2", "tbd"; a slot that names a task without "after" is folded into it.
interface Slot { key: string; label: string; order: number }
export function slotOf(slot: string): Slot {
  const s = slot.trim()
  let m: RegExpExecArray | null
  if (/^now\b|\burgent\b/i.test(s)) return { key: 'now', label: 'Now', order: 0 }
  if ((m = /^after\s+T0*(\d+)\b/i.exec(s))) return { key: `after-${m[1]}`, label: `After T${m[1].padStart(2, '0')}`, order: 2000 + Number(m[1]) }
  if (/^end of (the )?set\b/i.test(s)) return { key: 'end', label: 'End of set', order: 5000 }
  if ((m = /^milestone\s+(\S+)/i.exec(s))) return { key: `ms-${m[1]}`, label: `Milestone ${m[1]}`, order: 6000 + (Number(m[1]) || 0) }
  if (/^(tbd|none|—|-)?$/i.test(s)) return { key: 'tbd', label: 'Not slotted yet', order: 8000 }
  if ((m = /\bT0*(\d+)\b/.exec(s))) return { key: `in-${m[1]}`, label: `In T${m[1].padStart(2, '0')}`, order: 1000 + Number(m[1]) }
  return { key: 'other', label: 'Other', order: 9000 }
}

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
    <li className="grid grid-cols-[2.25rem_1fr_auto] gap-x-1 gap-y-1 px-1 py-2.5">
      <Mono className="pt-px font-semibold">{r.id}</Mono>
      <span className={cn('text-[13px] leading-snug', closed && 'text-muted-foreground')}><Inline text={r.text} /></span>
      <span className={cn('self-start rounded-full px-2 py-0.5 text-[10.5px] font-medium', STATE_CLS[r.state] ?? 'bg-muted text-muted-foreground')}>{r.state || 'logged'}</span>
      <span />
      <dl className="col-span-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px] leading-snug text-muted-foreground">
        {r.affects && <><dt className="font-medium">Affects</dt><dd><Inline text={r.affects} /></dd></>}
        {r.slot && <><dt className="font-medium">Slot</dt><dd><Inline text={r.slot} /></dd></>}
        <dt className="font-medium">Status</dt><dd>{r.status || r.state} · {r.date}</dd>
      </dl>
    </li>
  )
}

// A section's sub-group, folding open and shut.
function Group({ label, count, open, onToggle, dot, children }: { label: string; count: number; open: boolean; onToggle: () => void; dot?: string; children: ReactNode }) {
  return (
    <div className="border-t first:border-t-0">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-1 py-2 text-left text-[12px] font-semibold">
        <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {dot && <span className={cn('size-2 rounded-full', dot)} />}
        {label}
        <span className="tabular font-normal text-muted-foreground">{count}</span>
      </button>
      {open && <ul className="divide-y divide-border/60 pb-1">{children}</ul>}
    </div>
  )
}

export function Queue({ state }: { state: State }) {
  const { requests, questions } = state.queue
  // Folded groups; every slot starts open, done and dropped start shut.
  const [shut, setShut] = useState<Record<string, boolean>>({ done: true, dropped: true })
  const toggle = (k: string) => setShut((s) => ({ ...s, [k]: !s[k] }))
  const openQs = questions.filter((q) => q.state !== 'answered')
  const answered = questions.filter((q) => q.state === 'answered')
  const yours = requests.filter((r) => r.state !== 'done' && r.state !== 'dropped')
  const slots = new Map<string, Slot & { items: Request[] }>()
  for (const r of yours) {
    const sl = slotOf(r.slot)
    if (!slots.has(sl.key)) slots.set(sl.key, { ...sl, items: [] })
    slots.get(sl.key)!.items.push(r)
  }
  const bySlot = [...slots.values()].sort((a, b) => a.order - b.order)
  const done = requests.filter((r) => r.state === 'done')
  const dropped = requests.filter((r) => r.state === 'dropped')
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
        <>
          <Panel title={`Your requests · ${yours.length}`} icon={Inbox} bodyClassName="px-3 pb-2">
            {bySlot.length === 0 && <p className="px-1 pb-2 text-[12.5px] text-muted-foreground">None waiting: everything you asked for is done or dropped.</p>}
            {bySlot.map((g) => (
              <Group key={g.key} label={g.label} count={g.items.length} open={!shut[g.key]} onToggle={() => toggle(g.key)}>
                {g.items.map((r) => <RequestRow key={r.id} r={r} />)}
              </Group>
            ))}
          </Panel>
          {(done.length > 0 || dropped.length > 0) && (
            <Panel title="Closed" icon={CheckCheck} bodyClassName="px-3 pb-2">
              {done.length > 0 && (
                <Group label="Done" dot="bg-st-accepted" count={done.length} open={!shut.done} onToggle={() => toggle('done')}>
                  {done.map((r) => <RequestRow key={r.id} r={r} />)}
                </Group>
              )}
              {dropped.length > 0 && (
                <Group label="Dropped" dot="bg-st-pending" count={dropped.length} open={!shut.dropped} onToggle={() => toggle('dropped')}>
                  {dropped.map((r) => <RequestRow key={r.id} r={r} />)}
                </Group>
              )}
            </Panel>
          )}
        </>
      )}
      <Note>From <Mono>.crew/queue.md</Mono>.</Note>
    </div>
  )
}
