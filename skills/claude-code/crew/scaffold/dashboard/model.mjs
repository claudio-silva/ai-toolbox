// The crew dashboard's model: everything the page shows, computed from .crew/ and git.
//
// Installed by `/crew setup` as <project>/.crew/dashboard/model.mjs; used by server.mjs.
// No dependencies. Reads only, except the set-start cache that bin/crew also keeps
// (tmp/journal-state/set-start/). The bash script records state (hooks, journal, queue,
// defects, runs, sleep, compactions); this module turns it into one JSON object.
//
//   buildState(root, { now }) -> the state the page renders (see the shape at the bottom).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// The shape of buildState's result. The page ignores a state of another version (one sent by
// the previous server while a new page loads, during an update); keep lib/types.ts in step.
export const MODEL_VERSION = 3;

const TASK_RE = /^[Tt]0*([0-9]+)([^0-9]|$)/;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function stat(p) {
  try { return fs.statSync(p); } catch { return null; }
}
function isDir(p) { return stat(p)?.isDirectory() ?? false; }
function isFile(p) { return stat(p)?.isFile() ?? false; }
function listDir(p) {
  try { return fs.readdirSync(p).sort(); } catch { return []; }
}
function trim(s) { return String(s ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''); }
function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}
function num(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function isInt(s) { return /^[0-9]+$/.test(String(s ?? '')); }

// Git with a clean environment: act on the directory we name, never on an inherited repository.
const GIT_ENV = { ...process.env };
delete GIT_ENV.GIT_DIR;
delete GIT_ENV.GIT_WORK_TREE;
delete GIT_ENV.GIT_INDEX_FILE;
function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, env: GIT_ENV,
    }).replace(/\n$/, '');
  } catch { return ''; }
}
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
  } catch { return ''; }
}
function onPath(cmd) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    try { fs.accessSync(path.join(dir, cmd), fs.constants.X_OK); return true; } catch { /* next */ }
  }
  return false;
}

// safeName: the file name bin/crew derives from a text (byte-wise, like `tr -c` under LC_ALL=C).
export function safeName(s) {
  let out = '';
  for (const b of Buffer.from(String(s), 'utf8')) {
    const c = String.fromCharCode(b);
    out += b < 128 && /[A-Za-z0-9._-]/.test(c) ? c : '_';
  }
  if (out === '' || out === '.' || out === '..') out = '_' + out;
  return out;
}

// Local calendar day and HH:MM of an epoch (seconds).
export function localDay(epoch) {
  const d = new Date(epoch * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function localHM(epoch) {
  const d = new Date(epoch * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// The task number of a description that starts with T<NN> (7 for "T07 autosave"); null otherwise.
export function taskNum(text) {
  const m = TASK_RE.exec(text || '');
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Parsers (the same rules as bin/crew's awk)
// ---------------------------------------------------------------------------

export function statusKey(s) {
  const l = String(s).toLowerCase();
  if (l.includes('accept')) return 'accepted';
  if (l.includes('review')) return 'review';
  if (l.includes('rework')) return 'rework';
  if (l.includes('block')) return 'blocked';
  if (l.includes('progress')) return 'progress';
  return 'pending';
}

function indexField(line, label) {
  let s = line.replace(new RegExp('^.*' + label + ':[ \\t]*'), '');
  s = s.replace(/\*\*/g, '').replace(/`/g, '');
  return trim(s);
}

// An index: title, Closed / Stage / Branch lines, and the task table
// (#, Status, Task, Flags, Depends on, Spec). Dependencies may be written T01, 01 or 1.
export function parseIndex(text) {
  let title = '';
  let closed = '';
  let stage = '';
  let branch = '';
  const raw = [];
  for (const line of String(text).split('\n')) {
    if (title === '' && /^# /.test(line)) {
      title = trim(line.slice(2).replace(/\r$/, '').replace(/[ \t]+(—|-)[ \t]+tasks[ \t]*$/, ''));
    }
    if (/^[ \t]*(-[ \t]+)?(\*\*)?Closed:/.test(line)) closed = indexField(line, 'Closed') || 'yes';
    if (/^[ \t]*(-[ \t]+)?(\*\*)?Stage:/.test(line)) {
      stage = indexField(line, 'Stage');
      if (stage.startsWith('<')) stage = '';
    }
    if (/^[ \t]*(-[ \t]+)?(\*\*)?Branch:/.test(line)) branch = indexField(line, 'Branch');
    if (/^[ \t]*\|/.test(line)) {
      const f = line.split('|');
      if (f.length < 8) continue;
      const id = trim(f[1]);
      if (!/^[A-Za-z]*[0-9]+$/.test(id)) continue;
      raw.push({
        id,
        num: Number(id.replace(/[^0-9]/g, '')),
        status: statusKey(trim(f[2])),
        title: trim(f[3]).replace(/\t/g, ' '),
        flags: trim(f[4]),
        deps: trim(f[5]),
        spec: trim(f[6]),
      });
    }
  }
  const rows = raw.map((r, i) => {
    const deps = [];
    for (const m of r.deps.matchAll(/[0-9]+/g)) {
      const k = Number(m[0]);
      const j = raw.findIndex((x, jj) => x.num === k && jj !== i);
      if (j >= 0) deps.push(raw[j].id);
    }
    let flags = r.flags;
    if (flags === '—' || flags === '-' || flags.toLowerCase() === 'none') flags = '';
    return {
      id: r.id,
      num: r.num,
      status: r.status,
      title: r.title,
      flags: flags ? flags.split(',').map((x) => trim(x)).filter(Boolean) : [],
      deps,
      spec: r.spec.replace(/`/g, ''),
    };
  });
  return { title, closed, stage, branch, rows };
}

// Queue entries of one kind: R (requests) or F (founder questions).
export function parseQueue(text, kind) {
  const re = new RegExp('^[ \\t]*- \\[' + kind + '[0-9]+\\]');
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!re.test(line)) continue;
    let l = line.replace(/^[ \t]*- \[/, '');
    const id = l.slice(0, l.indexOf(']'));
    l = l.slice(l.indexOf(']') + 1);
    const p = l.split(' · ');
    const e = { id, date: trim(p[0]), text: '', affects: '', slot: '', status: '', default: '' };
    const text = [];
    for (let i = 1; i < p.length; i++) {
      const v = trim(p[i]);
      if (/^affects:/.test(v)) e.affects = v.replace(/^affects:[ \t]*/, '');
      else if (/^slot:/.test(v)) e.slot = v.replace(/^slot:[ \t]*/, '');
      else if (/^status:/.test(v)) e.status = v.replace(/^status:[ \t]*/, '').toLowerCase();
      else if (/^note:/.test(v)) e.note = v.replace(/^note:[ \t]*/, '');
      else if (/^default taken:/.test(v)) e.default = v.replace(/^default taken:[ \t]*/, '');
      else text.push(v);
    }
    e.text = text.join(' · ');
    e.state = (e.status.split(/[ \t(]/)[0] || '');
    if (kind === 'R') delete e.default;
    else { delete e.affects; delete e.slot; }
    out.push(e);
  }
  return out;
}

// Defect entries: id, date, symptom, where, from, severity, slot, status, promoted.
export function parseDefects(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!/^[ \t]*- \[D[0-9]+\]/.test(line)) continue;
    let l = line.replace(/^[ \t]*- \[/, '');
    const id = l.slice(0, l.indexOf(']'));
    l = l.slice(l.indexOf(']') + 1);
    const p = l.split(' · ');
    const e = { id, date: trim(p[0]), text: '', where: '', from: '', severity: '', slot: '', status: '', note: '', promoted: false };
    const text = [];
    for (let i = 1; i < p.length; i++) {
      const v = trim(p[i]);
      if (/^where:/.test(v)) e.where = v.replace(/^where:[ \t]*/, '');
      else if (/^from:/.test(v)) e.from = v.replace(/^from:[ \t]*/, '');
      else if (/^severity:/.test(v)) e.severity = v.replace(/^severity:[ \t]*/, '').toLowerCase();
      else if (/^slot:/.test(v)) e.slot = v.replace(/^slot:[ \t]*/, '');
      else if (/^status:/.test(v)) e.status = v.replace(/^status:[ \t]*/, '').toLowerCase();
      else if (/^note:/.test(v)) e.note = v.replace(/^note:[ \t]*/, '');
      else if (v === 'promoted') e.promoted = true;
      else text.push(v);
    }
    e.text = text.join(' · ');
    e.state = e.status.replace(/[ \t].*$/, '');
    out.push(e);
  }
  return out;
}

export function defectSummary(items) {
  const s = { total: items.length, deferred: 0, deferredMedium: 0, scheduled: 0, fixed: 0, dropped: 0, promoted: 0 };
  for (const d of items) {
    if (d.state in s && d.state !== 'total') s[d.state]++;
    if (d.promoted) s.promoted++;
    if (d.state === 'deferred' && d.severity === 'medium') s.deferredMedium++;
  }
  return s;
}

// Split "actor · text" after the time: the actor may hold " · " inside parentheses
// ("→ builder (sonnet · high)"), the text is kept whole.
function splitActor(rest) {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (depth === 0 && rest.startsWith(' · ', i)) return [rest.slice(0, i), rest.slice(i + 3)];
  }
  return [rest, ''];
}

const STATUS_WORDS = new Set(['DONE', 'PARTIAL', 'BLOCKED', 'ACCEPT', 'CHANGES', 'RECOMMENDATION', 'finished']);

export function parseJournalLine(s, day) {
  const e = { day, time: '', actor: '', branch: '', text: '', kind: 'other' };
  const i = s.indexOf(' · ');
  const when = i < 0 ? s : s.slice(0, i);
  const m = /^([0-9]{4}-[0-9]{2}-[0-9]{2}) ([0-9]{1,2}:[0-9]{2})$/.exec(when);
  if (m) { e.day = m[1]; e.time = m[2]; } else e.time = when;
  if (i < 0) return e;
  let [actor, text] = splitActor(s.slice(i + 3));
  const b = /^(.*) \[([^\]]+)\]$/.exec(actor);
  if (b) { actor = b[1]; e.branch = b[2]; }
  e.actor = actor;
  e.text = text;
  if (actor === 'lead') e.kind = 'lead';
  else if (actor === 'system') e.kind = 'system';
  else if (actor.startsWith('←')) e.kind = 'stop';
  else if (actor.startsWith('↺')) e.kind = 'resume';
  else if (/(^|\s)→(\s|$)/.test(actor)) e.kind = 'start';
  if (e.kind === 'start') {
    const a = /^(?:(\S+) )?→ (\S+)(?: \((.+) · (.+)\))?$/.exec(actor);
    if (a) Object.assign(e, { by: a[1] || '', agentType: a[2], model: a[3] || '', effort: a[4] || '' });
  } else if (e.kind === 'stop') {
    e.agentType = actor.replace(/^←\s*/, '');
    const w = text.split(' · ')[0];
    if (STATUS_WORDS.has(w)) e.status = w;
  } else if (e.kind === 'resume') {
    e.agentName = actor.replace(/^↺\s*/, '');
  }
  return e;
}

