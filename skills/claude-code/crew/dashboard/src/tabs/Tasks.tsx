import { useMemo, useState } from 'react'
import { Bot, FileText, ListChecks, Network } from 'lucide-react'
import type { State, StatusKey } from '@/lib/types'
import { rates } from '@/lib/rates'
import { cn } from '@/lib/utils'
import { Chip, Empty, Mono, Panel, STATUS, StatusIcon } from '@/components/bits'
import { TaskGraph } from '@/components/TaskGraph'
import { Duration } from '@/components/Duration'
import type { Doc } from '@/components/DocSheet'

type Filter = 'all' | 'open' | 'accepted'

export function Tasks({ state, onTask, onDoc }: { state: State; onTask: (id: string) => void; onDoc: (d: Doc) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const cur = state.current
  const perTask = useMemo(() => new Map((cur?.timing?.perTask ?? []).map((p) => [p.id, p])), [cur])
  if (!cur) {
    return <Empty icon={ListChecks} title="No task set yet">Tasks appear here once the planner writes a set under <Mono>.crew/tasks/</Mono>.</Empty>
  }
  const critical = cur.timing?.criticalPath.ids ?? []
  const shown = cur.tasks.filter((t) => filter === 'all' || (filter === 'accepted' ? t.status === 'accepted' : t.status !== 'accepted'))
  const scale = Math.max(1, ...cur.tasks.map((t) => perTask.get(t.id)?.active ?? 0))
  const open = cur.tasks.filter((t) => t.status !== 'accepted').length
  const r = rates(state)
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Dependencies"
        icon={Network}
        bodyClassName="px-2 pb-3"
        action={
          <button onClick={() => onDoc({ path: cur.file, title: cur.title, sub: cur.rel })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <FileText className="size-3.5" /> Index
          </button>
        }
      >
        <TaskGraph tasks={cur.tasks} agents={state.agents} current={cur.currentTask} criticalPath={critical} onPick={onTask} />
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-2 text-[11px] text-muted-foreground">
          {critical.length > 1 && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-primary" /> critical path so far</span>}
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-dashed border-primary" /> current task</span>
          <span className="inline-flex items-center gap-1.5"><span className="crew-pulse size-2 rounded-full bg-primary" /> agent on it</span>
        </div>
      </Panel>

      <Panel
        title="Tasks"
        icon={ListChecks}
        bodyClassName="px-1.5 pb-2"
        action={
          <div className="flex rounded-lg bg-muted p-0.5 text-[11.5px]">
            {(['all', 'open', 'accepted'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn('rounded-md px-2 py-0.5 capitalize transition-colors', filter === f ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
              >
                {f}{f === 'open' ? ` ${open}` : f === 'accepted' ? ` ${cur.accepted}` : ''}
              </button>
            ))}
          </div>
        }
      >
        {shown.length === 0 && <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">{filter === 'open' ? 'Every task is accepted.' : 'None yet.'}</p>}
        <ul className="flex flex-col">
          {shown.map((t) => {
            const time = perTask.get(t.id)
            const working = t.agents.length > 0
            return (
              <li key={t.id}>
                <button
                  onClick={() => onTask(t.id)}
                  className={cn(
                    'group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent/60',
                    t.id === cur.currentTask && 'bg-primary/5',
                  )}
                >
                  <StatusIcon status={t.status as StatusKey} className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <Mono className="shrink-0 font-semibold">{t.id}</Mono>
                      <span className={cn('min-w-0 flex-1 text-[13px] leading-snug', t.status === 'accepted' && 'text-muted-foreground')}>{t.title}</span>
                      {working && <Bot className="size-3.5 shrink-0 self-center text-primary" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={cn('text-[11px]', STATUS[t.status].text)}>{STATUS[t.status].label}</span>
                      {t.deps.length > 0 && <Chip className="py-0 text-[10.5px]">after {t.deps.join(', ')}</Chip>}
                      {t.flags.map((f) => <Chip key={f} className="py-0 text-[10.5px]">{f}</Chip>)}
                      {t.screenshotCount > 0 && <Chip className="py-0 text-[10.5px]">{t.screenshotCount} shot{t.screenshotCount === 1 ? '' : 's'}</Chip>}
                      {time && time.active > 0 && (
                        <span className="ml-auto flex items-center gap-2">
                          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:flex">
                            <span className="flex h-full" style={{ width: `${(time.active * 100) / scale}%` }}>
                              {[['bg-ph-build', time.build], ['bg-ph-review', time.review], ['bg-ph-rework', time.rework]].map(([cls, v]) =>
                                (v as number) > 0 ? <span key={cls as string} className={cls as string} style={{ width: `${((v as number) * 100) / Math.max(1, time.build + time.review + time.rework)}%` }} /> : null,
                              )}
                            </span>
                          </span>
                          <Duration secs={time.active} live={r.task(t.id) > 0} rate={r.task(t.id)} className="text-[11px] text-muted-foreground" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </Panel>
    </div>
  )
}
