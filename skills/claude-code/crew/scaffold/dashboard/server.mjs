#!/usr/bin/env node
// crew dashboard: a local web page for the founder, live over Server-Sent Events.
//
// Installed by `/crew setup` as <project>/.crew/dashboard/server.mjs; started by
// `.crew/bin/crew session start` and `.crew/bin/crew dashboard`. Node.js 20 or later, no
// dependencies. One server per repository, on a port that stays the same for the project (kept in
// .crew/tmp/dashboard.json), so a browser tab or a Paseo side panel keeps working across restarts.
// It listens on every interface, so a phone or a tablet on the same network (or tailnet) can open
// it: this computer reaches it by a local name (127.0.0.1, localhost; any port, for an SSH tunnel)
// with nothing more, anything else needs the project's key (.crew/tmp/dashboard.key), which the
// printed URL carries. With CREW_DASHBOARD_LAN=0 it listens on 127.0.0.1 only.
//
//   node server.mjs start [--root <dir>]     Start in the background and print the URL. When one already
//                                            runs for this project: print nothing, exit 3.
//   node server.mjs stop  [--root <dir>]     Stop it.
//   node server.mjs restart [--root <dir>]   Stop it, then start it again.
//   node server.mjs url   [--root <dir>]     Print the URL when it runs; exit 1 otherwise.
//   node server.mjs state [--root <dir>] [--now <epoch>] [--pretty]
//                                            Print the model as JSON (tests, debugging).
//   node server.mjs serve [--root <dir>] [--port <n>]
//                                            Run in the foreground (what `start` launches).
//   node server.mjs updates [--root <dir>] [--check] [--simulate | --reset]
//                                            Print this copy's version and the latest release.
//                                            --check asks now; --simulate makes the latest release
//                                            count as new (to see the notice), --reset stops that.
//                                            A running server shows the result at once.
//
// Updates: once a day (and when the page's "Check now" asks), the server reads the published
// RELEASES.md (PUBLISHED below) and compares it with the RELEASES.md installed beside it. A newer
// release puts a notice in the page's header, with what's new and how to update. The result is
// kept in .crew/tmp/update.json. CREW_UPDATE_CHECK=0 turns the check off.
//
// How the page stays current, without polling:
//   - fs.watch on .crew/ (recursive), on the git HEAD and branch refs, and on each linked
//     worktree's .crew/tasks/: a change recomputes the model (debounced, after bin/crew's lock is
//     released) and pushes it to every open page when it differs.
//   - Durations that grow with time alone (running agents, the set's clock) are recomputed once
//     a minute while something is live.
//   - A change to the built page (app/) tells open pages to reload; they keep their tab and
//     scroll position. A change to this file or model.mjs restarts the server on the same port;
//     pages reconnect by themselves.

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HERE = path.dirname(SELF);
const APP = path.join(HERE, 'app');
const SERVER_VERSION = 1;
const APP_ID = 'crew-dashboard';
// `start` when a server already runs for this project: no output, this exit status.
const ALREADY_RUNNING = 3;

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  process.stderr.write(`crew dashboard: needs Node.js 20 or later (found ${process.versions.node})\n`);
  process.exit(1);
}

const {
  buildState, allowedDirs, parseReleases, compareVersions,
  claudeSessions, leadSession, readReach, reachVia, transcriptFile, readTranscript, permissionModeOf, FOUNDER_TAG, safeName,
} = await import('./model.mjs');

// ---------------------------------------------------------------------------
// Arguments, paths
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { cmd: 'start', root: '', port: 0, now: undefined, pretty: false, replace: false, check: false, simulate: false, reset: false };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) o.cmd = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    if (a === '--root') o.root = rest.shift() || '';
    else if (a === '--port') o.port = Number(rest.shift()) || 0;
    else if (a === '--now') o.now = Number(rest.shift()) || undefined;
    else if (a === '--pretty') o.pretty = true;
    else if (a === '--replace') o.replace = true;
    else if (a === '--check') o.check = true;
    else if (a === '--simulate') o.simulate = true;
    else if (a === '--reset') o.reset = true;
    else { process.stderr.write(`crew dashboard: unknown argument ${a}\n`); process.exit(2); }
  }
  return o;
}