export function parseJournal(text, limit = 400) {
  let day = '';
  const out = [];
  for (const line of String(text).split('\n')) {
    const h = /^## ([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(line);
    if (h) { day = h[1]; continue; }
    if (!line.startsWith('- ')) continue;
    out.push(parseJournalLine(line.slice(2).replace(/\r$/, ''), day));
  }
  return { total: out.length, entries: out.slice(-limit) };
}

export function parseHandoff(text) {
  const lines = String(text).split('\n');
  const first = (re) => lines.find((l) => re.test(l));
  const w = first(/^# Crew handoff[ \t]*—[ \t]*/);
  const where = first(/Where we are:/);
  const next = first(/Next step:/);
  return {
    written: w ? trim(w.replace(/^# Crew handoff[ \t]*—[ \t]*/, '')) : '',
    where: where ? trim(where.replace(/^.*Where we are:[*\s]*/, '')) : '',
    next: next ? trim(next.replace(/^.*Next step:[*\s]*/, '')) : '',
  };
}

// ---------------------------------------------------------------------------
// Agents, the lead, keep-awake
// ---------------------------------------------------------------------------

// An agents/<id> record: key=value lines; the last line of each key wins (run_start grows).
export function loadAgent(stateDir, id) {
  const t = read(path.join(stateDir, 'agents', id));
  if (t == null) return null;
  const a = { id, type: '', description: '', model: '', effort: '', name: '', started: 0, since: '', runStart: 0, session: '', set: null };
  for (const line of t.split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1);
    if (k === 'type') a.type = v;
    else if (k === 'description') a.description = v;
    else if (k === 'model') a.model = v;
    else if (k === 'effort') a.effort = v;
    else if (k === 'name') a.name = v;
    else if (k === 'started') a.started = num(v);
    else if (k === 'since') a.since = v;
    else if (k === 'run_start') a.runStart = num(v);
    else if (k === 'session') a.session = v;
    else if (k === 'set') a.set = v;
  }
  return a;
}

function readRuns(stateDir) {
  const t = read(path.join(stateDir, 'runs.tsv'));
  if (!t) return [];
  const out = [];
  for (const line of t.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    out.push({
      start: num(f[0]), end: num(f[1]), id: f[2] || '', type: f[3] || '', task: f[4] || '', kind: f[5] || 'first', status: f[6] || '',
      session: f.length > 7 ? f[7] || '' : null, set: f.length > 8 ? f[8] || '' : null,
    });
  }
  return out;
}

function readSleeps(stateDir) {
  const t = read(path.join(stateDir, 'sleep.tsv'));
  if (!t) return [];
  const out = [];
  for (const line of t.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    out.push({ from: num(f[0]), to: num(f[1]), secs: num(f[2]) });
  }
  return out;
}

// ps's elapsed time ([[dd-]hh:]mm:ss) in seconds; null when it is not one.
export function etimeSecs(t) {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(trim(t));
  return m ? ((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 60 + Number(m[3])) * 60 + Number(m[4]) : null;
}

// Which sessions still have their Claude Code process (bin/crew keeps each one's pid and start
// time in claude/<session>; a pid whose process started at another time was reused). A session
// without a recorded pid (an older crew, or none found) counts as running while its transcript
// was written in the last hour. seen: each transcript's last write. lastSeen: the newest, the
// best guess of when a crew whose processes are all gone stopped.
export function claudeSessions(stateDir, now = Math.floor(Date.now() / 1000)) {
  const pids = new Map();
  const starts = new Map();
  for (const sess of listDir(path.join(stateDir, 'claude'))) {
    const [pid, start] = trim(read(path.join(stateDir, 'claude', sess)) || '').split(/\s+/);
    if (isInt(pid)) pids.set(sess, Number(pid));
    if (isInt(start)) starts.set(sess, Number(start));
  }
  const alive = new Set();
  if (pids.size) {
    // bin/crew records when the process started: a later Claude Code that reused the pid is not it.
    const out = run('ps', ['-o', 'pid=,etime=,args=', '-p', [...new Set(pids.values())].join(',')]);
    const wall = Math.floor(Date.now() / 1000);
    const live = new Map();
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s+(\S+)\s+(.*)$/.exec(line);
      if (m && /claude/.test(m[3])) live.set(Number(m[1]), wall - (etimeSecs(m[2]) ?? 0));
    }
    for (const [sess, pid] of pids) {
      if (!live.has(pid)) continue;
      if (starts.has(sess) && Math.abs(live.get(pid) - starts.get(sess)) > 3) continue;
      alive.add(sess);
    }
  }
  let lastSeen = 0;
  let unknownLive = false;
  const transcriptOf = new Map();
  const seen = new Map();
  for (const sess of listDir(path.join(stateDir, 'transcripts'))) {
    const tp = trim(read(path.join(stateDir, 'transcripts', sess)) || '');
    if (!tp) continue;
    transcriptOf.set(sess, tp);
    const m = Math.floor((stat(tp)?.mtimeMs ?? 0) / 1000);
    seen.set(sess, m);
    if (m > lastSeen) lastSeen = m;
    if (!pids.has(sess) && m > now - 3600) unknownLive = true;
  }
  // No transcript to go by: the last crew event (bin/crew samples the clock at each one).
  if (!lastSeen) {
    const ev = trim(read(path.join(stateDir, 'clock')) || '').split(/\s+/)[0];
    if (isInt(ev)) lastSeen = Number(ev);
  }
  return { pids, alive, transcriptOf, seen, lastSeen, live: alive.size > 0 || unknownLive };
}

// Whether a session's Claude Code runs: by its recorded process; without one (an older crew),
// whether any crew Claude Code seems to.
export function sessionAlive(sessions, sess) {
  return sessions.pids.has(sess) ? sessions.alive.has(sess) : sessions.live;
}

// Running subagents (running/<id>, which holds the session that runs it). One whose Claude Code
// process is gone is not running any more: it goes to `ended`, with its transcript's last write
// as the end (bin/crew records the same at the next session start).
function runningAgents(stateDir, runs, sessions) {
  const ids = new Set(runs.map((r) => r.id));
  const agents = [];
  const ended = [];
  for (const id of listDir(path.join(stateDir, 'running'))) {
    const a = loadAgent(stateDir, id) || { id, type: 'unknown', description: '', model: '', effort: '', name: '', started: 0, since: '', runStart: 0 };
    const sess = trim(read(path.join(stateDir, 'running', id)) || '');
    const agent = {
      ...a,
      model: a.model || 'default',
      effort: a.effort || 'default',
      runStart: a.runStart || a.started,
      kind: ids.has(id) ? 'resume' : 'first',
      taskNum: taskNum(a.description),
      session: sess || a.session,
    };
    const gone = sess ? !sessionAlive(sessions, sess) : !sessions.live;
    if (!gone) { agents.push(agent); continue; }
    const tp = sessions.transcriptOf.get(sess);
    const own = tp ? stat(path.join(tp.replace(/\.jsonl$/, ''), 'subagents', `agent-${id}.jsonl`)) : null;
    const end = Math.floor((own?.mtimeMs ?? (tp ? stat(tp)?.mtimeMs : 0) ?? 0) / 1000) || sessions.lastSeen || agent.runStart;
    ended.push({
      start: agent.runStart, end: Math.max(agent.runStart, end), id, type: agent.type, task: agent.taskNum == null ? '' : String(agent.taskNum),
      kind: agent.kind, status: 'interrupted', session: agent.session, set: a.set,
    });
  }
  return { agents, ended };
}

// lead.tsv: the leads' state changes (epoch, working|idle|stopped, session, task set), oldest
// first. Lines from an older crew have no session or set (null).
function readLeadLog(stateDir) {
  const t = read(path.join(stateDir, 'lead.tsv'));
  if (!t) return [];
  const out = [];
  for (const line of t.split('\n')) {
    const f = line.split('\t');
    if (isInt(f[0]) && f[1]) out.push({ at: Number(f[0]), state: f[1], session: f.length > 2 ? f[2] : null, set: f.length > 3 ? f[3] : null });
  }
  return out.sort((a, b) => a.at - b.at);
}

// The leads' working intervals: per session, from each "working" to that session's next change;
// the last one runs to `until` (a number, or a function of the session: now while its Claude
// Code runs, else when it was last seen). Intervals of several leads may overlap.
export function leadWorkIntervals(log, until) {
  const out = [];
  const bySession = new Map();
  for (const e of log) {
    const k = e.session ?? '';
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k).push(e);
  }
  for (const [sess, l] of bySession) {
    for (let i = 0; i < l.length; i++) {
      if (l[i].state !== 'working') continue;
      const end = i + 1 < l.length ? l[i + 1].at : typeof until === 'function' ? until(sess) : until;
      if (end > l[i].at) out.push([l[i].at, end]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// A lead's state. bin/crew writes "<state> HH:MM <epoch>" in leads/<session> (older versions:
// one file, lead, for the project, without the epoch, which is then taken from HH:MM, today or,
// when that is still to come, yesterday). `alive`: whether its Claude Code runs (null: unknown).
export function leadStateOf(text, nrun, now, alive = null, seen = 0) {
  const [st = '', hm = '', ep = ''] = trim(text || '').split(/\s+/);
  let at = isInt(ep) ? Number(ep) : null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm);
  if (at == null && m) {
    const d = new Date(now * 1000);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    at = Math.floor(d.getTime() / 1000);
    if (at > now + 60) at -= 86400;
  }
  const since = hm || null;
  if (st === 'stopped') return { state: 'stopped', since, sinceEpoch: at, agentsFinishing: nrun };
  // No Claude Code process left: nobody is working or waiting, whatever the last state said.
  if (alive === false) {
    const last = seen || at;
    return { state: 'closed', since: last ? localHM(last) : since, sinceEpoch: last || null };
  }
  if (st === 'working') return { state: 'working', since, sinceEpoch: at };
  if (nrun > 0) return { state: 'agents', since: null, sinceEpoch: null };
  return { state: 'waiting', since, sinceEpoch: at };
}

// The project's single lead file (crew before per-lead state): kept for the tests and old state.
export function leadState(stateDir, nrun, now = Math.floor(Date.now() / 1000), sessions = null) {
  const t = read(path.join(stateDir, 'lead'));
  return leadStateOf(t, nrun, now, sessions ? sessions.live : null, sessions?.lastSeen || 0);
}

// Keep-awake: each lead's caffeinate (awake/<session>; an older crew kept one, keep-awake).
// `bySession`: the sessions whose caffeinate runs. `stopped`: every lead was stopped by the founder.
function keepAwake(stateDir, leads) {
  if (!onPath('caffeinate')) return null;
  const files = [path.join(stateDir, 'keep-awake'), ...listDir(path.join(stateDir, 'awake')).map((x) => path.join(stateDir, 'awake', x))];
  const recs = [];
  for (const file of files) {
    const t = read(file);
    if (t == null) continue;
    const [pid, w = ''] = trim(t).split(/\s+/);
    if (isInt(pid)) recs.push({ file, pid, watched: w, session: path.dirname(file).endsWith('awake') ? path.basename(file) : '' });
  }
  const running = new Set();
  if (recs.length) {
    for (const line of run('ps', ['-o', 'pid=,args=', '-p', recs.map((r) => r.pid).join(',')]).split('\n')) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (m && m[2].includes('caffeinate')) running.add(m[1]);
    }
  }
  const on = recs.filter((r) => running.has(r.pid));
  const since = on.length ? Math.min(...on.map((r) => Math.floor((stat(r.file)?.mtimeMs ?? 0) / 1000) || Infinity)) : null;
  const stopped = leads.length ? leads.every((l) => l.state.state === 'stopped') : /^stopped/.test(trim(read(path.join(stateDir, 'lead')) || ''));
  let battery = false;
  if (on.length) battery = (run('pmset', ['-g', 'batt']).split('\n')[0] || '').includes('Battery Power');
  return {
    on: on.length > 0, mode: on.length ? (on.every((r) => r.watched === '12h') ? '12h' : 'claude') : null,
    since: Number.isFinite(since) ? since : null, battery, stopped, bySession: on.map((r) => r.session).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Git, worktrees, task sets
// ---------------------------------------------------------------------------

function gitInfo(root) {
  let branch = git(root, ['symbolic-ref', '--short', '-q', 'HEAD']);
  let sha = git(root, ['rev-parse', '--short', 'HEAD']);
  let state = 'branch';
  if (!branch) { branch = 'detached'; state = 'detached'; }
  if (!sha) { branch = 'no git history'; sha = ''; state = 'none'; }
  return { branch, sha, state };
}

export function listWorktrees(root) {
  const out = [];
  let p = '';
  let b = '';
  for (const line of git(root, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) {
      if (p) out.push({ path: p, branch: b });
      p = line.slice(9);
      b = '';
    } else if (line.startsWith('branch ')) {
      b = line.slice(7).replace(/^refs\/heads\//, '');
    }
  }
  if (p) out.push({ path: p, branch: b });
  return out;
}

// When the set started: the time of the commit that added its index (cached once found, in the
// same file bin/crew used); before that commit, the file's birth time; null when unknown.
export function setStartEpoch(stateDir, file) {
  const key = path.join(stateDir, 'set-start', safeName(file));
  const cached = trim(read(key) || '');
  if (isInt(cached)) return Number(cached);
  const t = git(path.dirname(file), ['log', '--diff-filter=A', '--format=%ct', '-1', '--', path.basename(file)]);
  if (isInt(t)) {
    try { fs.mkdirSync(path.dirname(key), { recursive: true }); fs.writeFileSync(key, t + '\n'); } catch { /* read-only is fine */ }
    return Number(t);
  }
  const s = stat(file);
  const birth = s ? Math.floor(s.birthtimeMs / 1000) : 0;
  return birth > 0 ? birth : null;
}

// The repository's checkouts: the main one first, then the linked worktrees. Builders' worktrees
// (under a checkout's .claude/worktrees/) hold copies of a lead's set: `builder` marks them.
export function checkouts(root) {
  const wts = listWorktrees(root);
  const out = [{ path: root, branch: wts.find((w) => realpath(w.path) === root)?.branch ?? '', main: true, builder: false }];
  for (const wt of wts) {
    const p = realpath(wt.path);
    if (p === root) continue;
    out.push({ path: p, branch: wt.branch, main: false, builder: p.includes(`${path.sep}.claude${path.sep}worktrees${path.sep}`) });
  }
  return out;
}

// The task set open in a checkout (bin/crew's set_here): an open index whose Branch: is the
// branch checked out there, else the folder of a crew/<slug> branch; off a crew/ branch, the only
// open index there. `cands`: that checkout's sets.
export function openSetIn(branch, cands) {
  const open = cands.filter((c) => c.live);
  const hit = open.find((c) => branch && ((c.branch && c.branch.split(/\s+/)[0] === branch) || branch === `crew/${c.slug}`));
  if (hit) return hit;
  if (open.length === 1 && !/^crew\//.test(branch || '')) return open[0];
  return null;
}

// Every task set, once: from the checkout where it is open (its lead's), else the main checkout's
// copy, else the newest. `openIn`: checkout path -> the set open there.
function collectSets(root, crewDir) {
  const all = [];
  const openIn = new Map();
  const cks = checkouts(root);
  for (const ck of cks) {
    if (ck.builder) continue;
    const here = [];
    const tasks = path.join(ck.path, '.crew', 'tasks');
    for (const d of listDir(tasks)) {
      const file = path.join(tasks, d, 'index.md');
      const text = isFile(file) ? read(file) : null;
      if (text == null) continue;
      const idx = parseIndex(text);
      const counts = { accepted: 0, review: 0, progress: 0, rework: 0, blocked: 0, pending: 0 };
      for (const r of idx.rows) counts[r.status]++;
      here.push({
        file,
        rel: `tasks/${d}/index.md`,
        slug: d,
        where: ck.main ? '' : ck.branch || path.basename(ck.path),
        checkout: ck.path,
        crewDir: path.join(ck.path, '.crew'),
        title: idx.title || d,
        total: idx.rows.length,
        accepted: counts.accepted,
        counts,
        closed: idx.closed,
        stage: idx.stage,
        branch: idx.branch,
        live: !idx.closed,
        mtime: Math.floor((stat(file)?.mtimeMs ?? 0) / 1000),
        rows: idx.rows,
        here: false,
      });
    }
    const o = openSetIn(ck.branch, here);
    if (o) { o.here = true; openIn.set(ck.path, o); }
    all.push(...here);
  }
  // Copies of one set: the one open in its checkout, then the main checkout's, then the newest.
  const rank = (c) => [Number(c.here), Number(c.where === ''), c.mtime];
  const before = (x, y) => { const a = rank(x); const b = rank(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
  const bySlug = new Map();
  for (const c of all) if (!bySlug.has(c.slug) || before(c, bySlug.get(c.slug))) bySlug.set(c.slug, c);
  const sets = [...bySlug.values()];
  for (const [co, o] of openIn) if (bySlug.get(o.slug) !== o) openIn.delete(co);
  const worktrees = cks.filter((c) => !c.main).map((c) => ({ path: c.path, branch: c.branch }));
  return { sets, worktrees, openIn, checkouts: cks };
}

// The current set: a live main-checkout index on the current branch, else the newest live
// main-checkout index, else the newest live worktree index.
function pickCurrent(sets, branch) {
  const first = (s) => s.split(/\s+/)[0];
  let cur = sets.findIndex((s) => s.live && !s.where && s.branch && first(s.branch) === branch);
  if (cur >= 0) return cur;
  const newest = (list) => list.reduce((a, b) => (b.s.mtime > a.s.mtime ? b : a));
  const main = sets.map((s, i) => ({ s, i })).filter((x) => x.s.live && !x.s.where);
  if (main.length) return newest(main).i;
  const wt = sets.map((s, i) => ({ s, i })).filter((x) => x.s.live && x.s.where);
  if (wt.length) return newest(wt).i;
  return -1;
}

function screenshotsFor(crewDir, taskId, limit = 24) {
  const base = path.join(crewDir, 'task-data');
  const dirs = [];
  for (const d of listDir(base)) {
    if (d === taskId || d.startsWith(taskId + '-')) {
      const s = path.join(base, d, 'screenshots');
      if (isDir(s)) dirs.push(s);
    }
  }
  const shots = [];
  for (const d of dirs) {
    for (const f of listDir(d)) {
      if (!IMAGE_RE.test(f)) continue;
      const p = path.join(d, f);
      const s = stat(p);
      if (s?.isFile()) shots.push({ name: f, path: p, mtime: Math.floor(s.mtimeMs / 1000) });
    }
  }
  shots.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));
  return { total: shots.length, items: shots.slice(0, limit) };
}

// ---------------------------------------------------------------------------
// Timing (the current set): runs, sleep, phases, the critical path
// ---------------------------------------------------------------------------

export function phaseOf(type, kind) {
  if (type === 'builder' || type === 'worker') return kind === 'resume' ? 'rework' : 'build';
  if (type === 'debugger') return 'rework';
  if (type === 'reviewer') return 'review';
  return 'other';
}

// tasks: [{ id, num, depNums: [n] }] in index order; runs: finished runs (runs.tsv);
// open: the running agents' current runs (end = now); sleeps: sleep.tsv; start: the set start
// (epoch or null); done: every task accepted and nothing running (the clock stops at the last
// run's end). Null when the set has no runs yet.
export function computeTiming({ tasks, runs, open = [], sleeps, start, now, done = false, closedAt = null, agentOf = () => null, leadWork = [], leadFrom = null }) {
  const byNum = new Map();
  tasks.forEach((t, k) => byNum.set(t.num, k));
  const all = [
    ...runs.map((r) => ({ ...r, open: false })),
    ...open.map((r) => ({ ...r, end: now, open: true, status: 'running' })),
  ].filter((r) => !(start != null && r.start < start) && r.start > 0 && r.end >= r.start);
  if (all.length === 0) return null;

  let t0 = start != null ? start : Math.min(...all.map((r) => r.start));
  const per = tasks.map(() => ({ build: 0, review: 0, rework: 0, changes: 0, active: 0, slept: 0, runs: 0 }));
  const ptot = { build: 0, review: 0, rework: 0 };
  const byType = {};
  let tot = 0;
  let chs = 0;
  let other = 0;
  let osl = 0;
  const otypes = [];
  const outRuns = [];
  for (const r of all) {
    let sl = 0;
    for (const s of sleeps) if (s.from >= r.start && s.to <= r.end) sl += s.secs;
    const aw = Math.max(0, r.end - r.start - sl);
    const ph = phaseOf(r.type, r.kind);
    const tn = r.task === '' || r.task == null ? null : Number(r.task);
    const k = tn != null && byNum.has(tn) ? byNum.get(tn) : -1;
    byType[r.type || 'unknown'] = (byType[r.type || 'unknown'] || 0) + aw;
    if (k >= 0) {
      const p = per[k];
      p.runs++;
      p.active += aw;
      p.slept += sl;
      tot += aw;
      if (ph !== 'other') { p[ph] += aw; ptot[ph] += aw; }
      if (ph === 'review' && r.status === 'CHANGES') { p.changes++; chs++; }
    } else {
      other += aw;
      osl += sl;
      if (!otypes.includes(r.type)) otypes.push(r.type);
    }
    const a = agentOf(r.id);
    outRuns.push({
      start: r.start, end: r.end, open: r.open, agentId: r.id, type: r.type, kind: r.kind, status: r.status,
      phase: ph, task: k >= 0 ? tasks[k].id : null, slept: sl, active: aw,
      name: a?.name || '', description: a?.description || '', model: a?.model || '', effort: a?.effort || '',
    });
  }

  // A union of intervals, less the sleep inside it.
  const unionAwake = (iv) => {
    const ord = iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    let total = 0;
    let cs = -1;
    let ce = 0;
    const flush = () => {
      if (cs < 0) return;
      total += ce - cs;
      for (const s of sleeps) if (s.from >= cs && s.to <= ce) total -= s.secs;
    };
    for (const [a, b] of ord) {
      if (cs >= 0 && a <= ce) { if (b > ce) ce = b; continue; }
      flush();
      cs = a;
      ce = b;
    }
    flush();
    return Math.max(0, total);
  };

  // The elapsed time runs to now, to the set's last run once it is finished, and to the last
  // sign of Claude Code once it has closed (when it comes back, the gap counts as idle).
  let endt = now;
  if (done) {
    let m = 0;
    for (const r of runs) if (r.start >= (start ?? 0) && r.end > m) m = r.end;
    if (m > 0) endt = m;
  } else if (closedAt != null) {
    let m = closedAt;
    for (const r of all) if (r.end > m) m = r.end;
    endt = Math.min(now, m);
  }
  // Agents at work: any subagent running. Crew at work: that, or the lead working. Idle: nothing
  // running while awake (waiting for the founder, stopped, or Claude Code closed).
  const runIv = all.map((r) => [r.start, r.end]);
  const leadIv = leadWork.map(([a, b]) => [Math.max(a, t0), Math.min(b, endt)]);
  const busy = unionAwake(runIv);
  const active = Math.max(busy, unionAwake([...runIv, ...leadIv]));
  let slept = 0;
  for (const s of sleeps) if (s.from >= t0 && s.to <= endt) slept += s.secs;
  const clock = endt - t0;
  const idle = Math.max(0, clock - slept - active);

  // Critical path over the dependencies, each task weighted by its agent time so far
  // (relaxation, one pass per task, in index order: the same order bin/crew used).
  const nt = tasks.length;
  const fin = new Array(nt).fill(0);
  const pred = new Array(nt).fill(-1);
  for (let pass = 0; pass < nt; pass++) {
    for (let k = 0; k < nt; k++) {
      let best = 0;
      let bp = -1;
      for (const d of tasks[k].depNums) {
        if (!byNum.has(d)) continue;
        const j = byNum.get(d);
        if (fin[j] > best) { best = fin[j]; bp = j; }
      }
      fin[k] = per[k].active + best;
      pred[k] = bp;
    }
  }
  let cp = 0;
  let last = -1;
  for (let k = 0; k < nt; k++) if (fin[k] > cp) { cp = fin[k]; last = k; }
  const pathIds = [];
  for (let k = last; k >= 0 && pathIds.length < nt; k = pred[k]) pathIds.unshift(tasks[k].id);

  const sleepsOut = sleeps.filter((s) => s.to >= t0).map((s) => ({ ...s }));
  return {
    start, t0, end: endt, done, until: endt < now ? endt : null,
    clock, slept, busy, active, leadAlone: active - busy, idle, leadFrom: leadFrom != null && leadFrom > t0 ? leadFrom : null,
    taskTime: tot, phases: ptot, changes: chs, byType,
    criticalPath: { ids: pathIds, seconds: cp, headroom: Math.max(0, tot - cp) },
    perTask: tasks.map((t, k) => ({ id: t.id, ...per[k] })).filter((p) => p.runs > 0),
    setLevel: other > 0 || osl > 0 ? { types: otypes, active: other, slept: osl } : null,
    runs: outRuns.sort((a, b) => a.start - b.start),
    sleeps: sleepsOut,
  };
}

// ---------------------------------------------------------------------------
// Compactions: the log bin/crew keeps, the turns since each one, the economics
// ---------------------------------------------------------------------------

// Prices in USD per million tokens (bin/crew's price_for; Anthropic list prices, 2026-10-20).
export function modelAlias(m) {
  const l = String(m || '').toLowerCase();
  if (l.includes('fable') || l.includes('mythos')) return 'fable';
  if (l.includes('opus')) return 'opus';
  if (l.includes('sonnet')) return 'sonnet';
  if (l.includes('haiku')) return 'haiku';
  return '';
}
export function readPrice(model, pre) {
  switch (modelAlias(model)) {
    case 'fable': return 0.25;
    case 'opus': return 0.2;
    case 'sonnet': return 0.1;
    case 'haiku': return pre > 100000 ? 0.05 : 0.01;
    default: return 0;
  }
}

// Distinct assistant message ids (API requests) after a byte offset of a transcript. Only the
// bytes added since the last call are read; a partial last line waits for the next call.
const turnCache = new Map();
export function turnsSince(file, offset) {
  const key = `${file}\t${offset}`;
  let c = turnCache.get(key);
  const s = stat(file);
  if (!s) return c ? c.ids.size : 0;
  if (!c || s.size < c.pos) { c = { pos: offset, ids: new Set(), rest: '' }; turnCache.set(key, c); }
  if (s.size > c.pos) {
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const chunk = 1 << 22;
      const buf = Buffer.alloc(chunk);
      let pos = c.pos;
      let rest = c.rest;
      while (pos < s.size) {
        const n = fs.readSync(fd, buf, 0, Math.min(chunk, s.size - pos), pos);
        if (n <= 0) break;
        pos += n;
        const text = rest + buf.toString('latin1', 0, n);
        const cut = text.lastIndexOf('\n');
        const whole = cut < 0 ? '' : text.slice(0, cut);
        rest = cut < 0 ? text : text.slice(cut + 1);
        for (const line of whole.split('\n')) {
          if (!line.includes('"type":"assistant"')) continue;
          for (const m of line.matchAll(/"id":"(msg_[A-Za-z0-9]*)"/g)) c.ids.add(m[1]);
        }
      }
      c.pos = pos;
      c.rest = rest;
    } catch { /* unreadable: keep what we have */ } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  return c.ids.size;
}

// compactions.tsv columns: 1 epoch 2 iso 3 kind 4 id 5 label 6 model 7 effort 8 pre 9 post
// 10 durationMs 11 trigger 12 cost_usd 13 transcript 14 boundary_offset 15 turns_after ("-" = open)
// 16 agent_started_epoch
// The compaction log's rows. `session`: the lead's session, from the transcript's path (a
// subagent's is under <session>/subagents/).
export function compactionRows(stateDir) {
  const t = read(path.join(stateDir, 'compactions.tsv'));
  if (!t) return [];
  const rows = [];
  for (const line of t.split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    if (!f[0]) continue;
    const pre = num(f[7]);
    const post = num(f[8]);
    const open = f[14] === '-';
    const turns = open ? (isFile(f[12]) ? turnsSince(f[12], num(f[13])) : 0) : num(f[14]);
    const rp = readPrice(f[5], pre);
    const cost = f[11] === '' || f[11] == null ? null : num(f[11]);
    const saved = rp > 0 ? (turns * (pre - post) * rp) / 1e6 : null;
    const tp = f[12] || '';
    const session = f[2] === 'sub' ? path.basename(path.dirname(path.dirname(tp))) : path.basename(tp, '.jsonl');
    rows.push({
      epoch: num(f[0]), kind: f[2], id: f[3], label: f[4], model: f[5], effort: f[6],
      pre, post, durationMs: num(f[9]), trigger: f[10] || 'auto', cost, turns, open,
      saved, net: cost != null && saved != null ? saved - cost : null, started: num(f[15]),
      session, set: null,
    });
  }
  return rows;
}

// The compactions page: the rows and what they add up to (null: none).
export function compactionSummary(rows) {
  if (rows.length === 0) return null;
  const s = {
    lead: { count: 0, avgPre: 0, interval: null },
    sub: { count: 0, avgPre: 0, afterStart: null },
    overhead: null, saved: null, net: null,
  };
  let leadPre = 0;
  let subPre = 0;
  let gapSum = 0;
  let gaps = 0;
  let lastLead = 0;
  let subGap = 0;
  let subGaps = 0;
  let over = 0;
  let overKnown = false;
  let save = 0;
  let saveKnown = false;
  for (const r of rows) {
    if (r.kind === 'lead') {
      s.lead.count++;
      leadPre += r.pre;
      if (lastLead > 0) { gapSum += r.epoch - lastLead; gaps++; }
      lastLead = r.epoch;
    } else {
      s.sub.count++;
      subPre += r.pre;
      if (r.started > 0 && r.epoch >= r.started) { subGap += r.epoch - r.started; subGaps++; }
    }
    if (r.cost != null) { over += r.cost; overKnown = true; }
    if (r.saved != null) { save += r.saved; saveKnown = true; }
  }
  if (s.lead.count) s.lead.avgPre = leadPre / s.lead.count;
  if (gaps) s.lead.interval = gapSum / gaps;
  if (s.sub.count) s.sub.avgPre = subPre / s.sub.count;
  if (subGaps) s.sub.afterStart = subGap / subGaps;
  if (overKnown) s.overhead = over;
  if (saveKnown) { s.saved = save; s.net = save - over; }
  return { summary: s, rows };
}

export function compactionsModel(stateDir) {
  return compactionSummary(compactionRows(stateDir));
}

// ---------------------------------------------------------------------------
// The project's icon: a favicon, app icon or logo found in the repository, shown in the page's
// header instead of crew's. Only square images (a few pixels of slack) qualify. The walk is
// bounded (depth, entries) and skips dependencies, build output and tests; the result is kept
// for 30 seconds.
// ---------------------------------------------------------------------------

const ICON_EXT = new Set(['.png', '.svg', '.ico', '.webp', '.jpg', '.jpeg']);
const ICON_SKIP = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'target', 'tmp', 'temp', 'venv', '__pycache__',
  'test', 'tests', '__tests__', 'fixtures', 'e2e', 'screenshots', 'storybook-static', 'Pods', 'DerivedData',
]);
const ICON_DEPTH = 5;
const ICON_BUDGET = 6000;

// How icon-like a file name is: 3 favicon or app icon, 2 a logo, 0 anything else.
function iconNameRank(base) {
  const n = base.toLowerCase();
  if (/favicon|apple-touch-icon|android-chrome|^app-?icon|^icon[-_.\d]|^icon$|logo.*icon|icon.*logo/.test(n)) return 3;
  if (/logo/.test(n)) return 2;
  return 0;
}

function readHead(file, n) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(n);
    const got = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, got);
  } catch { return null; } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// [width, height] from the file's header, or null when unknown.
export function imageSize(file) {
  const ext = path.extname(file).toLowerCase();
  const b = readHead(file, ext === '.svg' ? 8192 : ext === '.jpg' || ext === '.jpeg' ? 262144 : 64);
  if (!b || b.length < 10) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG' && b.length >= 24) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.readUInt32LE(0) === 0x00010000) {
    // ICO: the largest entry (a 0 byte means 256 px).
    const n = b.readUInt16LE(4);
    const all = readHead(file, 6 + 16 * n);
    let best = null;
    for (let i = 0; all && i < n && 6 + 16 * i + 2 <= all.length; i++) {
      const w = all[6 + 16 * i] || 256;
      const h = all[6 + 16 * i + 1] || 256;
      if (!best || w * h > best[0] * best[1]) best = [w, h];
    }
    return best;
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' && b.length >= 30) {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') {
      const v = b.readUInt32LE(21);
      return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)];
    }
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // JPEG: the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
    return null;
  }
  if (ext === '.svg') {
    const t = b.toString('utf8');
    const tag = /<svg\b[^>]*>/i.exec(t)?.[0];
    if (!tag) return null;
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
    if (vb) return [Number(vb[1]), Number(vb[2])];
    const w = /\bwidth\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i.exec(tag);
    const h = /\bheight\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i.exec(tag);
    return w && h ? [Number(w[1]), Number(h[1])] : null;
  }
  return null;
}

