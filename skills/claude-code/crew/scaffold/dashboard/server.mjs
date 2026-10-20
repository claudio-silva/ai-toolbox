#!/usr/bin/env node
// crew dashboard: a local web page for the founder, live over Server-Sent Events.
//
// Installed by `/crew setup` as <project>/.crew/dashboard/server.mjs; started by
// `.crew/bin/crew session start` and `.crew/bin/crew dashboard`. Node.js 20 or later, no
// dependencies. One server per repository, on 127.0.0.1, on a port that stays the same for the
// project (kept in .crew/tmp/dashboard.json), so a browser tab or a Paseo side panel keeps working
// across restarts.
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
import fs from 'node:fs';
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

const { buildState, allowedDirs } = await import('./model.mjs');

// ---------------------------------------------------------------------------
// Arguments, paths
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { cmd: 'start', root: '', port: 0, now: undefined, pretty: false, replace: false };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) o.cmd = rest.shift();
  while (rest.length) {
    const a = rest.shift();
    if (a === '--root') o.root = rest.shift() || '';
    else if (a === '--port') o.port = Number(rest.shift()) || 0;
    else if (a === '--now') o.now = Number(rest.shift()) || undefined;
    else if (a === '--pretty') o.pretty = true;
    else if (a === '--replace') o.replace = true;
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
    if (info) { process.stdout.write(`Dashboard: ${info.url}\n`); return 0; }
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
  process.stdout.write(`${cur.url}\n`);
  return 0;
}

function cmdState() {
  const s = buildState(ROOT, { now: opts.now });
  process.stdout.write(JSON.stringify(s, null, opts.pretty ? 2 : 0) + '\n');
  return 0;
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

const inside = (file, dir) => file === dir || file.startsWith(dir + path.sep);

async function cmdServe() {
  const clients = new Set();
  let stateJson = '';
  let compareJson = '';
  let current = null;
  let build = buildId();
  let port = 0;

  // ---- the model ----
  let timer = null;
  let firstAt = 0;
  let lockWaits = 0;
  let tick = null;

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${data}\n\n`;
    for (const res of clients) res.write(msg);
  };

  const recompute = () => {
    let s;
    try {
      s = buildState(ROOT);
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
    // Only this machine, by name: no DNS-rebinding page can read the project.
    const host = String(req.headers.host || '');
    if (![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host)) {
      send(res, 403, 'text/plain', 'Forbidden');
      return;
    }
    const u = new URL(req.url || '/', `http://${host}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'text/plain', 'Method not allowed'); return; }
    if (u.pathname === '/api/ping') {
      send(res, 200, 'application/json', JSON.stringify({ app: APP_ID, root: ROOT, pid: process.pid, version: SERVER_VERSION }));
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
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': hb\n\n'); }, 30000);

  let closing = false;
  function shutdown(then) {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    clearTimeout(tick);
    for (const w of watchers.values()) w.close();
    for (const res of clients) res.end();
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
    server.listen(p, '127.0.0.1');
  });
  const prev = readInfo();
  let candidate = opts.port || (prev && prev.root === ROOT && prev.port) || hashPort(ROOT);
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = await listen(candidate);
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
  const info = { app: APP_ID, pid: process.pid, port, url: urlFor(port), root: ROOT, started: new Date().toISOString(), node: process.versions.node };
  fs.writeFileSync(INFO, JSON.stringify(info, null, 2) + '\n');
  log(`serving ${ROOT} at ${info.url} (pid ${process.pid})`);
  recompute();
}

// ---------------------------------------------------------------------------

let rc = 0;
switch (opts.cmd) {
  case 'start': rc = await cmdStart(); break;
  case 'stop': rc = await cmdStop(); break;
  case 'restart': await cmdStop(); rc = await cmdStart(); break;
  case 'url': rc = await cmdUrl(); break;
  case 'state': rc = cmdState(); break;
  case 'serve': await cmdServe(); rc = -1; break;
  default:
    process.stderr.write('usage: server.mjs start|stop|restart|url|state|serve [--root <dir>] [--port <n>] [--now <epoch>] [--pretty]\n');
    rc = 2;
}
if (rc >= 0) process.exit(rc);