const GIT_ENV = { ...process.env };
delete GIT_ENV.GIT_DIR;
delete GIT_ENV.GIT_WORK_TREE;
delete GIT_ENV.GIT_INDEX_FILE;
function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, env: GIT_ENV }).trim();
  } catch { return ''; }
}
function realpath(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// The main checkout of the repository: hooks in worktrees write to it, so it is the one to show.
function resolveRoot(arg) {
  const start = arg || path.resolve(HERE, '..', '..');
  const common = git(start, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.endsWith(`${path.sep}.git`)) return realpath(path.dirname(common));
  const top = common ? git(start, ['rev-parse', '--show-toplevel']) : '';
  return realpath(top || start);
}

const opts = parseArgs(process.argv.slice(2));
const ROOT = resolveRoot(opts.root);
const CREW = path.join(ROOT, '.crew');
const TMP = path.join(CREW, 'tmp');
const INFO = path.join(TMP, 'dashboard.json');
const LOG = path.join(TMP, 'dashboard.log');
const KEY = path.join(TMP, 'dashboard.key');
const LAN = process.env.CREW_DASHBOARD_LAN !== '0';
const LOCK = path.join(TMP, 'journal.lock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => process.stdout.write(`${new Date().toISOString()} ${a.join(' ')}\n`);

function readInfo() {
  try { return JSON.parse(fs.readFileSync(INFO, 'utf8')); } catch { return null; }
}
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
// A port derived from the project path: the same project gets the same port every time.
function hashPort(root) {
  let h = 2166136261;
  for (const c of Buffer.from(root)) { h ^= c; h = Math.imul(h, 16777619) >>> 0; }
  return 47100 + (h % 800);
}
function urlFor(port) { return `http://127.0.0.1:${port}/`; }

// This computer's address for other devices: a private one on Wi-Fi or Ethernet (the local
// network), else a Tailscale one (100.64.0.0/10). Never a VM bridge or a container network, nor a
// public address: a server on the internet is better reached through an SSH tunnel, on 127.0.0.1.
function lanAddress() {
  let best = '';
  let rank = 9;
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.internal || a.family !== 'IPv4') continue;
      const r = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && /^(en|eth|wl)/.test(name) ? 0
        : /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a.address) ? 1 : 9;
      if (r < rank) { best = a.address; rank = r; }
    }
  }
  return best;
}

// The key other devices need: in the URL once, then in a cookie. Kept across restarts so a
// bookmark on a phone keeps working; delete the file and restart the dashboard to change it.
function accessKey(create) {
  try {
    const k = fs.readFileSync(KEY, 'utf8').trim();
    if (k) return k;
  } catch { /* none yet */ }
  if (!create) return '';
  const k = crypto.randomBytes(12).toString('base64url');
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(KEY, `${k}\n`, { mode: 0o600 });
  return k;
}

// The URL to print: on the network when the server listens there and the computer has an
// address, worked out now (it changes with the network); otherwise this computer's.
function shareUrl(info) {
  const addr = info.lan ? lanAddress() : '';
  const key = addr ? accessKey(false) : '';
  return addr && key ? `http://${addr}:${info.port}/?key=${key}` : info.url;
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/ping', timeout: 1500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          resolve(j.app === APP_ID ? j : null);
        } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function running() {
  const info = readInfo();
  if (!info || !alive(info.pid)) return null;
  const p = await ping(info.port);
  return p && p.root === ROOT ? info : null;
}

// ---------------------------------------------------------------------------
// Updates: is a newer Crew released?
// ---------------------------------------------------------------------------

// Where Crew is published. Change these when the repository moves (DEVELOPING.md, "Moving Crew to
// its own repository").
const PUBLISHED = {
  releases: 'https://raw.githubusercontent.com/claudio-silva/ai-toolbox/main/skills/claude-code/crew/RELEASES.md',
  notes: 'https://github.com/claudio-silva/ai-toolbox/blob/main/skills/claude-code/crew/RELEASES.md',
  update: [
    { via: 'aitools', command: 'aitools update crew' },
    { via: 'npx skills', command: 'npx skills update crew' },
  ],
};
const RELEASES_URL = process.env.CREW_RELEASES_URL || PUBLISHED.releases;
const UPDATE_CHECK = process.env.CREW_UPDATE_CHECK !== '0';
const UPDATE_FILE = path.join(TMP, 'update.json');
const SIMULATE_FILE = path.join(TMP, 'update-simulate');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// This copy's releases: the RELEASES.md that /crew setup installs beside this file, or the skill's
// own when the server runs from the skill (scaffold/dashboard/).
function localReleases() {
  for (const f of [path.join(HERE, 'RELEASES.md'), path.join(HERE, '..', '..', 'RELEASES.md')]) {
    try { return parseReleases(fs.readFileSync(f, 'utf8')); } catch { /* next */ }
  }
  return [];
}

function readUpdateFile() {
  try { return JSON.parse(fs.readFileSync(UPDATE_FILE, 'utf8')); } catch { return {}; }
}