function squareEnough(w, h) {
  return w > 0 && h > 0 && Math.abs(w - h) <= Math.max(2, Math.round(Math.max(w, h) * 0.04));
}

const iconCache = new Map();
export function projectIcon(root, now = Date.now()) {
  const hit = iconCache.get(root);
  if (hit && now - hit.at < 30000) return hit.icon;
  const found = [];
  let budget = ICON_BUDGET;
  const walk = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    budget -= ents.length;
    for (const e of ents) {
      if (budget <= 0) return;
      if (e.isDirectory()) {
        if (depth < ICON_DEPTH && !ICON_SKIP.has(e.name) && (!e.name.startsWith('.') || e.name === '.github')) walk(path.join(dir, e.name), depth + 1);
        continue;
      }
      if (!e.isFile() || !ICON_EXT.has(path.extname(e.name).toLowerCase())) continue;
      const rank = iconNameRank(path.basename(e.name, path.extname(e.name)));
      if (rank) found.push({ file: path.join(dir, e.name), rank, depth });
    }
  };
  walk(root, 0);
  let best = null;
  for (const f of found) {
    const st = stat(f.file);
    if (!st || st.size > 5 << 20) continue;
    const size = imageSize(f.file);
    if (!size || !squareEnough(size[0], size[1])) continue;
    // An SVG scales: rank it like a large bitmap. Big enough to look sharp comes first, then
    // the most icon-like name, then the shallowest, then the largest.
    const px = f.file.toLowerCase().endsWith('.svg') ? 512 : Math.min(size[0], size[1]);
    const key = [px >= 64 ? 2 : px >= 32 ? 1 : 0, f.rank, -f.depth, Math.min(px, 1024)];
    const i = best ? key.findIndex((v, k) => v !== best.key[k]) : -1;
    if (!best || (i >= 0 && key[i] > best.key[i])) best = { key, file: f.file, w: size[0], h: size[1], mtime: Math.floor(st.mtimeMs / 1000) };
  }
  const icon = best ? { path: path.relative(root, best.file).split(path.sep).join('/'), w: best.w, h: best.h, mtime: best.mtime } : null;
  iconCache.set(root, { at: now, icon });
  return icon;
}

