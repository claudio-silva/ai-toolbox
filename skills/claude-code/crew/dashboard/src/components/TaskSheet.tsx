// One task in a side sheet: its status, who is on it, its time so far, its screenshots and
// its spec.

import { useState } from 'react'
import { Bot, FileText, Images, Timer, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { State, Task } from '@/lib/types'
import { Chip, Mono, StatusBadge } from './bits'
import { Markdown, fileUrl } from './Markdown'
import { AgentRow } from './AgentRow'
import { modelShort, span, when } from '@/lib/format'
import { PhaseBar } from './PhaseBar'

export function TaskSheet({ state, taskId, onClose }: { state: State; taskId: string | null; onClose: () => void }) {
  const task = state.current?.tasks.find((t) => t.id === taskId) ?? null
  return (
    <Sheet open={Boolean(task)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {task && <TaskBody state={state} task={task} />}
      </SheetContent>
    </Sheet>
  )
}

function TaskBody({ state, task }: { state: State; task: Task }) {
  const [shot, setShot] = useState<string | null>(null)
  const agents = state.agents.filter((a) => task.agents.includes(a.id))
  const time = state.current?.timing?.perTask.find((p) => p.id === task.id)
  const runs = state.current?.timing?.runs.filter((r) => r.task === task.id) ?? []
  return (
    <>
      <SheetHeader className="sticky top-0 z-10 border-b bg-background/90 px-5 pt-5 pb-4 backdrop-blur">
        <SheetClose className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <X className="size-4" /><span className="sr-only">Close</span>
        </SheetClose>
        <div className="flex items-center gap-2 pr-8">
          <Mono className="text-sm font-semibold">{task.id}</Mono>
          <StatusBadge status={task.status} />
          {task.id === state.current?.currentTask && <Chip className="border-primary/30 text-primary">current</Chip>}
        </div>
        <SheetTitle className="text-base leading-snug">{task.title}</SheetTitle>
        <SheetDescription className="flex flex-wrap gap-1.5">
          {task.deps.length > 0 && <Chip>after {task.deps.join(', ')}</Chip>}
          {task.flags.map((f) => <Chip key={f}>{f}</Chip>)}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6 px-5 py-5">
        {agents.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Bot className="size-3.5" /> On it now</h3>
            {agents.map((a) => <AgentRow key={a.id} agent={a} />)}
          </section>
        )}

        {time && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Timer className="size-3.5" /> Agent time</h3>
            <PhaseBar build={time.build} review={time.review} rework={time.rework} />
            <div className="text-xs text-muted-foreground">
              {span(time.active)} at work in {time.runs} run{time.runs === 1 ? '' : 's'}
              {time.changes > 0 && <> · {time.changes} CHANGES verdict{time.changes === 1 ? '' : 's'}</>}
              {time.slept > 0 && <> · slept {span(time.slept)} during its runs</>}
            </div>
            <ol className="mt-1 flex flex-col gap-1">
              {runs.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className="tabular w-[92px] shrink-0 text-muted-foreground">{when(r.start, state.today)}</span>
                  <span className="truncate">{r.name || r.type}</span>
                  <span className="text-muted-foreground">{r.type !== (r.name || r.type) ? r.type : ''}{r.model ? ` · ${modelShort(r.model)}` : ''}</span>
                  <span className="ml-auto tabular text-muted-foreground">{r.open ? 'running' : r.status || '—'} · {span(r.active)}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {task.screenshots.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <Images className="size-3.5" /> Screenshots
              <span className="font-normal normal-case">({task.screenshotCount > task.screenshots.length ? `newest ${task.screenshots.length} of ${task.screenshotCount}` : task.screenshotCount})</span>
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {task.screenshots.map((s) => (
                <button key={s.path} onClick={() => setShot(s.path)} className="group flex flex-col gap-1 text-left">
                  <img src={fileUrl(s.path)} alt={s.name} loading="lazy" className="aspect-video w-full rounded-md border bg-muted object-cover object-top transition group-hover:ring-2 group-hover:ring-primary/40" />
                  <span className="truncate text-[10.5px] text-muted-foreground">{s.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {task.specPath && (
          <section className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><FileText className="size-3.5" /> Spec <span className="font-mono font-normal normal-case">{task.spec}</span></h3>
            <div className="rounded-xl border bg-card px-4 py-3">
              <Markdown path={task.specPath} version={state.generatedAt} />
            </div>
          </section>
        )}
      </div>

      <Dialog open={Boolean(shot)} onOpenChange={(o) => !o && setShot(null)}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-[96vw] overflow-auto p-2 sm:max-w-[96vw]">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          {shot && <img src={fileUrl(shot)} alt="" className="mx-auto h-auto max-w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </>
  )
}