// Ask the published RELEASES.md. A failure keeps the releases found last time.
async function checkUpdates() {
  const prev = readUpdateFile();
  const out = { checkedAt: Date.now(), releases: prev.releases || [], error: null };
  try {
    const r = await fetch(RELEASES_URL, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'crew-dashboard' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = parseReleases(await r.text());
    if (!list.length) throw new Error('no releases in the published RELEASES.md');
    out.releases = list.slice(0, 40);
  } catch (e) {
    out.error = String(e?.message || e);
  }
  fs.mkdirSync(TMP, { recursive: true });
  const tmp = `${UPDATE_FILE}.${process.pid}.new`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2) + '\n');
  fs.renameSync(tmp, UPDATE_FILE);
  return out;
}

const checkDue = (u) => !u.checkedAt || Date.now() - u.checkedAt > (u.error ? HOUR : DAY);

// What the page shows. Simulating: this copy counts as the release before the latest one known,
// so the latest shows as new (from the published list, or this copy's own when there is none).
function updateView(checking = false) {
  const local = localReleases();
  const current = local[0]?.version || null;
  const u = readUpdateFile();
  const remote = Array.isArray(u.releases) ? u.releases : [];
  const simulated = fs.existsSync(SIMULATE_FILE);
  const known = simulated && !remote.length ? local : remote;
  const base = simulated ? (known[1]?.version || '0.0.0') : current;
  const releases = base ? known.filter((r) => compareVersions(r.version, base) > 0) : [];
  return {
    enabled: UPDATE_CHECK, current, latest: known[0]?.version || null, available: releases.length > 0, simulated, checking,
    releases, checkedAt: u.checkedAt ? Math.floor(u.checkedAt / 1000) : null, error: u.error || null,
    notes: PUBLISHED.notes, how: PUBLISHED.update,
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdStart() {
  if (await running()) return ALREADY_RUNNING;
  fs.mkdirSync(TMP, { recursive: true });
  try { if (fs.statSync(LOG).size > 1 << 20) fs.truncateSync(LOG, 0); } catch { /* no log yet */ }
  const out = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, [SELF, 'serve', '--root', ROOT], { detached: true, stdio: ['ignore', out, out], cwd: ROOT });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    const info = await running();
    if (info) { process.stdout.write(`Dashboard: ${shareUrl(info)}\n`); return 0; }
  }
  let tail = '';
  try { tail = fs.readFileSync(LOG, 'utf8').trim().split('\n').slice(-5).join('\n'); } catch { /* none */ }
  process.stderr.write(`crew dashboard: did not start; see ${path.relative(ROOT, LOG)}\n${tail}\n`);
  return 1;
}