// ---------------------------------------------------------------------------
// The Agents tab: the lead's session, its way in, past agents, transcripts
// ---------------------------------------------------------------------------

// reach/<session> (bin/crew's note_reach): socket, token, Paseo agent id, Paseo CLI. The server
// delivers with it; the page only learns which way exists, never the token.
export function readReach(stateDir, sess) {
  const t = read(path.join(stateDir, 'reach', sess));
  if (!t) return null;
  const [socket = '', token = '', paseo = '', paseoCli = ''] = t.replace(/\r?\n$/, '').split('\t');
  return { socket, token, paseo, paseoCli };
}

// How a message reaches the session now: 'paseo' (Paseo runs it: a message as if typed there),
// 'socket' (its inbox socket: Claude Code shows it to the lead as another session's message), or
// null (no way known, or its Claude Code is gone).
export function reachVia(r) {
  if (!r) return null;
  if (r.paseo && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(r.paseo) && (r.paseoCli ? isFile(r.paseoCli) : onPath('paseo'))) return 'paseo';
  if (r.socket && stat(r.socket)?.isSocket()) return 'socket';
  return null;
}

// A lead's session: of the sessions `crew session start` registered (hooks also record sessions
// that never ran the crew), `want`; without it, the newest transcript whose Claude Code still
// runs, else the newest transcript.
export function leadSession(stateDir, sessions, want = null) {
  const reg = listDir(path.join(stateDir, 'sessions')).filter((s) => s !== 'any' && sessions.transcriptOf.has(s) && (want == null || s === want));
  if (!reg.length) return null;
  const mtime = (s) => stat(sessions.transcriptOf.get(s))?.mtimeMs ?? 0;
  const alive = (s) => (sessions.pids.has(s) ? sessions.alive.has(s) : sessions.live);
  reg.sort((a, b) => Number(alive(b)) - Number(alive(a)) || mtime(b) - mtime(a));
  return { session: reg[0], alive: alive(reg[0]), transcript: sessions.transcriptOf.get(reg[0]) };
}

