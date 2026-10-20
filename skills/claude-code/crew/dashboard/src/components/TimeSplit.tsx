// Where the set's elapsed time went: agents at work, the lead working alone, idle (nothing
// running), asleep. The four add up to the elapsed time. Shared by Overview and Timing.

import type { ReactNode } from 'react'
import type { State, Timing } from '@/lib/types'
import type { Rates } from '@/lib/rates'
import { hm, pct, when } from '@/lib/format'
import { HelpHead, Terms } from './bits'
import { Duration } from './Duration'

export function timeParts(t: Timing, r: Rates) {
  return [
    { k: 'busy', v: t.busy, rate: r.busy, cls: 'bg-ph-build', label: 'agents at work' },
    { k: 'lead', v: t.leadAlone, rate: r.leadAlone, cls: 'bg-st-progress/75', label: 'lead alone' },
    { k: 'idle', v: t.idle, rate: 0, cls: 'bg-muted-foreground/35', label: 'idle' },
    { k: 'slept', v: t.slept, rate: 0, cls: 'bg-sleep', label: 'asleep' },
  ]
}

// "since 10:00", or "10:00 to 18:20" once the set is finished or Claude Code has closed.
export function elapsedLabel(t: Timing, today: string): string {
  const from = when(t.start ?? t.t0, today)
  return t.until ? `from ${from} to ${when(t.until, today)}` : `since ${from}`
}

// What the crew is doing right now, for the end of the legend.
export function crewNow(state: State, r: Rates): { label: string; live: boolean } {
  const t = state.current?.timing
  if (t?.done) return { label: 'finished', live: false }
  if (state.lead.state === 'closed') return { label: 'Claude Code closed', live: false }
  if (r.active) return { label: 'at work', live: true }
  return { label: state.lead.state === 'stopped' ? 'stopped' : 'idle', live: false }
}

export function TimeBar({ t, r, values, now }: { t: Timing; r: Rates; values: 'time' | 'percent'; now?: { label: string; live: boolean } }) {
  const parts = timeParts(t, r)
  const sum = parts.reduce((a, p) => a + p.v, 0)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {sum > 0 && parts.map((p) => p.v > 0 && <div key={p.k} className={`h-full ${p.cls}`} style={{ width: `${(p.v * 100) / sum}%` }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
        {parts.map((p) => (
          <span key={p.k} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${p.cls}`} />
            {p.label}{' '}
            {values === 'time'
              ? <Duration secs={p.v} live={p.rate > 0} className="text-foreground" />
              : <span className="tabular">{pct(p.v, sum)}</span>}
          </span>
        ))}
        {now && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            {now.live && <span className="crew-pulse size-1.5 rounded-full bg-now" />}
            {now.label}
          </span>
        )}
      </div>
    </div>
  )
}

// The explanation of the split, for the Explain disclosures.
export function TimeHelp({ t }: { t: Timing }): ReactNode {
  return (
    <>
      <p>
        The elapsed time since the set started (when its task list was committed) splits into four parts that add up to it. A ticking value
        (<span className="tabular">02:53:22</span>, colons blinking) is growing right now. One like <span className="tabular">1h 19m</span>{' '}
        changes only when the page updates: elapsed and idle time grow once a minute while Claude Code is open and nothing runs.
      </p>
      <Terms
        items={[
          ['Crew at work', 'At least one agent running, or the lead working. It ticks only then.'],
          ['Agents at work', 'At least one subagent running. Agents working side by side count once here.'],
          ['Lead alone', <>The lead working, from your message to the end of its reply, with no subagent running: planning, briefing, checking, merging.{t.leadFrom ? <> Recorded from {hm(t.leadFrom)}; before that it counts as idle.</> : null}</>],
          ['Idle', 'Awake, and nothing running: the lead waiting for your answer, stopped with /crew stop, or Claude Code closed. Never ticks.'],
          ['Asleep', 'The computer asleep, measured at each crew event (macOS). Left out of every other figure.'],
        ]}
      />
      <HelpHead>When the clocks stop</HelpHead>
      <p>
        The work clocks (crew, agents, lead alone, and the task and role times) stop when the last agent stops and the lead finishes its
        reply, and when you stop the crew. When Claude Code closes, its agents end with it and everything stops, elapsed time included; the
        page says "Claude Code closed". If it comes back, the time it was closed counts as idle. When every task is accepted, the set is
        finished and its elapsed time ends at its last run.
      </p>
    </>
  )
}
