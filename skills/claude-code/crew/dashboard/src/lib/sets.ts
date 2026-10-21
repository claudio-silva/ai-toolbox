// Requests, questions and defects live in each task set's files and in the project's backlog
// (.crew/queue.md, .crew/defects.md). These say where one is, when it is not the only place.

import type { State, Task } from './types'

// Whether the entries come from more than one place (two sets, or a set and the backlog).
export function manyPlaces(state: State): boolean {
  const all = [...state.queue.requests, ...state.queue.questions, ...state.defects.items]
  return new Set(all.map((e) => e.set ?? '')).size > 1 || state.open.length > 1
}

// Where an entry is: its set's title, or the backlog.
export function placeOf(e: { set: string | null; setTitle: string | null }): string {
  return e.set == null ? 'backlog' : e.setTitle || e.set
}

// The tasks an entry's T-numbers refer to: its set's (when open), else the current set's.
export function tasksOf(state: State, set: string | null): Task[] {
  return (set && state.open.find((o) => o.slug === set)?.tasks) || state.current?.tasks || []
}