// The lead's model and effort: as SessionStart recorded them (lead-model/<session>); else from
// its Claude Code's command line (--model, --effort: how Paseo and the Agent SDK start it); else
// the model of its newest reply in the transcript.
export function leadModel(stateDir, ls, sessions) {
  let [model = '', effort = ''] = trim(read(path.join(stateDir, 'lead-model', ls.session)) || '').split(/\s+/);
  const pid = sessions.pids.get(ls.session);
  if ((!model || !effort) && pid && ls.alive) {
    const args = run('ps', ['-o', 'args=', '-p', String(pid)]);
    model ||= /(?:^|\s)--model[= ](\S+)/.exec(args)?.[1] ?? '';
    effort ||= /(?:^|\s)--effort[= ](\S+)/.exec(args)?.[1] ?? '';
  }
  // An alias ("opus") says less than the transcript's full id ("claude-opus-5-5").
  if (!/^claude-/.test(model) && ls.transcript) {
    const s = stat(ls.transcript);
    if (s) {
      let fd;
      try {
        fd = fs.openSync(ls.transcript, 'r');
        const n = Math.min(s.size, 262144);
        const buf = Buffer.alloc(n);
        fs.readSync(fd, buf, 0, n, s.size - n);
        model = [...buf.toString('utf8').matchAll(/"model":"(claude-[^"]+)"/g)].pop()?.[1] ?? model;
      } catch { /* unreadable */ } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    }
  }
  return { model, effort };
}

