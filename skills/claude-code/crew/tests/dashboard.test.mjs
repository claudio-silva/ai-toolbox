// Tests for the dashboard: the model's parsers, and the server live (state pushed over SSE when a
// crew file changes, the Host and file guards). The timing, defect, compaction and lead-state
// numbers are checked end to end by tests/hooks.sh.
// Run from the skill directory: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
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

// ---- the server ----

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
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

test('server: pushes the new state when a crew file changes; guards Host and files', async (t) => {
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

  const es = events(`${url}api/events`);
  t.after(() => es.close());
  await es.ready;
  assert.ok(JSON.parse(await es.next('hello')).build);
  const first = JSON.parse(await es.next('state'));
  assert.equal(first.current.accepted, 1);

  fs.writeFileSync(path.join(crew, 'tasks', 'autosave', 'index.md'), INDEX.replace('| T07 | in progress |', '| T07 | accepted |'));
  const second = JSON.parse(await es.next('state'));
  assert.equal(second.current.accepted, 2);

  assert.equal((await get(`${url}api/state`, { Host: 'evil.example:80' })).status, 403);
  const inside = await get(`${url}files?p=${encodeURIComponent(path.join(crew, 'tasks', 'autosave', 'index.md'))}`);
  assert.equal(inside.status, 200);
  const outside = await get(`${url}files?p=${encodeURIComponent(path.join(root, 'secret.txt'))}`);
  assert.equal(outside.status, 403);
  const dotdot = await get(`${url}files?p=${encodeURIComponent(`${crew}/../secret.txt`)}`);
  assert.notEqual(dotdot.status, 200);
});
