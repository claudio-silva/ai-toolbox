// The model served by ../../scaffold/dashboard/model.mjs (buildState). Keep the two in step.

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
}

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
  where: string
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

export interface CurrentSet {
  file: string
  rel: string
  where: string
  title: string
  stage: string
  branch: string
  total: number
  accepted: number
  counts: Counts
  tasks: Task[]
  currentTask: string | null
  timing: Timing | null
}

export interface Request {
  id: string
  date: string
  text: string
  affects: string
  slot: string
  status: string
  state: string
}

export interface Question {
  id: string
  date: string
  text: string
  default: string
  status: string
  state: string
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
  lead: { state: 'working' | 'agents' | 'waiting' | 'stopped' | 'closed'; since: string | null; sinceEpoch: number | null; agentsFinishing?: number }
  keepAwake: { on: boolean; mode: 'claude' | '12h' | null; since: number | null; battery: boolean; stopped: boolean } | null
  agents: Agent[]
  current: CurrentSet | null
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
  compactions: {
    summary: {
      lead: { count: number; avgPre: number; interval: number | null }
      sub: { count: number; avgPre: number; afterStart: number | null }
      overhead: number | null
      saved: number | null
      net: number | null
    }
    rows: Compaction[]
  } | null
  journal: { total: number; entries: JournalEntry[] }
  handoff: { written: string; where: string; next: string; path: string } | null
  worktrees: { path: string; branch: string }[]
  live: boolean
  update?: UpdateInfo
}
