import { useMemo, useState } from 'react'
import { ScrollText, Search, X } from 'lucide-react'
import type { JournalEntry, State } from '@/lib/types'
import { dayLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Empty, Mono, Note } from '@/components/bits'
import { JournalRow } from '@/components/JournalRow'

type Filter = 'all' | 'lead' | 'agents' | 'system'

const FILTERS: { key: Filter; label: string; test: (e: JournalEntry) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'lead', label: 'Lead', test: (e) => e.kind === 'lead' },
  { key: 'agents', label: 'Agents', test: (e) => e.kind === 'start' || e.kind === 'stop' || e.kind === 'resume' },
  { key: 'system', label: 'System', test: (e) => e.kind === 'system' || e.kind === 'other' },
]

export function Journal({ state }: { state: State }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const { entries, total } = state.journal
  const groups = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)!.test
    const needle = q.trim().toLowerCase()
    const out: { day: string; items: JournalEntry[] }[] = []
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]
      if (!test(e)) continue
      if (needle && !`${e.actor} ${e.text} ${e.branch}`.toLowerCase().includes(needle)) continue
      const last = out[out.length - 1]
      if (last && last.day === e.day) last.items.push(e)
      else out.push({ day: e.day, items: [e] })
    }
    return out
  }, [entries, filter, q])

  if (!entries.length) {
    return <Empty icon={ScrollText} title="The journal is empty">The lead and the hooks write to <Mono>.crew/journal.md</Mono> as work happens.</Empty>
  }
  const count = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-[var(--header-h,0px)] z-20 -mx-3 flex flex-wrap items-center gap-2 bg-background/85 px-3 py-2 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex rounded-lg bg-muted p-0.5 text-[11.5px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('rounded-md px-2 py-0.5 transition-colors', filter === f.key ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the journal"
            className="h-7 w-full rounded-lg border bg-background pr-7 pl-7 text-[12.5px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground" title="Clear">
              <X className="size-3.5" />
            </button>
          )}
        </label>
      </div>

      {groups.length === 0 && <p className="px-1 text-[12.5px] text-muted-foreground">Nothing matches.</p>}
      {groups.map((g) => (
        <section key={g.day} className="rounded-xl border bg-card px-4 pt-2.5 pb-1.5 shadow-xs">
          <h3 className="mb-0.5 flex items-baseline gap-2 text-[12px] font-semibold">
            {g.day ? dayLabel(g.day, state.today) : 'Undated'}
            <span className="font-normal text-muted-foreground">{g.day}</span>
            <span className="tabular ml-auto font-normal text-muted-foreground">{g.items.length}</span>
          </h3>
          <div className="divide-y divide-border/60">
            {g.items.map((e, i) => <JournalRow key={i} e={e} />)}
          </div>
        </section>
      ))}
      <Note>
        {count === entries.length ? `${entries.length}` : `${count} of ${entries.length}`} entries
        {total > entries.length ? ` (the newest ${entries.length} of ${total} in .crew/journal.md)` : ''}, newest first.
      </Note>
    </div>
  )
}