// The lead's permission mode now: the newest permissionMode its transcript records (Claude Code
// writes it on the founder's messages); '' when none is found.
export function permissionModeOf(transcript) {
  const s = stat(transcript);
  if (!s) return '';
  let fd;
  try {
    fd = fs.openSync(transcript, 'r');
    const n = Math.min(s.size, 1 << 20);
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, s.size - n);
    return [...buf.toString('utf8').matchAll(/"permissionMode":"([A-Za-z]+)"/g)].pop()?.[1] ?? '';
  } catch { return ''; } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

// Where the lead's context compacts: its model's autoCompactWindow in the settings files (the
// project's local settings, the project's, the user's, in that order), else a top-level
// autoCompactWindow, else the model's context size; compaction triggers about 33K below it.
// (CLAUDE_CODE_AUTO_COMPACT_WINDOW in the session's environment is not visible from here.)
export const COMPACT_MARGIN = 33000;
export function compactWindow(root, model, home = os.homedir()) {
  const files = [
    path.join(root, '.claude', 'settings.local.json'), path.join(root, '.claude', 'settings.json'), path.join(home, '.claude', 'settings.json'),
  ];
  const keys = [...new Set([model, String(model).replace(/\[1m\]$/i, ''), modelAlias(model)].filter(Boolean))];
  let top = 0;
  for (const f of files) {
    let j = null;
    try { j = JSON.parse(read(f) || 'null'); } catch { /* not JSON: skip */ }
    if (!j || typeof j !== 'object') continue;
    const ms = j.modelSettings && typeof j.modelSettings === 'object' ? j.modelSettings : {};
    // The exact id first, then any key for the same family ("haiku" ↔ "claude-haiku-5-5").
    for (const k of [...keys, ...Object.keys(ms).filter((x) => modelAlias(x) && modelAlias(x) === modelAlias(model))]) {
      const w = Number(ms[k]?.autoCompactWindow);
      if (w > 0) return w;
    }
    if (!top && Number(j.autoCompactWindow) > 0) top = Number(j.autoCompactWindow);
  }
  return top || (/\[1m\]/i.test(model) ? 1000000 : 200000);
}

// Subagents that ran and are not running now, newest first: when their last run ended and how.
function pastAgents(stateDir, runs, running, limit = 60) {
  const last = new Map();
  const count = new Map();
  for (const r of runs) {
    if (!r.id || running.has(r.id)) continue;
    count.set(r.id, (count.get(r.id) || 0) + 1);
    const p = last.get(r.id);
    if (!p || r.end >= p.end) last.set(r.id, r);
  }
  const out = [];
  for (const [id, r] of last) {
    const a = loadAgent(stateDir, id);
    out.push({
      id, type: a?.type || r.type, name: a?.name || '', description: a?.description || '',
      model: a?.model || 'default', effort: a?.effort || 'default',
      started: a?.started || r.start, ended: r.end, runs: count.get(id), status: r.status,
      taskNum: taskNum(a?.description || '') ?? (isInt(r.task) ? Number(r.task) : null),
      session: a?.session || r.session || '', set: a?.set ?? r.set ?? null,
    });
  }
  return out.sort((a, b) => b.ended - a.ended).slice(0, limit);
}

// The transcript of a lead ('lead:<session>'; 'lead': the newest live one) or of a subagent (its
// id): a lead's from the session's record; a subagent's under a recorded session's transcript (<session>/subagents/agent-<id>.jsonl).
export function transcriptFile(stateDir, who, sessions) {
  if (who === 'lead') return leadSession(stateDir, sessions)?.transcript ?? null;
  if (/^lead:[A-Za-z0-9._-]{1,120}$/.test(who)) return leadSession(stateDir, sessions, who.slice(5))?.transcript ?? null;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(who)) return null;
  const own = trim(read(path.join(stateDir, 'running', who)) || '');
  const tps = [sessions.transcriptOf.get(own), ...sessions.transcriptOf.values()].filter(Boolean);
  for (const tp of tps) {
    const f = path.join(tp.replace(/\.jsonl$/, ''), 'subagents', `agent-${who}.jsonl`);
    if (isFile(f)) return f;
  }
  return null;
}

// A transcript's records as what the page shows: the founder's and peers' messages, the agent's
// text, thinking and tool calls, tool results, compactions. Texts are capped; each assistant
// entry carries the context size of its request (ctx), for the context meter.
export const FOUNDER_TAG = 'From the founder, via the Crew dashboard:';
const PEER_HEAD = 'Another Claude session sent a message:\n';
const PEER_TAIL = '\n\nThis came from another Claude session';
const cap = (s, n) => (s.length > n ? `${s.slice(0, n)}\n… (${s.length - n} more characters)` : s);

function blockText(c) {
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((b) => (b?.type === 'text' ? b.text : b?.type === 'image' ? '[image]' : '')).filter(Boolean).join('\n');
}

export function toolSummary(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  const short = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  switch (name) {
    case 'Bash': return short(i.description || i.command);
    case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': return short(i.file_path || i.notebook_path);
    case 'Grep': case 'Glob': return short(`${i.pattern ?? ''}${i.path ? ` in ${i.path}` : ''}`);
    case 'Agent': case 'Task': return short(`${i.subagent_type ? `${i.subagent_type}: ` : ''}${i.description ?? ''}`);
    case 'Skill': return short(`${i.skill ?? ''} ${i.args ?? ''}`);
    case 'WebFetch': return short(i.url);
    case 'WebSearch': return short(i.query);
    case 'TodoWrite': return `${Array.isArray(i.todos) ? i.todos.length : 0} items`;
    default: return Object.keys(i).length ? short(JSON.stringify(i)) : '';
  }
}

