// The model served by ../../scaffold/dashboard/model.mjs (buildState). Keep the two in step.

// model.mjs's MODEL_VERSION: the page shows only states of this shape.
export const MODEL_VERSION = 3

export type StatusKey = 'accepted' | 'progress' | 'review' | 'rework' | 'blocked' | 'pending'
export type Phase = 'build' | 'review' | 'rework' | 'other'

export interface Agent {
  id: string
  type: string
  description: string
  model: string
  effort: string
  name: string
  started: number
  since: string
  runStart: number
  kind: 'first' | 'resume'
  task: string | null
  // The lead's session that started it, and its task set (null: not recorded).
  session: string
  set: string | null
}

// A subagent that is not running: when its last run ended and how.
export interface PastAgent {
  id: string
  type: string
  name: string
  description: string
  model: string
  effort: string
  started: number
  ended: number
  runs: number
  status: string
  task: string | null
  session: string
  set: string | null
}

export type LeadState = { state: 'working' | 'agents' | 'waiting' | 'stopped' | 'closed'; since: string | null; sinceEpoch: number | null; agentsFinishing?: number }

export interface Handoff { written: string; where: string; next: string; path: string }

// A lead: one per checkout, with the task set open there (null: none). reach: how the page's
// messages get to it (null: they can't now). awake: its caffeinate runs.
export interface LeadInfo {
  session: string
  alive: boolean
  checkout: string
  main: boolean
  label: string
  branch: string
  set: string | null
  setTitle: string | null
  state: LeadState
  agents: number
  model: string
  effort: string
  window: number
  compactAt: number
  reach: 'paseo' | 'socket' | null
  awake?: boolean
  handoff: Handoff | null
}

// One thing in a transcript (model.mjs transcriptEntries).
export type Entry =
  | { kind: 'user'; key: string; ts: number; text: string; via?: 'dashboard' }
  | { kind: 'peer'; key: string; ts: number; text: string }
  | { kind: 'summary'; key: string; ts: number; text: string }
  | { kind: 'text' | 'error' | 'thinking'; key: string; ts: number; ctx: number; text: string }
  | { kind: 'tool'; key: string; ts: number; ctx: number; id: string; name: string; summary: string; detail: string }
  | { kind: 'result'; key: string; ts: number; id: string; error: boolean; text: string }
  | { kind: 'compact'; key: string; ts: number; pre: number }

export interface Shot {
  name: string
  path: string
  mtime: number
}

export interface Task {
  id: string
  num: number
  status: StatusKey
  title: string
  flags: string[]
  deps: string[]
  spec: string
  specPath: string | null
  agents: string[]
  screenshots: Shot[]
  screenshotCount: number
}

export interface Run {
  start: number
  end: number
  open: boolean
  agentId: string
  type: string
  kind: 'first' | 'resume'
  status: string
  phase: Phase
  task: string | null
  slept: number
  active: number
  name: string
  description: string
  model: string
  effort: string
}

export interface TaskTime {
  id: string
  build: number
  review: number
  rework: number
  changes: number
  active: number
  slept: number
  runs: number
}

export interface Timing {
  start: number | null
  t0: number
  end: number
  done: boolean
  until: number | null
  clock: number
  slept: number
  busy: number
  active: number
  leadAlone: number
  idle: number
  leadFrom: number | null
  taskTime: number
  phases: { build: number; review: number; rework: number }
  changes: number
  byType: Record<string, number>
  criticalPath: { ids: string[]; seconds: number; headroom: number }
  perTask: TaskTime[]
  setLevel: { types: string[]; active: number; slept: number } | null
  runs: Run[]
  sleeps: { from: number; to: number; secs: number }[]
}

export type Counts = Record<StatusKey, number>

export interface TaskSet {
  file: string
  rel: string
  slug: string
  where: string
  checkout: string
  lead: string | null
  title: string
  total: number
  accepted: number
  counts: Counts
  closed: string
  stage: string
  branch: string
  live: boolean
  mtime: number
  current: boolean
}

