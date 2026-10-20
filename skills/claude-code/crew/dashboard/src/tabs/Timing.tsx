import { ChartGantt, Route, Timer, Users } from 'lucide-react'
import type { State } from '@/lib/types'
import type { Tab } from '@/lib/persist'
import { useNow } from '@/lib/live'
import { pct, span } from '@/lib/format'
import { rates } from '@/lib/rates'
import { Duration } from '@/components/Duration'
import { Chip, Empty, Explain, HelpHead, Mono, Panel, Stat, Terms } from '@/components/bits'
import { Gantt } from '@/components/Gantt'
import { PhaseBar } from '@/components/PhaseBar'
import { crewNow, elapsedLabel, TimeBar, TimeHelp } from '@/components/TimeSplit'

const PHASES_HELP: [string, string][] = [
  ['build', "A builder's or worker's first run on the task."],
  ['review', 'Reviewer runs.'],
  ['rework', 'A builder resumed after a review sent the task back, and any debugger run.'],
]

export function Timing({ state, dark, onTask, goTab }: { state: State; dark: boolean; onTask: (id: string) => void; goTab: (t: Tab) => void }) {
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
  const r = rates(state)
  const awake = t.clock - t.slept
  const roles = Object.entries(t.byType).sort((a, b) => b[1] - a[1])
  const roleMax = Math.max(1, ...roles.map((x) => x[1]))
  const scale = Math.max(1, ...t.perTask.map((p) => p.build + p.review + p.rework))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label="Crew at work" value={<Duration secs={t.active} live={r.active > 0} />} sub={`${span(t.clock)} elapsed ${elapsedLabel(t, state.today)}`} />
          <Stat label="Agents at work" value={<Duration secs={t.busy} live={r.busy > 0} />} sub={`${pct(t.busy, awake)} of awake time`} />
          <Stat label="Lead alone" value={<Duration secs={t.leadAlone} live={r.leadAlone > 0} />} sub="lead working, no agent" />
          <Stat label="Idle" value={span(t.idle)} sub={t.slept > 0 ? `and ${span(t.slept)} asleep (${t.sleeps.length} sleep${t.sleeps.length === 1 ? '' : 's'})` : 'nothing running'} />
        </div>
        <TimeBar t={t} r={r} values="percent" now={crewNow(state, r)} />
        <Explain><TimeHelp t={t} /></Explain>
      </div>

      <Panel
        title="Agent runs"
        icon={ChartGantt}
        bodyClassName="px-1 pb-2"
        help={
          <>
            <p>Every agent run of the set over time: one row per task, and a Set row for agents not tied to a task (QA, the advisor, a scout).</p>
            <Terms
              items={[
                ['Bar colour', 'The phase: build, review, rework, or set level.'],
                ['Dashed bar', 'Running now; it grows until the agent stops.'],
                ['Red outline', 'A review that returned CHANGES: it sent the task back for rework.'],
                ['Grey band', 'The computer asleep. The band spans the gap between two clock samples; the sleep inside it was measured.'],
                ['Interrupted', 'A run whose Claude Code session closed under it; it ends at the agent\'s last write.'],
              ]}
            />
            <HelpHead>Using it</HelpHead>
            <p>Click a bar to open its task. Drag to pan; Ctrl + wheel (or pinch) zooms; the slider below shows and moves the visible range.</p>
          </>
        }
      >
        {t.runs.length ? <Gantt timing={t} tasks={cur.tasks} dark={dark} now={now} at={state.generatedAt} onTask={onTask} /> : <p className="px-3 py-2 text-[12.5px] text-muted-foreground">No agent runs yet.</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-build" />build</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-review" />review</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-rework" />rework</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-ph-other" />set level</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-sleep ring-1 ring-border ring-inset" />asleep</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border border-st-rework" />sent back</span>
        </div>
      </Panel>

      {t.taskTime > 0 && (
        <Panel
          title={<>Task time <span className="font-normal text-muted-foreground">· <Duration secs={t.taskTime} live={r.taskTime > 0} rate={r.taskTime} /></span></>}
          icon={Timer}
          help={
            <>
              <p>
                Every agent run on a task, added up. Agents working side by side each count, so task time can be more than the time the crew was at
                work. Agents not tied to a task (the Set row) are left out.
              </p>
              <Terms items={PHASES_HELP} />
              <p>A review sends a task back with a CHANGES verdict; the builder then reworks it, and a reviewer checks again.</p>
            </>
          }
        >
          <PhaseBar build={t.phases.build} review={t.phases.review} rework={t.phases.rework} rates={r.phases} />
          <p className="mt-2 text-xs text-muted-foreground">
            {t.changes > 0 ? <>Reviews sent work back {t.changes} time{t.changes === 1 ? '' : 's'}.</> : 'No review has sent work back so far.'}
          </p>
        </Panel>
      )}

      {t.criticalPath.ids.length > 0 && (
        <Panel
          title="Critical path so far"
          icon={Route}
          help={
            <>
              <p>
                The longest chain of tasks that each wait for the one before (the "Depends on" column of the task list), measured in agent time so
                far. It is a single chain: tasks that are not on it could run alongside it. The Tasks tab's graph shows every chain, with this one
                highlighted.
              </p>
              <Terms
                items={[
                  ['Length', "The chain's agent time: the least time the set could have taken so far with unlimited agents side by side."],
                  ['Parallel headroom', 'Task time minus the length: the agent time spent off the chain, which running independent tasks side by side could take off the elapsed time. None means the tasks form one chain.'],
                ]}
              />
            </>
          }
        >
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
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
            <span>{pct(t.criticalPath.seconds, t.taskTime)} of task time is on the chain</span>
            <button onClick={() => goTab('tasks')} className="hover:text-foreground">Every chain, on Tasks →</button>
          </div>
        </Panel>
      )}

      {t.perTask.length > 0 && (
        <Panel
          title="Per task"
          icon={Timer}
          bodyClassName="px-2 pb-2"
          help={
            <>
              <p>Each task's agent time by phase, in the order of the task list. A task opens its details.</p>
              <Terms
                items={[
                  ...PHASES_HELP,
                  ['sent back', 'How many reviews returned CHANGES and sent the task back for rework.'],
                  ['runs', 'Agent runs on the task: every start and every resume.'],
                  ['slept', 'Sleep inside its runs, left out of its time.'],
                ]}
              />
            </>
          }
        >
          <div className="flex flex-col">
            {t.perTask.map((p) => (
              <button key={p.id} onClick={() => onTask(p.id)} className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent/60">
                <Mono className="font-semibold">{p.id}</Mono>
                <PhaseBar build={p.build} review={p.review} rework={p.rework} scale={scale} legend={false} />
                <Duration secs={p.active} live={r.task(p.id) > 0} rate={r.task(p.id)} className="text-right text-[11.5px] text-muted-foreground" />
                <span />
                <span className="flex flex-wrap gap-x-2.5 text-[11px] text-muted-foreground">
                  {(['build', 'review', 'rework'] as const).map((ph) => p[ph] > 0 && (
                    <span key={ph}>{ph} <Duration secs={p[ph]} live={r.taskPhase(p.id, ph) > 0} rate={r.taskPhase(p.id, ph)} /></span>
                  ))}
                  {p.changes > 0 && <span className="text-st-rework">sent back {p.changes}×</span>}
                  {p.slept > 0 && <span>slept {span(p.slept)}</span>}
                </span>
                <span className="tabular text-right text-[11px] text-muted-foreground">{p.runs} run{p.runs === 1 ? '' : 's'}</span>
              </button>
            ))}
            {t.setLevel && (t.setLevel.active > 0 || t.setLevel.slept > 0) && (
              <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3 px-2 py-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">Set</span>
                <span className="flex flex-wrap gap-1">{t.setLevel.types.map((x) => <Chip key={x} className="py-0 text-[10.5px]">{x}</Chip>)}{t.setLevel.slept > 0 && <span className="text-[11px] text-muted-foreground">slept {span(t.setLevel.slept)}</span>}</span>
                <Duration secs={t.setLevel.active} live={r.setLevel > 0} rate={r.setLevel} className="text-right text-[11.5px] text-muted-foreground" />
              </div>
            )}
          </div>
        </Panel>
      )}

      {roles.length > 0 && (
        <Panel
          title="By role"
          icon={Users}
          help={
            <p>
              Agent time per role (the subagent type), over every run of the set, on tasks or not. Agents of the same role working side by side
              each count. A role's time ticks only while one of its agents is running.
            </p>
          }
        >
          <div className="flex flex-col gap-1.5">
            {roles.map(([type, secs]) => (
              <div key={type} className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3 text-[12.5px]">
                <span className="truncate">{type}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(secs * 100) / roleMax}%` }} /></span>
                <Duration secs={secs} live={r.role(type) > 0} rate={r.role(type)} className="text-right text-muted-foreground" />
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
