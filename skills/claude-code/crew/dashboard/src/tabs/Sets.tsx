import { CheckCheck, FolderGit2, Layers } from 'lucide-react'
import type { State } from '@/lib/types'
import { pct, when } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Chip, Empty, Inline, Mono, Note, StatusBar, StatusLegend } from '@/components/bits'
import type { Doc } from '@/components/DocSheet'

export function Sets({ state, onDoc }: { state: State; onDoc: (d: Doc) => void }) {
  const sets = state.sets
  if (!sets.length) {
    return <Empty icon={Layers} title="No task sets yet">Each planned set of tasks lives in its own folder under <Mono>.crew/tasks/</Mono>.</Empty>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {sets.map((s) => (
        <button
          key={s.file}
          onClick={() => onDoc({ path: s.file, title: s.title, sub: s.where ? `${s.where}: ${s.rel}` : s.rel })}
          className={cn(
            'flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 text-left shadow-xs transition-colors hover:bg-accent/40',
            s.current && 'border-primary/40 ring-1 ring-primary/20',
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                {s.current && <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10.5px] font-semibold text-primary">current</span>}
                {s.closed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-st-accepted/12 px-2 py-0.5 text-[10.5px] font-medium text-st-accepted"><CheckCheck className="size-3" />closed {s.closed}</span>
                ) : s.live ? (
                  <span className="rounded-full bg-st-progress/14 px-2 py-0.5 text-[10.5px] font-medium text-st-progress">open</span>
                ) : null}
                {s.where && <Chip className="py-0 text-[10.5px]"><FolderGit2 className="size-3" />{s.where}</Chip>}
              </div>
              <div className="mt-1 text-[13.5px] leading-snug font-semibold">{s.title}</div>
              {s.stage && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"><Inline text={s.stage} /></div>}
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="tabular text-lg leading-none font-semibold">{pct(s.accepted, s.total)}</span>
              <span className="tabular mt-1 text-[11px] text-muted-foreground">{s.accepted}/{s.total}</span>
            </div>
          </div>
          <StatusBar counts={s.counts} total={s.total} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusLegend counts={s.counts} />
            <span className="font-mono text-[10.5px] text-muted-foreground">{s.rel} · {when(s.mtime, state.today)}</span>
          </div>
        </button>
      ))}
      <Note>The current set first, then the most recently changed. A set that also exists in a worktree shows once, from the main checkout.</Note>
    </div>
  )
}
