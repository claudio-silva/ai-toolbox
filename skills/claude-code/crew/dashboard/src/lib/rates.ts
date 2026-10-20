// Which totals are still growing, and how fast: one second per second for each agent run still
// open that adds to it. Worked out from the open runs in the timing, so the page can keep the
// numbers moving between two states from the server.

import type { Phase, State } from './types'

export interface Rates {
  clock: number
  busy: number
  idle: number
  taskTime: number
  phases: Record<Phase, number>
  task: (id: string) => number
  taskPhase: (id: string, p: Phase) => number
  setLevel: number
  role: (type: string) => number
}

const NONE: Rates = {
  clock: 0, busy: 0, idle: 0, taskTime: 0, phases: { build: 0, review: 0, rework: 0, other: 0 },
  task: () => 0, taskPhase: () => 0, setLevel: 0, role: () => 0,
}

export function rates(state: State): Rates {
  const t = state.current?.timing
  if (!t || t.done) return NONE
  const open = t.runs.filter((r) => r.open)
  const onTask = open.filter((r) => r.task)
  const count = (f: (r: (typeof open)[number]) => boolean) => open.filter(f).length
  return {
    clock: 1,
    busy: open.length ? 1 : 0,
    idle: open.length ? 0 : 1,
    taskTime: onTask.length,
    phases: {
      build: count((r) => Boolean(r.task) && r.phase === 'build'),
      review: count((r) => Boolean(r.task) && r.phase === 'review'),
      rework: count((r) => Boolean(r.task) && r.phase === 'rework'),
      other: 0,
    },
    task: (id) => count((r) => r.task === id),
    taskPhase: (id, p) => count((r) => r.task === id && r.phase === p),
    setLevel: count((r) => !r.task),
    role: (type) => count((r) => (r.type || 'unknown') === type),
  }
}