// An open task set as the page shows it (the current one, or any in `open`). lead: the session
// leading it, if any.
export interface CurrentSet {
  file: string
  rel: string
  slug: string
  where: string
  checkout: string
  lead: string | null
  handoff: Handoff | null
  title: string
  stage: string
  branch: string
  total: number
  accepted: number
  counts: Counts
  tasks: Task[]
  currentTask: string | null
  timing: Timing | null
  // Its lead's and its agents' compactions.
  compactions: Compactions | null
}

export interface Request {
  id: string
  date: string
  text: string
  affects: string
  slot: string
  status: string
  state: string
  set: string | null
  setTitle: string | null
}

export interface Question {
  id: string
  date: string
  text: string
  default: string
  status: string
  state: string
  set: string | null
  setTitle: string | null
}

export interface Defect {
  id: string
  date: string
  text: string
  where: string
  from: string
  severity: string
  slot: string
  status: string
  state: string
  note: string
  promoted: boolean
  set: string | null
  setTitle: string | null
}

export interface Compaction {
  epoch: number
  kind: 'lead' | 'sub'
  id: string
  label: string
  model: string
  effort: string
  pre: number
  post: number
  durationMs: number
  trigger: string
  cost: number | null
  turns: number
  open: boolean
  saved: number | null
  net: number | null
  started: number
  // The lead's session it belongs to (a subagent's: the session that started it), and its set.
  session: string
  set: string | null
}

export interface Compactions {
  summary: {
    lead: { count: number; avgPre: number; interval: number | null }
    sub: { count: number; avgPre: number; afterStart: number | null }
    overhead: number | null
    saved: number | null
    net: number | null
  }
  rows: Compaction[]
}

export interface JournalEntry {
  day: string
  time: string
  actor: string
  branch: string
  text: string
  kind: 'lead' | 'system' | 'start' | 'stop' | 'resume' | 'other'
  by?: string
  agentType?: string
  agentName?: string
  model?: string
  effort?: string
  status?: string
  // The task set open in the checkout that wrote it (null: none, or a checkout gone since).
  set: string | null
}

// A newer Crew, from the server's daily check of the published RELEASES.md.
export interface Release { version: string; date: string; body: string }
export interface UpdateInfo {
  enabled: boolean
  current: string | null
  latest: string | null
  available: boolean
  simulated: boolean
  checking: boolean
  releases: Release[]
  checkedAt: number | null
  error: string | null
  notes: string
  how: { via: string; command: string }[]
}

export interface State {
  version: number
  generatedAt: number
  today: string
  repo: {
    name: string; root: string; branch: string; sha: string; state: 'branch' | 'detached' | 'none'
    icon: { path: string; w: number; h: number; mtime: number } | null
  }
  // The state of `roster.lead`.
  lead: LeadState
  keepAwake: { on: boolean; mode: 'claude' | '12h' | null; since: number | null; battery: boolean; stopped: boolean; bySession: string[] } | null
  agents: Agent[]
  // lead: the current set's lead, else the first of `leads` (live ones first).
  roster: { lead: LeadInfo | null; leads: LeadInfo[]; past: PastAgent[] }
  current: CurrentSet | null
  open: CurrentSet[]
  sets: TaskSet[]
  queue: {
    requests: Request[]
    questions: Question[]
    counts: { queued: number; scheduled: number; done: number; dropped: number; openQuestions: number }
  }
  defects: {
    items: Defect[]
    summary: { total: number; deferred: number; deferredMedium: number; scheduled: number; fixed: number; dropped: number; promoted: number }
  }
  compactions: Compactions | null
  journal: { total: number; entries: JournalEntry[] }
  handoff: Handoff | null
  worktrees: { path: string; branch: string }[]
  live: boolean
  update?: UpdateInfo
}
