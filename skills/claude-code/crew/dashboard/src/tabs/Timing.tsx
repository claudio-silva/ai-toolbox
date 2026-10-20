import { ChartGantt, Route, Timer, Users } from 'lucide-react'
import type { State } from '@/lib/types'
import { useNow } from '@/lib/live'
import { hm, pct, span, when } from '@/lib/format'
import { Chip, Empty, Mono, Note, Panel, Stat } from '@/components/bits'
import { Gantt } from '@/components/Gantt'
import { PhaseBar } from '@/components/PhaseBar'

export function Timing({ state, dark, onTask }: { state: State; dark: boolean; onTask: (id: string) => void }) {
  const now = useNow(60000)
  const cur = state.current
  const t = cur?.timing
  if (!cur || !t) {
    return (
      <Empty icon={Timer} title="No timing yet">
        Timing starts with the set's first agent run: how long the set has taken, where agent time went, and the critical path.
      </Empty>
    )
  }
  const sum = t.busy + t.idle + t.slept
  const comp = [
    { k: 'busy', v: t.busy, cls: 'bg-ph-build', label: 'agents at work' },
    { k: 'idle', v: t.idle, cls: 'bg-st-progress/60', label: 'lead and waiting' },
    { k: 'slept', v: t.slept, cls: 'bg-sleep', label: 'computer asleep' },
  ]
  const roles = Object.entries(t.byType).sort((a, b) => b[1] - a[1])
  const roleMax = Math.max(1, ...roles.map((r) => r[1]))
  const scale = Math.max(1, ...t.perTask.map((p) => p.build + p.review + p.rework))
  const startLabel = t.start ? `since ${when(t.start, state.today)}` : `since the first run, ${when(t.t0, state.today)}`
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="On the clock" value={span(t.clock)} sub={t.until ? `${startLabel} to ${hm(t.until)}` : startLabel} />
        <Stat label="Agents at work" value={span(t.busy)} sub={`${pct(t.busy, t.clock - t.slept)} of awake time`} />
        <Stat label="Lead and waiting" value={span(t.idle)} sub="no agent running" />
        <Stat label="Asleep" value={span(t.slept)} sub={t.sleeps.length ? `${t.sleeps.length} sleep${t.sleeps.length === 1 ? '' : 's'}` : 'never slept'} />
      </div>

      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          {sum > 0 && comp.map((p) => p.v > 0 && <div key={p.k} className={`h-full ${p.cls}`} style={{ width: `${(p.v * 100) / sum}%` }} title={`${p.label} ${span(p.v)}`} />)}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
          {comp.map((p) => (
            <span key={p.k} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${p.cls}`} />{p.label} <span className="tabular">{pct(p.v, sum)}</span></span>
          ))}
          {t.done ? <span className="ml-auto">finished</span> : <span className="ml-auto inline-flex items-center gap-1.5"><span className="crew-pulse size-1.5 rounded-full bg-now" />running</span>}
        </div>
      </div>

      <Panel title="Agent runs" icon={ChartGantt} bodyClassName="px-1 pb-2">
        {t.runs.length ? <Gantt timing={t} tasks={cur.tasks} dark={dark} now={now} /> : <p className="px-3 py-2 text-[12.5px] text-muted-foreground">No agent runs yet.</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-build" />build</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-review" />review</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-rework" />rework</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-other" />set level</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sleep" />asleep</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-st-rework" />CHANGES verdict</span>
          <span className="ml-auto hidden sm:inline">drag to pan · ctrl + wheel to zoom</span>
        </div>
      </Panel>

      {t.taskTime > 0 && (
        <Panel title={<>Task time <span className="tabular font-normal text-muted-foreground">· {span(t.taskTime)}</span></>} icon={Timer}>
          <PhaseBar build={t.phases.build} review={t.phases.review} rework={t.phases.rework} />
          <p className="mt-2 text-xs text-muted-foreground">
            {t.changes > 0 ? <>{t.changes} CHANGES verdict{t.changes === 1 ? '' : 's'} sent work back for rework.</> : 'No CHANGES verdicts so far.'}
          </p>
        </Panel>
      )}

      {t.criticalPath.ids.length > 0 && (
        <Panel title="Critical path so far" icon={Route}>
          <div className="flex flex-wrap items-center gap-1">
            {t.criticalPath.ids.map((id, i) => (
              <span key={id} className="inline-flex items-center gap-1">
                {i > 0 && <span className="text-muted-foreground">→</span>}
                <button onClick={() => onTask(id)} className="rounded-md border border-primary/30 bg-primary/8 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-primary hover:bg-primary/15">{id}</button>
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
            <div><div className="text-[11px] tracking-wide text-muted-foreground uppercase">Length</div><div className="tabular text-lg font-semibold">{span(t.criticalPath.seconds)}</div></div>
            <div><div className="text-[11px] tracking-wide text-muted-foreground uppercase">Parallel headroom</div><div className="tabular text-lg font-semibold">{t.criticalPath.headroom >= 1 ? span(t.criticalPath.headroom) : 'none'}</div></div>
          </div>
          <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(t.criticalPath.seconds * 100) / Math.max(1, t.taskTime)}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">The longest dependency chain, measured in agent time. Headroom is the most that running independent tasks side by side could have saved.</p>
        </Panel>
      )}

      {t.perTask.length > 0 && (
        <Panel title="Per task" icon={Timer} bodyClassName="px-2 pb-2">
          <div className="flex flex-col">
            {t.perTask.map((p) => (
              <button key={p.id} onClick={() => onTask(p.id)} className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/60">
                <Mono className="font-semibold">{p.id}</Mono>
                <PhaseBar build={p.build} review={p.review} rework={p.rework} scale={scale} legend={false} />
                <span className="tabular text-right text-[11.5px] text-muted-foreground">{span(p.active)}</span>
                <span />
                <span className="flex flex-wrap gap-x-2.5 text-[11px] text-muted-foreground">
                  {p.build > 0 && <span>build {span(p.build)}</span>}
                  {p.review > 0 && <span>review {span(p.review)}</span>}
                  {p.rework > 0 && <span>rework {span(p.rework)}</span>}
                  {p.changes > 0 && <span className="text-st-rework">{p.changes} CHANGES</span>}
                  {p.slept > 0 && <span>slept {span(p.slept)}</span>}
                </span>
                <span className="tabular text-right text-[11px] text-muted-foreground">{p.runs} run{p.runs === 1 ? '' : 's'}</span>
              </button>
            ))}
            {t.setLevel && (t.setLevel.active > 0 || t.setLevel.slept > 0) && (
              <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 px-2 py-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">Set</span>
                <span className="flex flex-wrap gap-1">{t.setLevel.types.map((x) => <Chip key={x} className="py-0 text-[10.5px]">{x}</Chip>)}{t.setLevel.slept > 0 && <span className="text-[11px] text-muted-foreground">slept {span(t.setLevel.slept)}</span>}</span>
                <span className="tabular text-right text-[11.5px] text-muted-foreground">{span(t.setLevel.active)}</span>
              </div>
            )}
          </div>
        </Panel>
      )}

      {roles.length > 0 && (
        <Panel title="By role" icon={Users}>
          <div className="flex flex-col gap-1.5">
            {roles.map(([type, secs]) => (
              <div key={type} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-[12.5px]">
                <span className="truncate">{type}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(secs * 100) / roleMax}%` }} /></span>
                <span className="tabular text-right text-muted-foreground">{span(secs)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Note>
        Agent time while awake. Sleep is measured from the awake-time clock at each crew event (macOS) and left out. Task time adds up every agent's
        run on a task, so agents working side by side count separately. Phases follow the role: a builder's or worker's first run is build, a
        resumed one (after a CHANGES verdict) and any debugger run is rework, reviewer runs are review; other roles count at set level.
      </Note>
    </div>
  )
}