export function transcriptEntries(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] !== '{') continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const ts = Math.floor((Date.parse(r.timestamp) || 0) / 1000);
    const key = r.uuid || `${ts}-${out.length}`;
    const m = r.message;
    if (r.type === 'system' && r.subtype === 'compact_boundary') {
      out.push({ kind: 'compact', key, ts, pre: num(r.compactMetadata?.preTokens) });
      continue;
    }
    if (r.type === 'user' && m) {
      const c = m.content;
      const s = blockText(c);
      if (r.origin?.kind === 'peer' || s.startsWith(PEER_HEAD)) {
        let body = typeof r.origin?.body === 'string' ? r.origin.body : s.startsWith(PEER_HEAD) ? s.slice(PEER_HEAD.length) : s;
        const tail = body.indexOf(PEER_TAIL);
        if (tail >= 0) body = body.slice(0, tail);
        body = body.replace(/^<cross-session-message\b[^>]*>\n?|\n?<\/cross-session-message>$/g, '').trim();
        if (body.startsWith(FOUNDER_TAG)) out.push({ kind: 'user', key, ts, via: 'dashboard', text: cap(body.slice(FOUNDER_TAG.length).trim(), 20000) });
        else out.push({ kind: 'peer', key, ts, text: cap(body, 20000) });
        continue;
      }
      if (r.isCompactSummary) { out.push({ kind: 'summary', key, ts, text: cap(s, 20000) }); continue; }
      if (Array.isArray(c)) {
        c.forEach((b, i) => {
          if (b?.type !== 'tool_result') return;
          const t = typeof b.content === 'string' ? b.content : blockText(b.content);
          out.push({ kind: 'result', key: `${key}:${i}`, ts, id: b.tool_use_id, error: Boolean(b.is_error), text: cap(t, 4000) });
        });
      }
      if (r.isMeta || !s.trim()) continue;
      // A slash command as typed; the command's own output and other harness lines are not shown.
      const cmd = /<command-name>([^<]*)<\/command-name>/.exec(s);
      if (cmd) {
        const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(s)?.[1]?.trim();
        out.push({ kind: 'user', key, ts, text: `${cmd[1].trim()}${args ? ` ${args}` : ''}` });
        continue;
      }
      if (/^\s*<(local-command-|bash-|command-message|system-reminder|task-notification)/.test(s)) continue;
      out.push({ kind: 'user', key, ts, text: cap(s, 20000) });
      continue;
    }
    if (r.type === 'assistant' && m && Array.isArray(m.content)) {
      const u = m.usage;
      const ctx = u ? num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens) : 0;
      m.content.forEach((b, i) => {
        const k = `${key}:${i}`;
        if (b?.type === 'text' && b.text?.trim()) {
          out.push({ kind: r.isApiErrorMessage ? 'error' : 'text', key: k, ts, ctx, text: cap(b.text, 20000) });
        } else if (b?.type === 'thinking' && b.thinking?.trim()) {
          out.push({ kind: 'thinking', key: k, ts, ctx, text: cap(b.thinking, 8000) });
        } else if (b?.type === 'tool_use') {
          let detail = '';
          try { detail = JSON.stringify(b.input, null, 2); } catch { /* unprintable */ }
          out.push({ kind: 'tool', key: k, ts, ctx, id: b.id, name: b.name, summary: toolSummary(b.name, b.input), detail: cap(detail, 4000) });
        }
      });
    }
  }
  return out;
}

// Read whole lines of a transcript: new ones from `from` (to the end), or a chunk of at most
// `max` bytes ending at `before` (default: the end), starting at a line. start/end are byte
// offsets: ask for `before: start` to get older lines, `from: end` to get newer ones.
export function readTranscript(file, { from = null, before = null, max = 1500000 } = {}) {
  const s = stat(file);
  if (!s) return null;
  const size = s.size;
  let start;
  let end;
  if (from != null) { start = Math.min(Math.max(0, from), size); end = size; } else { end = Math.min(before ?? size, size); start = Math.max(0, end - max); }
  let fd;
  let buf = Buffer.alloc(0);
  try {
    fd = fs.openSync(file, 'r');
    buf = Buffer.alloc(end - start);
    const n = fs.readSync(fd, buf, 0, end - start, start);
    buf = buf.subarray(0, n);
  } catch { return null; } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  // A chunk that starts mid-file starts after its first newline; every chunk ends at its last.
  let a = 0;
  if (from == null && start > 0) {
    const nl = buf.indexOf(10);
    a = nl < 0 ? buf.length : nl + 1;
  }
  const last = buf.lastIndexOf(10);
  const b = last < a ? a : last + 1;
  return {
    entries: transcriptEntries(buf.subarray(a, b).toString('utf8')),
    start: start + a, end: start + b, size, more: start + a > 0,
  };
}

// ---------------------------------------------------------------------------
// Leads: one per checkout (see "Leads" in bin/crew's header)
// ---------------------------------------------------------------------------

// The registered sessions, one per checkout: the newest whose Claude Code runs, else the newest.
// A lead whose Claude Code is gone is left out when its checkout is gone, or when it had no task
// set open and another lead is shown. Live leads first, the main checkout's first among equals.
export function leadSessions(stateDir, sessions, root, now = Math.floor(Date.now() / 1000)) {
  const best = new Map();
  for (const sess of listDir(path.join(stateDir, 'sessions'))) {
    if (sess === 'any') continue;
    const t = read(path.join(stateDir, 'sessions', sess)) || '';
    const co = realpath(/^checkout=(.*)$/m.exec(t)?.[1] || root);
    const alive = sessionAlive(sessions, sess);
    const ep = Number(trim(read(path.join(stateDir, 'leads', sess)) || '').split(/\s+/)[2]);
    const at = Math.max(Number.isFinite(ep) ? ep : 0, sessions.seen.get(sess) || 0);
    const r = { session: sess, checkout: co, alive, at };
    const p = best.get(co);
    if (!p || Number(r.alive) > Number(p.alive) || (r.alive === p.alive && r.at > p.at)) best.set(co, r);
  }
  return [...best.values()]
    .filter((r) => isDir(r.checkout))
    .sort((x, y) => Number(y.alive) - Number(x.alive) || Number(y.checkout === root) - Number(x.checkout === root) || y.at - x.at);
}

// Entries of the queues and defect logs: the backlog of every checkout, and each set's own files.
// A request or defect number is project-wide; one entry found in two copies (a backlog seen from
// two checkouts) keeps the copy furthest along.
const DONE_STATES = new Set(['done', 'dropped', 'fixed', 'answered', 'closed']);
function collectEntries(cks, sets) {
  const rank = (e) => (DONE_STATES.has(e.state) ? 2 : e.state === 'scheduled' ? 1 : 0);
  const req = new Map();
  const qst = new Map();
  const dfx = new Map();
  const add = (map, e, set, title) => {
    const k = `${set ?? ''}:${e.id}`;
    const x = { ...e, set, setTitle: title };
    if (!map.has(k) || rank(x) > rank(map.get(k))) map.set(k, x);
  };
  for (const s of sets) {
    const dir = path.dirname(s.file);
    const q = read(path.join(dir, 'queue.md')) || '';
    for (const e of parseQueue(q, 'R')) add(req, e, s.slug, s.title);
    for (const e of parseQueue(q, 'F')) add(qst, e, s.slug, s.title);
    for (const e of parseDefects(read(path.join(dir, 'defects.md')) || '')) add(dfx, e, s.slug, s.title);
  }
  for (const ck of cks) {
    if (ck.builder) continue;
    const q = read(path.join(ck.path, '.crew', 'queue.md')) || '';
    for (const e of parseQueue(q, 'R')) add(req, e, null, null);
    for (const e of parseQueue(q, 'F')) add(qst, e, null, null);
    for (const e of parseDefects(read(path.join(ck.path, '.crew', 'defects.md')) || '')) add(dfx, e, null, null);
  }
  return { requests: [...req.values()], questions: [...qst.values()], defects: [...dfx.values()] };
}

function readHandoff(file) {
  const t = read(file);
  return t == null ? null : { ...parseHandoff(t), path: file };
}

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

