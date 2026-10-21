// Tests for the dashboard: the model's parsers, and the server live (state pushed over SSE when a
// crew file changes, the Host, key and file guards). The timing, defect, compaction and lead-state
// numbers are checked end to end by tests/hooks.sh.
// Run from the skill directory: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASH = path.join(SKILL, 'scaffold', 'dashboard');
const M = await import(path.join(DASH, 'model.mjs'));

const INDEX = `# Autosave — tasks

| # | Status | Task | Flags | Depends on | Spec |
|---|---|---|---|---|---|
| T06 | accepted | Conflict banner | — | — | \`06-banner.md\` |
| T07 | in progress | Autosave timer | judgement, ui | T06 | \`07-timer.md\` |
| T08 | rework | Autosave tests | — | T06, T07 | \`08-tests.md\` |

## About
- **Branch:** \`crew/autosave\` (from main)
- **Stage:** 2 of 3, the editor
`;

test('parseIndex: rows, statuses, flags, dependencies, branch and stage', () => {
  const idx = M.parseIndex(INDEX);
  assert.equal(idx.title, 'Autosave');
  assert.deepEqual(idx.rows.map((r) => `${r.id}:${r.status}`), ['T06:accepted', 'T07:progress', 'T08:rework']);
  assert.deepEqual(idx.rows[1].flags, ['judgement', 'ui']);
  assert.deepEqual(idx.rows[2].deps, ['T06', 'T07']);
  assert.equal(idx.rows[1].spec, '07-timer.md');
  assert.match(idx.branch, /^`?crew\/autosave/);
  assert.match(idx.stage, /^2 of 3/);
});

test('parseJournalLine: agent starts keep " · " inside the parentheses', () => {
  const e = M.parseJournalLine('2026-10-20 14:05 · lead → builder (sonnet · high) [crew/x] · T07 Autosave timer', '2026-10-20');
  assert.equal(e.kind, 'start');
  assert.equal(e.time, '14:05');
  assert.equal(e.branch, 'crew/x');
  assert.equal(e.agentType, 'builder');
  assert.equal(e.model, 'sonnet');
  assert.equal(e.effort, 'high');
  assert.equal(e.text, 'T07 Autosave timer');
  const stop = M.parseJournalLine('14:30 · ← reviewer · CHANGES · two findings', '2026-10-20');
  assert.equal(stop.kind, 'stop');
  assert.equal(stop.status, 'CHANGES');
  assert.equal(M.parseJournalLine('14:31 · ↺ t07-builder · resumed', '2026-10-20').kind, 'resume');
  assert.equal(M.parseJournalLine('14:32 · system · The computer slept 1 h', '2026-10-20').kind, 'system');
});

test('parseQueue and parseDefects: fields, states, promotion', () => {
  const q = `## Requests from the founder
- [R1] 2026-10-20 · Rename Save · affects: T07 · slot: after T07 · status: done (T08)
## Questions for the founder
- [F1] 2026-10-20 · Which email? · default taken: none, T09 parked · status: open
`;
  const [r] = M.parseQueue(q, 'R');
  assert.deepEqual([r.id, r.text, r.affects, r.slot, r.state], ['R1', 'Rename Save', 'T07', 'after T07', 'done']);
  const [f] = M.parseQueue(q, 'F');
  assert.deepEqual([f.id, f.default, f.state], ['F1', 'none, T09 parked', 'open']);
  const d = M.parseDefects('- [D1] 2026-10-20 · Icon 2 px low · where: ribbon · from: T07 review · severity: medium · slot: end of set · status: scheduled · promoted\n');
  assert.deepEqual([d[0].where, d[0].severity, d[0].state, d[0].promoted], ['ribbon', 'medium', 'scheduled', true]);
  assert.deepEqual(M.defectSummary(d), { total: 1, deferred: 0, deferredMedium: 0, scheduled: 1, fixed: 0, dropped: 0, promoted: 1 });
});

test('safeName matches bin/crew (tr -c under LC_ALL=C, byte-wise)', () => {
  assert.equal(M.safeName('/tmp/a b/índex.md'), '_tmp_a_b___ndex.md');
});

test('leadState: the epoch bin/crew writes, or one derived from HH:MM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-lead-'));
  try {
    fs.writeFileSync(path.join(dir, 'lead'), 'working 14:05 1792500300\n');
    assert.deepEqual(M.leadState(dir, 0, 1792503900), { state: 'working', since: '14:05', sinceEpoch: 1792500300 });
    // Older lines carry no epoch: today at that time, or yesterday when that is still to come.
    const now = Math.floor(new Date(2026, 9, 20, 10, 0).getTime() / 1000);
    fs.writeFileSync(path.join(dir, 'lead'), 'waiting 09:30\n');
    assert.equal(M.leadState(dir, 0, now).sinceEpoch, now - 1800);
    fs.writeFileSync(path.join(dir, 'lead'), 'stopped 23:50\n');
    const st = M.leadState(dir, 2, now);
    assert.deepEqual([st.state, st.sinceEpoch, st.agentsFinishing], ['stopped', now - 36600, 2]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// The first 24 bytes of a PNG: the signature, then the IHDR chunk with the width and height.
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

test('computeTiming: the split of the elapsed time, and where it ends', () => {
  const tasks = [{ id: 'T01', num: 1, depNums: [] }];
  const runs = [{ start: 1000, end: 1600, id: 'a', type: 'builder', task: '1', kind: 'first', status: 'DONE' }];
  // The lead worked 900-1100 (overlapping the run by 100 s) and 1700-1800, then waited.
  const leadWork = M.leadWorkIntervals([{ at: 900, state: 'working' }, { at: 1100, state: 'idle' }, { at: 1700, state: 'working' }, { at: 1800, state: 'idle' }], 9000);
  assert.deepEqual(leadWork, [[900, 1100], [1700, 1800]]);
  const base = { tasks, runs, sleeps: [], start: 900, now: 9000, leadWork };
  const open = M.computeTiming(base);
  assert.deepEqual([open.until, open.clock, open.busy, open.leadAlone, open.active, open.idle], [null, 8100, 600, 200, 800, 7300]);
  // Claude Code closed at 2000: nothing grows after it.
  const closed = M.computeTiming({ ...base, closedAt: 2000 });
  assert.deepEqual([closed.until, closed.clock, closed.active, closed.idle], [2000, 1100, 800, 300]);
});

test('imageSize and projectIcon: square images only, the most icon-like first, dependencies skipped', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-icon-'));
  const put = (rel, data) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  };
  try {
    assert.equal(M.projectIcon(root, 0), null);
    // An ICO's directory: 16, 48 and 32 px entries; its size is the largest.
    const ico = Buffer.alloc(6 + 3 * 16);
    ico.writeUInt16LE(1, 2);
    ico.writeUInt16LE(3, 4);
    [16, 48, 32].forEach((px, i) => { ico[6 + 16 * i] = px; ico[7 + 16 * i] = px; });
    put('favicon.ico', ico);
    put('node_modules/pkg/favicon.png', png(512, 512));
    put('docs/logo.png', png(400, 120));
    put('assets/logo.png', png(256, 256));
    put('public/apple-touch-icon.png', png(180, 181));
    put('src/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"></svg>');
    assert.deepEqual(M.imageSize(path.join(root, 'favicon.ico')), [48, 48]);
    assert.deepEqual(M.imageSize(path.join(root, 'docs/logo.png')), [400, 120]);
    assert.deepEqual(M.imageSize(path.join(root, 'src/favicon.svg')), [32, 32]);
    // The first call's empty result is cached for 30 s; these calls are later.
    assert.equal(M.projectIcon(root, 60000).path, 'src/favicon.svg');
    fs.rmSync(path.join(root, 'src'), { recursive: true });
    const { path: rel, w, h } = M.projectIcon(root, 120000);
    assert.deepEqual([rel, w, h], ['public/apple-touch-icon.png', 180, 181]);
    // Large enough beats a more icon-like name: a 256 px logo over a 48 px favicon.ico.
    fs.rmSync(path.join(root, 'public'), { recursive: true });
    assert.equal(M.projectIcon(root, 180000).path, 'assets/logo.png');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---- the server ----

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body, cookie: res.headers['set-cookie']?.[0] ?? '' }));
    }).on('error', reject);
  });
}

// An SSE client that collects events; next(name) resolves with the next one of that name.
function events(url) {
  const queue = [];
  const waiting = [];
  let req;
  const ready = new Promise((resolve, reject) => {
    req = http.get(url, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev) continue;
          const w = waiting.findIndex((x) => x.name === ev);
          if (w >= 0) waiting.splice(w, 1)[0].resolve(data);
          else queue.push({ name: ev, data });
        }
      });
      resolve();
    });
    req.on('error', reject);
  });
  return {
    ready,
    next(name, ms = 5000) {
      const i = queue.findIndex((x) => x.name === name);
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0].data);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`no "${name}" event in ${ms} ms`)), ms);
        waiting.push({ name, resolve: (d) => { clearTimeout(t); resolve(d); } });
      });
    },
    close() { req.destroy(); },
  };
}

test('server: pushes the new state when a crew file changes; guards Host, key and files', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crew-dash-')));
  const crew = path.join(root, '.crew');
  fs.mkdirSync(path.join(crew, 'tasks', 'autosave'), { recursive: true });
  fs.writeFileSync(path.join(crew, 'tasks', 'autosave', 'index.md'), INDEX);
  fs.writeFileSync(path.join(root, 'secret.txt'), 'not for the page');
  execFileSync('git', ['init', '-q', root]);
  const port = 48000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [path.join(DASH, 'server.mjs'), 'serve', '--root', root, '--port', String(port)], { stdio: 'ignore' });
  t.after(() => { srv.kill(); fs.rmSync(root, { recursive: true, force: true }); });

  const info = path.join(crew, 'tmp', 'dashboard.json');
  for (let i = 0; i < 60 && !fs.existsSync(info); i++) await new Promise((r) => setTimeout(r, 100));
  const { url } = JSON.parse(fs.readFileSync(info, 'utf8'));

  const ping = JSON.parse((await get(`${url}api/ping`)).body);
  assert.equal(ping.root, root);

  // Starting it again for the same project does nothing: exit 3 and no output.
  const again = spawnSync(process.execPath, [path.join(DASH, 'server.mjs'), 'start', '--root', root], { encoding: 'utf8' });
  assert.deepEqual([again.status, again.stdout], [3, '']);

  const es = events(`${url}api/events`);
  t.after(() => es.close());
  await es.ready;
  assert.ok(JSON.parse(await es.next('hello')).build);
  const first = JSON.parse(await es.next('state'));
  assert.equal(first.current.accepted, 1);

  fs.writeFileSync(path.join(crew, 'tasks', 'autosave', 'index.md'), INDEX.replace('| T07 | in progress |', '| T07 | accepted |'));
  const second = JSON.parse(await es.next('state'));
  assert.equal(second.current.accepted, 2);

  // This computer by a local name, on any port (an SSH tunnel); anything else needs the key.
  assert.equal((await get(`${url}api/state`, { Host: 'evil.example:80' })).status, 403);
  assert.equal((await get(`${url}api/state`, { Host: 'localhost:8080' })).status, 200);
  const key = fs.readFileSync(path.join(crew, 'tmp', 'dashboard.key'), 'utf8').trim();
  assert.match(key, /^[\w-]{16}$/);
  assert.equal((await get(`${url}api/state?key=wrong`, { Host: 'evil.example:80' })).status, 403);
  const keyed = await get(`${url}api/state?key=${key}`, { Host: 'evil.example:80' });
  assert.equal(keyed.status, 200);
  assert.match(keyed.cookie, new RegExp(`^crew_key_${port}=${key}; Path=/;.*HttpOnly`));
  const jar = keyed.cookie.split(';')[0];
  assert.equal((await get(`${url}api/state`, { Host: 'evil.example:80', Cookie: `a=1; ${jar}` })).status, 200);
  assert.equal((await get(`${url}api/state`, { Host: 'evil.example:80', Cookie: `crew_key_${port + 1}=${key}` })).status, 403);
  // Another device: the printed URL carries this computer's address and the key.
  const printed = spawnSync(process.execPath, [path.join(DASH, 'server.mjs'), 'url', '--root', root], { encoding: 'utf8' }).stdout.trim();
  const addr = /^http:\/\/([\d.]+):(\d+)\/\?key=(.+)$/.exec(printed);
  // The page's QR code asks the same, behind the same guard.
  const share = JSON.parse((await get(`${url}api/share`)).body);
  assert.deepEqual([share.lan, share.port, share.local], [true, port, url]);
  assert.equal(share.url, addr ? printed : null);
  assert.equal((await get(`${url}api/share`, { Host: 'evil.example:80' })).status, 403);
  if (addr && addr[1] !== '127.0.0.1') {
    assert.deepEqual([addr[2], addr[3]], [String(port), key]);
    const lan = `http://${addr[1]}:${port}/`;
    assert.equal((await get(`${lan}api/state`)).status, 403);
    assert.equal((await get(`${lan}api/state?key=${key}`)).status, 200);
    assert.equal((await get(`${lan}api/state`, { Cookie: jar })).status, 200);
  } else {
    assert.equal(printed, url);
  }
  const inside = await get(`${url}files?p=${encodeURIComponent(path.join(crew, 'tasks', 'autosave', 'index.md'))}`);
  assert.equal(inside.status, 200);
  const outside = await get(`${url}files?p=${encodeURIComponent(path.join(root, 'secret.txt'))}`);
  assert.equal(outside.status, 403);
  const dotdot = await get(`${url}files?p=${encodeURIComponent(`${crew}/../secret.txt`)}`);
  assert.notEqual(dotdot.status, 200);
});
