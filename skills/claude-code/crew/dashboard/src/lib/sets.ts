// Several task sets can be open at once, each led from its own checkout. The page shows one at a
// time: the header's set switcher picks it, and `viewOf` gives the state as if it were the only
// one. Requests, questions and defects live in each set's files and in the project's backlog
// (.crew/queue.md, .crew/defects.md); a set's view keeps the backlog's too.

import type { Defect, Question, Request, State, Task } from './types'

type Placed = { set: string | null }

// The state about one open set (`slug`, else the current one): its tasks, timing, handoff, lead
// and agents, its requests and defects with the backlog's, its compactions and its journal lines
// (those of no known set too). With fewer than two open sets, the state as it is. `sets` stays
// whole: the Sets tab lists them all.
export function viewOf(state: State, slug: string | null): State {
  if (state.open.length < 2) return state
  const cur = state.open.find((o) => o.slug === slug) ?? state.open.find((o) => o.slug === state.current?.slug) ?? state.open[0]
  const lead = state.roster.leads.find((l) => l.session === cur.lead) ?? null
  const mine = (x: Placed) => x.set == null || x.set === cur.slug
  const requests = state.queue.requests.filter(mine)
  const questions = state.queue.questions.filter(mine)
  const items = state.defects.items.filter(mine)
  return {
    ...state,
    current: cur,
    open: [cur],
    lead: lead?.state ?? { state: 'closed', since: null, sinceEpoch: null },
    handoff: cur.handoff ?? lead?.handoff ?? null,
    roster: {
      lead,
      leads: state.roster.leads.filter((l) => l.set === cur.slug),
      // Agents from before sets were recorded: by the session that started them, else the main
      // checkout's set's (there was only one lead then).
      past: state.roster.past.filter((p) => p.set === cur.slug || (p.set == null && (p.session ? p.session === lead?.session : cur.checkout === state.repo.root))),
    },
    // Its lead's agents; without a lead (or a session on record), the set's.
    agents: state.agents.filter((a) => (lead && a.session ? a.session === lead.session : mine(a))),
    queue: { requests, questions, counts: queueCounts(requests, questions) },
    defects: { items, summary: defectSummary(items) },
    compactions: cur.compactions,
    journal: { total: state.journal.total, entries: state.journal.entries.filter(mine) },
  }
}

function queueCounts(requests: Request[], questions: Question[]): State['queue']['counts'] {
  const n = (st: string) => requests.filter((r) => r.state === st).length
  return { queued: n('queued'), scheduled: n('scheduled'), done: n('done'), dropped: n('dropped'), openQuestions: questions.filter((q) => q.state === 'open').length }
}

// model.mjs's defectSummary.
function defectSummary(items: Defect[]): State['defects']['summary'] {
  const s = { total: items.length, deferred: 0, deferredMedium: 0, scheduled: 0, fixed: 0, dropped: 0, promoted: 0 }
  for (const d of items) {
    if (d.state in s && d.state !== 'total') s[d.state as keyof typeof s]++
    if (d.promoted) s.promoted++
    if (d.state === 'deferred' && d.severity === 'medium') s.deferredMedium++
  }
  return s
}

// Whether the entries come from more than one place (a set and the backlog, or several sets).
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