export function buildState(rootIn, opts = {}) {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const root = realpath(rootIn);
  const crewDir = path.join(root, '.crew');
  const stateDir = path.join(crewDir, 'tmp', 'journal-state');
  const today = localDay(now);

  const sessions = claudeSessions(stateDir, now);
  const recorded = readRuns(stateDir);
  const sleeps = readSleeps(stateDir);
  const { agents, ended } = runningAgents(stateDir, recorded, sessions);
  const runs = [...recorded, ...ended];
  const repo = { name: path.basename(root), root, ...gitInfo(root), icon: projectIcon(root) };
  const leadLog = readLeadLog(stateDir);
  const seenOf = (sess) => sessions.seen.get(sess) || sessions.lastSeen || now;
  const untilOf = (sess) => (sess && sessions.pids.has(sess) ? (sessions.alive.has(sess) ? now : Math.min(now, seenOf(sess)))
    : sessions.live ? now : Math.min(now, sessions.lastSeen || now));

  const { sets, worktrees, openIn, checkouts: cks } = collectSets(root, crewDir);
  const cur = pickCurrent(sets, repo.branch);
  const slugOf = (co) => openIn.get(co)?.slug ?? null;

  // The leads, each with the set open in its checkout.
  const regs = leadSessions(stateDir, sessions, root, now);
  const leadOfSet = new Map();
  for (const r of regs) { const sl = slugOf(r.checkout); if (sl && !leadOfSet.has(sl)) leadOfSet.set(sl, r); }
  const shown = regs.filter((r, i) => r.alive || slugOf(r.checkout) || i === 0 || !regs.some((x) => x.alive));

  // The set each lead session worked on (lead.tsv, then the leads now), each subagent's (its
  // runs), and each checkout's branch's: a builder's worktree counts for the checkout it is in.
  const setOfSession = new Map();
  for (const e of leadLog) if (e.session && e.set) setOfSession.set(e.session, e.set);
  for (const r of regs) { const sl = slugOf(r.checkout); if (sl) setOfSession.set(r.session, sl); }
  const setOfAgent = new Map();
  for (const x of [...runs, ...agents]) if (x.set) setOfAgent.set(x.id, x.set);
  const setOfBranch = new Map();
  const nest = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
  for (const ck of cks) {
    const sl = slugOf(ck.builder ? ck.path.slice(0, ck.path.indexOf(nest)) : ck.path);
    if (sl) setOfBranch.set(ck.main ? '' : ck.branch, sl);
  }
  // A line from a set's own branch (its index's Branch:, or crew/<slug>), checked out anywhere.
  for (const st of sets) {
    if (!st.live) continue;
    for (const b of [st.branch?.split(/\s+/)[0], `crew/${st.slug}`]) if (b && !setOfBranch.has(b)) setOfBranch.set(b, st.slug);
  }
  const compRows = compactionRows(stateDir);
  for (const r of compRows) r.set = (r.kind === 'sub' && setOfAgent.get(r.id)) || setOfSession.get(r.session) || null;

  // One set as the page shows it: its tasks, agents, timing and handoff.
  const viewOf = (set) => {
    const setDir = path.dirname(set.file);
    const mine = (x) => x.set == null || x.set === set.slug;
    const setAgents = agents.filter(mine);
    const tasks = set.rows.map((r) => {
      const onIt = setAgents.filter((a) => a.taskNum != null && a.taskNum === r.num).map((a) => a.id);
      // Screenshots are in the lead's checkout; an older crew harvested every worktree's into the main one.
      let shots = screenshotsFor(set.crewDir, r.id);
      if (!shots.total && set.crewDir !== crewDir) shots = screenshotsFor(crewDir, r.id);
      return { ...r, specPath: r.spec ? path.join(setDir, r.spec) : null, agents: onIt, screenshots: shots.items, screenshotCount: shots.total };
    });
    let ct = tasks.findIndex((t) => ['progress', 'review', 'rework'].includes(t.status));
    if (ct < 0) ct = tasks.findIndex((t) => t.status === 'pending');
    const lr = leadOfSet.get(set.slug);
    let timing = null;
    if (tasks.length) {
      const agentCache = new Map();
      const agentOf = (id) => {
        if (!agentCache.has(id)) agentCache.set(id, loadAgent(stateDir, id));
        return agentCache.get(id);
      };
      const log = leadLog.filter(mine);
      const alive = lr ? lr.alive : sessions.live;
      timing = computeTiming({
        tasks: tasks.map((t) => ({ id: t.id, num: t.num, depNums: t.deps.map((d) => Number(d.replace(/[^0-9]/g, ''))) })),
        runs: runs.filter(mine),
        open: setAgents.map((a) => ({ start: a.runStart, id: a.id, type: a.type, task: a.taskNum == null ? '' : String(a.taskNum), kind: a.kind })),
        sleeps,
        start: setStartEpoch(stateDir, set.file),
        now,
        done: setAgents.length === 0 && set.accepted === set.total,
        closedAt: alive ? null : (lr ? seenOf(lr.session) : sessions.lastSeen) || null,
        agentOf,
        leadWork: leadWorkIntervals(log, untilOf),
        leadFrom: log.length ? log[0].at : null,
      });
    }
    return {
      file: set.file, rel: set.rel, slug: set.slug, where: set.where, checkout: set.checkout, title: set.title, stage: set.stage, branch: set.branch,
      total: set.total, accepted: set.accepted, counts: set.counts, lead: lr?.session ?? null,
      tasks, currentTask: ct >= 0 ? tasks[ct].id : null, timing,
      handoff: readHandoff(path.join(setDir, 'handoff.md')),
      compactions: compactionSummary(compRows.filter(mine)),
    };
  };
  const open = sets.map((st, i) => ({ st, i })).filter((x) => x.st.live).map((x) => ({ i: x.i, view: viewOf(x.st) }));
  let current = open.find((o) => o.i === cur)?.view ?? null;
  if (!current && cur >= 0) current = viewOf(sets[cur]);

  const tasksOf = new Map(open.map((o) => [o.view.slug, o.view.tasks]));
  const taskIdOf = (tn, set) => {
    if (tn == null) return null;
    const list = (set && tasksOf.get(set)) || current?.tasks || [];
    return list.find((t) => t.num === tn)?.id ?? `T${String(tn).padStart(2, '0')}`;
  };

  const leads = shown.map((r) => {
    const set = openIn.get(r.checkout) ?? null;
    const nrun = agents.filter((a) => a.session === r.session).length;
    let text = read(path.join(stateDir, 'leads', r.session));
    if (text == null && r.checkout === root) text = read(path.join(stateDir, 'lead'));
    const ls = { session: r.session, alive: r.alive, transcript: sessions.transcriptOf.get(r.session) ?? null };
    const { model, effort } = leadModel(stateDir, ls, sessions);
    const window = model ? compactWindow(r.checkout, model) : 0;
    const ck = cks.find((c) => c.path === r.checkout);
    return {
      session: r.session, alive: r.alive, checkout: r.checkout, main: r.checkout === root,
      label: r.checkout === root ? 'main checkout' : path.basename(r.checkout), branch: ck?.branch || '',
      set: set?.slug ?? null, setTitle: set?.title ?? null,
      state: leadStateOf(text, nrun, now, r.alive, seenOf(r.session)), agents: nrun,
      model, effort, window, compactAt: window ? Math.max(0, window - COMPACT_MARGIN) : 0,
      reach: r.alive ? reachVia(readReach(stateDir, r.session)) : null,
      handoff: set ? readHandoff(path.join(path.dirname(set.file), 'handoff.md')) : readHandoff(path.join(r.checkout, '.crew', 'handoff.md')),
    };
  });
  // The lead of the current set, else the first: what a page that shows one lead shows.
  const primary = leads.find((l) => current && l.set === current.slug) ?? leads[0] ?? null;
  const lead = primary ? primary.state : leadState(stateDir, agents.length, now, sessions);
  const awake = keepAwake(stateDir, leads);
  if (awake) for (const l of leads) l.awake = awake.bySession.includes(l.session);

  const { requests, questions, defects } = collectEntries(cks, sets);
  const handoff = primary?.handoff ?? readHandoff(path.join(crewDir, 'handoff.md'));
  // A journal line's set: by the branch of the checkout that wrote it (none: the main one's).
  const journal = parseJournal(read(path.join(crewDir, 'journal.md')) || '', opts.journalLimit ?? 400);
  for (const e of journal.entries) e.set = setOfBranch.get(e.branch) ?? null;
  const compactions = compactionSummary(compRows);
  const ds = defectSummary(defects);

  const past = pastAgents(stateDir, runs, new Set(agents.map((a) => a.id)))
    .map(({ taskNum: tn, ...a }) => ({ ...a, task: taskIdOf(tn, a.set) }));

  const state = {
    version: MODEL_VERSION,
    generatedAt: now,
    today,
    repo,
    lead,
    keepAwake: awake,
    agents: agents.map(({ taskNum: tn, ...a }) => ({ ...a, task: taskIdOf(tn, a.set) })),
    roster: { lead: primary, leads, past },
    current,
    open: open.map((o) => o.view),
    sets: sets.map(({ rows, crewDir: _c, ...s }, i) => ({ ...s, current: i === cur, lead: leadOfSet.get(s.slug)?.session ?? null }))
      .sort((a, b) => Number(b.current) - Number(a.current) || Number(b.live) - Number(a.live) || b.mtime - a.mtime),
    queue: {
      requests,
      questions,
      counts: {
        queued: requests.filter((r) => r.state === 'queued').length,
        scheduled: requests.filter((r) => r.state === 'scheduled').length,
        done: requests.filter((r) => r.state === 'done').length,
        dropped: requests.filter((r) => r.state === 'dropped').length,
        openQuestions: questions.filter((q) => q.state === 'open').length,
      },
    },
    defects: { items: defects, summary: ds },
    compactions,
    journal,
    handoff,
    worktrees,
  };
  // Something on the page changes with time alone: refresh it once a minute.
  state.live = agents.length > 0 || state.open.some((o) => o.timing && !o.timing.done) || Boolean(awake?.on);
  return state;
}

// The directories the server may serve files from: .crew/ of the main checkout and of each
// linked worktree.
export function allowedDirs(state) {
  return [path.join(state.repo.root, '.crew'), ...state.worktrees.map((w) => path.join(w.path, '.crew'))];
}

// ---------------------------------------------------------------------------
// Releases (RELEASES.md): for the update check in server.mjs
// ---------------------------------------------------------------------------

const RELEASE_RE = /^## +v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) +(?:—|–|-) +(\d{4}-\d{2}-\d{2}) *$/;

// "## 0.2.0 — 2026-10-21" headings, newest first, each followed by its description. Anything
// before the first heading is the file's own introduction.
export function parseReleases(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = RELEASE_RE.exec(line);
    if (m) { cur = { version: m[1], date: m[2], body: [] }; out.push(cur); continue; }
    if (cur) {
      if (/^# /.test(line)) { cur = null; continue; }
      cur.body.push(line);
    }
  }
  for (const r of out) r.body = r.body.join('\n').trim();
  return out;
}

// Semantic versions: -1, 0 or 1. A pre-release sorts before its release (0.3.0-beta.1 < 0.3.0).
export function compareVersions(a, b) {
  const split = (v) => {
    const [core, pre = ''] = String(v || '0.0.0').replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => Number(n) || 0), pre };
  };
  const x = split(a), y = split(b);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, 'en', { numeric: true }) < 0 ? -1 : 1;
}