async function cmdStop() {
  const cur = await running();
  if (!cur) { process.stdout.write('Dashboard: not running\n'); return 0; }
  try { process.kill(cur.pid, 'SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < 30 && alive(cur.pid); i++) await sleep(100);
  process.stdout.write('Dashboard: stopped\n');
  return 0;
}

async function cmdUrl() {
  const cur = await running();
  if (!cur) { process.stdout.write('Dashboard: not running\n'); return 1; }
  process.stdout.write(`${shareUrl(cur)}\n`);
  return 0;
}

async function cmdUpdates() {
  fs.mkdirSync(TMP, { recursive: true });
  if (opts.reset) fs.rmSync(SIMULATE_FILE, { force: true });
  if (opts.simulate) fs.writeFileSync(SIMULATE_FILE, 'The latest release counts as new: `.crew/bin/crew dashboard updates --reset` ends it.\n');
  if (opts.check) await checkUpdates();
  const v = updateView();
  const at = v.checkedAt ? new Date(v.checkedAt * 1000).toLocaleString() : 'never';
  process.stdout.write(`This copy: ${v.current || 'unknown (no RELEASES.md beside the dashboard)'}\n`);
  process.stdout.write(`Latest: ${v.latest || 'unknown'} (checked ${at}${v.error ? `; failed: ${v.error}` : ''})\n`);
  if (v.available) process.stdout.write(`Update available: ${v.releases.map((r) => r.version).join(', ')}${v.simulated ? ' (simulated)' : ''}\n`);
  else process.stdout.write(`Up to date${v.simulated ? ' (simulating, but no release is known)' : ''}\n`);
  if (!UPDATE_CHECK) process.stdout.write('The daily check is off (CREW_UPDATE_CHECK=0).\n');
  return 0;
}

function cmdState() {
  const s = buildState(ROOT, { now: opts.now });
  process.stdout.write(JSON.stringify(s, null, opts.pretty ? 2 : 0) + '\n');
  return 0;
}

// ---------------------------------------------------------------------------
// Messages to the lead (the Agents tab, the header's session menu)
// ---------------------------------------------------------------------------
//
// bin/crew records each session's way in (tmp/journal-state/reach/<session>). In Paseo, `paseo
// send` puts the message in the session as if the founder typed it in Paseo: into the running
// turn when the lead works (steering), else as a new turn. Paseo can't steer a slash command:
// it would interrupt the turn to run it, so a command to a working lead goes as words, asking
// the lead to run it (with the skill, the same thing). Elsewhere, Claude
// Code's cross-session inbox (2.1.224+): one connection to the session's socket, an auth line
// with the session's token (without it, a session that skips permission prompts holds the
// message), then the message; Claude Code starts a turn when the lead is idle and shows it
// between tool calls when it is busy, as a message from another session. FOUNDER_TAG opens it,
// and the CLAUDE.md block tells the lead that such a message is the founder's.
//   A session that runs without permission prompts holds a peer message unless its sender says
// it runs in the same permission class: the message is wrapped in Claude Code's own envelope,
// <cross-session-message from-mode="bypass|prompting">, with the lead's class as its transcript
// records it (the founder's own choice for that session). Without one, nothing is claimed.

const STATE_DIR = path.join(TMP, 'journal-state');
const ATTACH = path.join(TMP, 'attachments');
const MESSAGE_MAX = 100000;
const UPLOAD_MAX = 25 * 1024 * 1024;

class Refused extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > max) { reject(new Refused(413, `Too large (at most ${Math.round(max / 1024)} KB).`)); req.destroy(); return; }
      parts.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function envelope(text, mode) {
  const body = text.replace(/<\/?\s*cross-session-message/gi, '‹cross-session-message');
  if (!mode) return body;
  const cls = mode === 'bypassPermissions' ? 'bypass' : 'prompting';
  return `<cross-session-message from-mode="${cls}">\n${body}\n</cross-session-message>`;
}

function postToSocket(socket, token, text) {
  return new Promise((resolve, reject) => {
    const c = net.createConnection(socket, () => {
      if (token) c.write(JSON.stringify({ type: 'auth', token }) + '\n');
      c.end(JSON.stringify({ type: 'user', message: { role: 'user', content: text } }) + '\n');
    });
    c.setTimeout(5000, () => c.destroy(new Error('the session did not take the message')));
    c.on('error', reject);
    c.on('close', (failed) => { if (!failed) resolve(); });
  });
}

function paseoSend(cli, id, text) {
  return new Promise((resolve, reject) => {
    const file = path.join(os.tmpdir(), `crew-message-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(file, text, { mode: 0o600 });
    const p = spawn(cli || 'paseo', ['send', id, '--prompt-file', file, '--behavior', 'steer', '--no-wait'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20000 });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { fs.rmSync(file, { force: true }); reject(e); });
    p.on('close', (code) => {
      fs.rmSync(file, { force: true });
      if (code === 0) resolve(); else reject(new Error(err.trim().split('\n').pop() || `paseo exited with ${code}`));
    });
  });
}

// Deliver the founder's text (and the paths of files they attached) to a lead's session: `session`,
// else the newest live lead.
async function messageLead(text, files = [], session = null) {
  const sessions = claudeSessions(STATE_DIR);
  const ls = leadSession(STATE_DIR, sessions, session);
  if (!ls) throw new Refused(409, session ? 'That lead is no longer registered: open the Agents tab again.' : 'No crew session yet: run /crew in Claude Code first.');
  if (!ls.alive) throw new Refused(409, "The crew's Claude Code session is closed.");
  const r = readReach(STATE_DIR, ls.session);
  const via = reachVia(r);
  if (!via) {
    throw new Refused(409, 'This session has not recorded a way in yet. Send it any message where it runs, or run /crew resume there; '
      + 'outside Paseo it needs Claude Code 2.1.224 or later.');
  }
  // Attachments by absolute path: the lead may be working in a worktree.
  const paths = files.map((f) => path.resolve(ROOT, String(f)));
  if (paths.some((f) => !inside(f, ATTACH) || !fs.existsSync(f))) throw new Refused(400, 'An attached file is missing; attach it again.');
  const attached = paths.length ? `\n\nAttached files:\n${paths.map((f) => `- ${f}`).join('\n')}` : '';
  const body = `${text}${attached}`;
  let working = false;
  try { working = /^working\b/.test(fs.readFileSync(path.join(STATE_DIR, 'leads', ls.session), 'utf8')); } catch { /* no state yet */ }
  try {
    if (via === 'paseo' && working && /^\/\S/.test(text.trim())) {
      await paseoSend(r.paseoCli, r.paseo, `The founder, from the Crew dashboard: run ${text.trim()} now, as if they had typed it.${attached}`);
    } else if (via === 'paseo') await paseoSend(r.paseoCli, r.paseo, body);
    else await postToSocket(r.socket, r.token, envelope(`${FOUNDER_TAG}\n\n${body}`, permissionModeOf(ls.transcript)));
  } catch (e) {
    throw new Refused(502, `Could not deliver the message: ${e?.message || e}`);
  }
  return { ok: true, via, session: ls.session };
}

// An attached file, kept under .crew/tmp/attachments/ (gitignored) for the lead to read.
function saveAttachment(name, data) {
  const base = safeName(path.basename(String(name || 'file'))).slice(-80);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
  fs.mkdirSync(ATTACH, { recursive: true });
  let file = path.join(ATTACH, `${stamp}-${base}`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(ATTACH, `${stamp}-${i}-${base}`);
  fs.writeFileSync(file, data);
  return path.relative(ROOT, file).split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.tsv': 'text/plain; charset=utf-8',
};

function buildId() {
  const h = crypto.createHash('sha1');
  const walk = (d) => {
    let names = [];
    try { names = fs.readdirSync(d).sort(); } catch { return; }
    for (const n of names) {
      const p = path.join(d, n);
      let s;
      try { s = fs.statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else h.update(`${path.relative(APP, p)}:${s.size}:${s.mtimeMs}\n`);
    }
  };
  walk(APP);
  return h.digest('hex').slice(0, 12);
}

const NOT_BUILT = `<!doctype html><meta charset="utf-8"><title>Crew dashboard</title>
<body style="font:15px system-ui;margin:3rem;max-width:40rem">
<h1>Crew dashboard</h1><p>The page is not installed in <code>.crew/dashboard/app/</code>. Run <code>/crew setup</code> again.</p>
<p>The model is at <a href="/api/state">/api/state</a>.</p></body>`;

const NO_KEY = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Crew dashboard</title>
<body style="font:15px system-ui;margin:2rem;max-width:40rem">
<h1>Crew dashboard</h1><p>From another device, this page needs the project's key. On the computer running the crew, run
<code>.crew/bin/crew dashboard url</code> and open the whole address it prints, <code>?key=</code> included.</p></body>`;

const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);
const loopback = (addr) => /^(127\.|::1$|::ffff:127\.)/.test(addr || '');
// Headers a proxy or a tunnel adds (cloudflared, ngrok, Dev Tunnels, Tailscale Serve, Paseo's
// service proxy): such a request only looks local, since the agent runs here, and may rewrite
// Host to localhost. An SSH tunnel adds none, and stays local.
const PROXIED = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'tailscale-user-login'];
const proxied = (req) => PROXIED.some((h) => req.headers[h] !== undefined);
const LOCAL_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
function cookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}
function sameKey(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function cmdServe() {
  const clients = new Set();
  const tails = new Set(); // transcript streams
  let stateJson = '';
  let compareJson = '';
  let current = null;
  let build = buildId();
  let port = 0;
  const key = accessKey(true);

  // ---- the model ----
  let timer = null;
  let firstAt = 0;
  let lockWaits = 0;
  let tick = null;

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${data}\n\n`;
    for (const res of clients) res.write(msg);
  };

  let checking = null;
  const recompute = () => {
    let s;
    try {
      s = buildState(ROOT);
      s.update = updateView(Boolean(checking));
    } catch (e) {
      log('model failed:', e?.stack || String(e));
      broadcast('problem', JSON.stringify({ message: String(e?.message || e) }));
      return;
    }
    current = s;
    const { generatedAt: _g, ...rest } = s;
    const cmp = JSON.stringify(rest);
    if (cmp !== compareJson) {
      compareJson = cmp;
      stateJson = JSON.stringify(s);
      broadcast('state', stateJson);
    }
    syncWorktreeWatchers(s.worktrees);
    clearTimeout(tick);
    tick = null;
    if (s.live) tick = setTimeout(recompute, 60000 - (Date.now() % 60000) + 300);
  };

  const runScheduled = () => {
    timer = null;
    // bin/crew writes under its lock: read once it is released (wait up to a second).
    if (fs.existsSync(LOCK) && lockWaits < 10) {
      lockWaits++;
      timer = setTimeout(runScheduled, 100);
      return;
    }
    lockWaits = 0;
    recompute();
  };
  const schedule = () => {
    const now = Date.now();
    if (!timer) firstAt = now;
    else clearTimeout(timer);
    timer = setTimeout(runScheduled, Math.max(0, Math.min(150, firstAt + 1000 - now)));
  };

  // ---- reload and restart ----
  let reloadTimer = null;
  const appChanged = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      const b = buildId();
      if (b === build) return;
      build = b;
      log('page changed; reloading open pages');
      broadcast('reload', JSON.stringify({ build }));
    }, 400);
  };
  let restartTimer = null;
  const sourceChanged = () => {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (!fs.existsSync(SELF) || !fs.existsSync(path.join(HERE, 'model.mjs'))) { sourceChanged(); return; }
      log('server source changed; restarting');
      shutdown(() => {
        const out = fs.openSync(LOG, 'a');
        spawn(process.execPath, [SELF, 'serve', '--root', ROOT, '--port', String(port), '--replace'], {
          detached: true, stdio: ['ignore', out, out], cwd: ROOT,
        }).unref();
      });
    }, 1500);
  };

  // ---- watchers ----
  const IGNORE = [
    /^tmp\/journal\.lock(\/|$)/, /^tmp\/dashboard\./, /^tmp\/journal-state\/set-start\//, /^tmp\/journal-state\/compact\//,
    /\.(new|tmp|bak|swp)$/, /(^|\/)\.DS_Store$/, /~$/,
  ];
  const watchers = new Map();
  const watch = (key, dir, recursive, fn) => {
    if (watchers.has(key)) return;
    try {
      const w = fs.watch(dir, { recursive, persistent: true }, fn);
      w.on('error', () => { w.close(); watchers.delete(key); if (key === 'crew' && !fs.existsSync(CREW)) shutdown(); });
      watchers.set(key, w);
    } catch { /* missing directory: nothing to watch */ }
  };
  // This server's own files (in .crew/dashboard/, or wherever it runs from).
  const onSelf = (rel) => {
    const f = rel.split(path.sep).join('/');
    if (f === 'app' || f.startsWith('app/')) appChanged();
    else if (f === 'server.mjs' || f === 'model.mjs') sourceChanged();
    else if (f === 'RELEASES.md') schedule();
  };
  const onCrew = (_ev, file) => {
    const f = file ? String(file).split(path.sep).join('/') : '';
    const abs = path.join(CREW, f);
    if (f && inside(abs, HERE)) { onSelf(path.relative(HERE, abs)); return; }
    if (f && IGNORE.some((re) => re.test(f))) return;
    if (!fs.existsSync(CREW)) { shutdown(); return; }
    schedule();
  };
  watch('crew', CREW, true, onCrew);
  if (!inside(HERE, CREW)) watch('self', HERE, true, (_ev, file) => { if (file) onSelf(String(file)); });
  const gitDir = git(ROOT, ['rev-parse', '--absolute-git-dir']);
  const watchRefs = () => watch('refs', path.join(gitDir, 'refs', 'heads'), true, schedule);
  if (gitDir) {
    watch('git', gitDir, false, (_ev, file) => {
      const f = String(file || '');
      if (f === 'HEAD' || f === 'packed-refs' || f === 'worktrees' || f === 'refs') { watchRefs(); schedule(); }
    });
    watchRefs();
    watch('worktrees', path.join(gitDir, 'worktrees'), false, schedule);
  }
  const syncWorktreeWatchers = (wts) => {
    const want = new Set();
    for (const w of wts || []) {
      const dir = path.join(w.path, '.crew', 'tasks');
      const key = `wt:${dir}`;
      want.add(key);
      watch(key, dir, true, schedule);
    }
    for (const [key, w] of watchers) if (key.startsWith('wt:') && !want.has(key)) { w.close(); watchers.delete(key); }
    if (gitDir && !watchers.has('worktrees')) watch('worktrees', path.join(gitDir, 'worktrees'), false, schedule);
  };

  // ---- updates: once a day, or when the page asks ----
  const runCheck = (force) => {
    if (checking) return checking;
    if (!force && (!UPDATE_CHECK || !checkDue(readUpdateFile()))) return Promise.resolve();
    checking = checkUpdates().catch((e) => log('update check failed:', String(e?.message || e))).finally(() => { checking = null; recompute(); });
    recompute();
    return checking;
  };
  const updateTimer = setInterval(() => runCheck(false), HOUR);

  // ---- HTTP ----
  const send = (res, code, type, body, extra = {}) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(body);
  };
  const sendFile = (req, res, file, extra = {}) => {
    let s;
    try { s = fs.statSync(file); } catch { send(res, 404, 'text/plain', 'Not found'); return; }
    if (!s.isFile()) { send(res, 404, 'text/plain', 'Not found'); return; }
    const etag = `"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': s.size, 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff', ...extra,
    });
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer((req, res) => {
    // This computer, by a local name (on any port, for an SSH tunnel) and not through a proxy: no
    // DNS-rebinding page can read the project. Anyone else, another device or a proxy: with the
    // key, which a page on another site cannot know; it comes in the URL once, then a cookie.
    const name = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    const u = new URL(req.url || '/', 'http://localhost');
    if (!(loopback(req.socket.remoteAddress) && LOCAL_NAMES.has(name) && !proxied(req))) {
      const jar = `crew_key_${port}`;
      const given = u.searchParams.get('key');
      if (given && sameKey(given, key)) {
        res.setHeader('Set-Cookie', `${jar}=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
      } else if (!sameKey(cookie(req, jar), key)) {
        send(res, 403, 'text/html; charset=utf-8', NO_KEY);
        return;
      }
    }
    if (u.pathname === '/api/update/check' && req.method === 'POST') {
      // The page's "Check now". The custom header keeps other sites' pages from sending it.
      if (req.headers['x-crew'] !== '1') { send(res, 403, 'text/plain', 'Forbidden'); return; }
      runCheck(true).then(() => send(res, 200, 'application/json', JSON.stringify(updateView(false))));
      return;
    }
    if (req.method === 'POST' && (u.pathname === '/api/lead/message' || u.pathname === '/api/lead/attach')) {
      // The founder writing to the lead. Same guard as above: other sites' pages cannot send it.
      if (req.headers['x-crew'] !== '1') { send(res, 403, 'text/plain', 'Forbidden'); return; }
      const json = (code, o) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(o));
      const fail = (e) => json(e instanceof Refused ? e.code : 500, { ok: false, error: String(e?.message || e) });
      if (u.pathname === '/api/lead/attach') {
        readBody(req, UPLOAD_MAX).then((data) => json(200, { ok: true, path: saveAttachment(u.searchParams.get('name'), data) })).catch(fail);
        return;
      }
      readBody(req, MESSAGE_MAX).then((data) => {
        let m;
        try { m = JSON.parse(data.toString('utf8')); } catch { throw new Refused(400, 'Not JSON.'); }
        const text = String(m?.text ?? '').trim();
        const files = Array.isArray(m?.files) ? m.files.map(String) : [];
        if (!text && !files.length) throw new Refused(400, 'Nothing to send.');
        const session = m?.session == null ? null : String(m.session);
        if (session != null && !/^[A-Za-z0-9._-]{1,120}$/.test(session)) throw new Refused(400, 'Bad session.');
        return messageLead(text, files, session);
      }).then((r) => { log(`message to the lead (${r.via})`); json(200, r); }).catch(fail);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'text/plain', 'Method not allowed'); return; }
    if (u.pathname === '/api/ping') {
      send(res, 200, 'application/json', JSON.stringify({ app: APP_ID, root: ROOT, pid: process.pid, version: SERVER_VERSION }));
      return;
    }
    if (u.pathname === '/api/share') {
      // For the page's QR code: this computer's address on the network, worked out now, and the key.
      const address = LAN ? lanAddress() : '';
      const url = address ? `http://${address}:${port}/?key=${key}` : null;
      send(res, 200, 'application/json', JSON.stringify({ url, local: urlFor(port), lan: LAN, address, port }));
      return;
    }
    if (u.pathname === '/api/state') {
      if (!stateJson) recompute();
      send(res, 200, 'application/json; charset=utf-8', stateJson);
      return;
    }
    if (u.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      res.write('retry: 1500\n\n');
      res.write(`event: hello\ndata: ${JSON.stringify({ build, server: SERVER_VERSION, root: ROOT })}\n\n`);
      if (!stateJson) recompute();
      res.write(`event: state\ndata: ${stateJson}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (u.pathname === '/api/transcript' || u.pathname === '/api/transcript/stream') {
      // An agent's transcript ('lead:<session>', 'lead' or a subagent id), only from the transcripts bin/crew recorded.
      const file = transcriptFile(STATE_DIR, u.searchParams.get('agent') || '', claudeSessions(STATE_DIR));
      const at = (k) => (/^\d+$/.test(u.searchParams.get(k) || '') ? Number(u.searchParams.get(k)) : null);
      if (!file) { send(res, 404, 'application/json', JSON.stringify({ error: 'No transcript for this agent.' })); return; }
      if (u.pathname === '/api/transcript') {
        const t = readTranscript(file, { before: at('before') });
        if (!t) { send(res, 404, 'application/json', JSON.stringify({ error: 'The transcript cannot be read.' })); return; }
        send(res, 200, 'application/json; charset=utf-8', JSON.stringify(t));
        return;
      }
      // Lines added from `from` on, as they are written.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      let pos = at('from') ?? 0;
      const pump = () => {
        const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0;
        if (size < pos) { res.write('event: reset\ndata: {}\n\n'); pos = size; return; }
        if (size === pos) return;
        const t = readTranscript(file, { from: pos });
        if (!t || t.end === pos) return;
        pos = t.end;
        res.write(`event: entries\ndata: ${JSON.stringify({ entries: t.entries, end: t.end })}\n\n`);
      };
      pump();
      fs.watchFile(file, { interval: 500 }, pump);
      tails.add(res);
      req.on('close', () => { fs.unwatchFile(file, pump); tails.delete(res); });
      return;
    }
    if (u.pathname === '/api/icon') {
      // The project's icon, as found by the model; nothing else.
      if (!current) recompute();
      const rel = current?.repo?.icon?.path;
      if (!rel) { send(res, 404, 'text/plain', 'Not found'); return; }
      sendFile(req, res, path.join(ROOT, rel), { 'Content-Security-Policy': 'sandbox' });
      return;
    }
    if (u.pathname === '/files') {
      const p = u.searchParams.get('p') || '';
      const real = realpath(p);
      if (!current) recompute();
      const ok = current && path.isAbsolute(p) && allowedDirs(current).some((d) => inside(real, realpath(d)));
      if (!ok) { send(res, 403, 'text/plain', 'Forbidden'); return; }
      sendFile(req, res, real, { 'Content-Security-Policy': 'sandbox' });
      return;
    }
    // The page.
    if (!fs.existsSync(path.join(APP, 'index.html'))) { send(res, 200, 'text/html; charset=utf-8', NOT_BUILT); return; }
    const rel = u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname.slice(1));
    const file = path.resolve(APP, rel);
    if (!inside(file, APP)) { send(res, 403, 'text/plain', 'Forbidden'); return; }
    if (fs.existsSync(file)) sendFile(req, res, file);
    else if (!path.extname(rel)) sendFile(req, res, path.join(APP, 'index.html'));
    else send(res, 404, 'text/plain', 'Not found');
  });
  server.keepAliveTimeout = 5000;

  // Keep idle connections open through anything in between (a comment line, ignored by pages).
  const heartbeat = setInterval(() => { for (const res of [...clients, ...tails]) res.write(': hb\n\n'); }, 30000);

  let closing = false;
  function shutdown(then) {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    clearInterval(updateTimer);
    clearTimeout(tick);
    for (const w of watchers.values()) w.close();
    for (const res of [...clients, ...tails]) res.end();
    const info = readInfo();
    if (info && info.pid === process.pid) { try { fs.unlinkSync(INFO); } catch { /* gone */ } }
    server.close(() => { if (then) then(); process.exit(0); });
    server.closeAllConnections?.();
    setTimeout(() => { if (then) then(); process.exit(0); }, 2000).unref();
  }
  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
  process.on('SIGHUP', () => shutdown());

  // ---- listen: the project's port; another crew dashboard for this project means we are not needed ----
  const listen = (p) => new Promise((resolve) => {
    const onErr = (e) => { server.off('listening', onOk); resolve(e.code || 'ERR'); };
    const onOk = () => { server.off('error', onErr); resolve('ok'); };
    server.once('error', onErr);
    server.once('listening', onOk);
    server.listen(p, LAN ? '0.0.0.0' : '127.0.0.1');
  });
  const prev = readInfo();
  let candidate = opts.port || (prev && prev.root === ROOT && prev.port) || hashPort(ROOT);
  for (let attempt = 0; attempt < 40; attempt++) {
    let r = await listen(candidate);
    if (r === 'ok' && LAN) {
      // macOS lets 0.0.0.0 bind beside a server on 127.0.0.1 alone, which then keeps this
      // computer's requests: the port is only ours when 127.0.0.1 answers with this process.
      port = candidate;
      const me = await ping(candidate);
      if (me?.pid !== process.pid) {
        port = 0;
        await new Promise((done) => server.close(done));
        r = 'EADDRINUSE';
      }
    }
    if (r === 'ok') { port = candidate; break; }
    if (r !== 'EADDRINUSE') { log(`cannot listen on ${candidate}: ${r}`); candidate++; continue; }
    const other = await ping(candidate);
    if (other && other.root === ROOT) {
      if (opts.replace && attempt < 25) { await sleep(200); continue; }
      log(`already running on ${candidate} (pid ${other.pid})`);
      process.exit(0);
    }
    candidate++;
  }
  if (!port) { log('no free port'); process.exit(1); }

  fs.mkdirSync(TMP, { recursive: true });
  const info = { app: APP_ID, pid: process.pid, port, url: urlFor(port), lan: LAN, root: ROOT, started: new Date().toISOString(), node: process.versions.node };
  fs.writeFileSync(INFO, JSON.stringify(info, null, 2) + '\n');
  log(`serving ${ROOT} at ${info.url}${LAN ? ` and on the network at ${shareUrl(info).replace(/key=.*/, 'key=…')}` : ''} (pid ${process.pid})`);
  recompute();
  setTimeout(() => runCheck(false), 3000).unref();
}

// ---------------------------------------------------------------------------

let rc = 0;
switch (opts.cmd) {
  case 'start': rc = await cmdStart(); break;
  case 'stop': rc = await cmdStop(); break;
  case 'restart': await cmdStop(); rc = await cmdStart(); break;
  case 'url': rc = await cmdUrl(); break;
  case 'state': rc = cmdState(); break;
  case 'updates': rc = await cmdUpdates(); break;
  case 'serve': await cmdServe(); rc = -1; break;
  default:
    process.stderr.write('usage: server.mjs start|stop|restart|url|state|serve|updates [--root <dir>] [--port <n>] [--now <epoch>] [--pretty] [--check] [--simulate] [--reset]\n');
    rc = 2;
}
if (rc >= 0) process.exit(rc);
