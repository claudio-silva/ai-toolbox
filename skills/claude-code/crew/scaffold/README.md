# .crew/

State for the `crew` skill: how the main Claude Code session (the **lead**) runs this project with a crew of subagents. The project's rules for the crew live in `docs/CREW.md` (or the path named in `CLAUDE.md` / `AGENTS.md`).

## What is here

| Path | What it is | Git |
|---|---|---|
| `README.md` | This file | committed |
| `bin/crew` | The crew script: writes the journal, tracks running agents, compactions, agent time and sleep, keeps the request queue and the defect log, registers crew sessions for the hooks, keeps the computer awake while the crew works, starts the dashboard, prepares and tears down worktrees | committed |
| `templates/task.md`, `templates/index.md` | Templates for task specs and task-set indexes | committed |
| `worktree/setup.sh` | The project's development setup for a fresh checkout (install dependencies, create local files, build). Idempotent | committed |
| `worktree/teardown.sh` | The project's cleanup for a checkout about to be removed. A no-op by default | committed |
| `queue.md` | Founder requests and founder questions, with their status | committed |
| `defects.md` | Defects found by reviews and QA and deferred by the lead, with their status | committed |
| `handoff.md` | Where the last session stopped, written by `/crew handoff` | committed (with the next task) |
| `plans/<slug>.md` | Plans written by the lead with the founder | committed |
| `tasks/<slug>/index.md`, `NN-<slug>.md` | One task set: its index (statuses, Facts) and one spec per task | committed |
| `journal.md` | Informational history of crew activity, newest at the bottom | ignored |
| `dashboard/` | The dashboard: its server (`server.mjs`), the model that reads the crew files (`model.mjs`) and the page (`app/`). Installed and replaced by `/crew setup` | ignored |
| `task-data/<id>/` | Evidence per task: `screenshots/`, `reports/`, `logs/` | ignored |
| `tmp/` | Scratch: the lock, hook state, the compaction log (`tmp/journal-state/compactions.tsv`), agent runs (`runs.tsv`) and sleeps (`sleep.tsv`) for the Timing tab, `worktree.json`, the dashboard's port (`dashboard.json`) and log (`dashboard.log`) | ignored |

## The journal

`journal.md` is a history for you, not an input for the crew. One `## YYYY-MM-DD` heading per day, one line per event:

```
- 14:03 · → builder (sonnet · high) · T03 autosave conflict banner
- 14:30 · system · Context compacted · s2a-t03-builder (builder · sonnet · high) · 167k → 10k · 41 s · auto · ≈$0.11
- 14:41 · ← builder · DONE · T03 autosave conflict banner
- 14:42 · lead · Queued R2: Autosave every 10 s, not only on blur, slot: after T03
- 14:50 · lead · Deferred D3 (low): Tooltip clipped at the right edge, where: toolbar
- 10:34 · system · The computer slept 3 h 26 min between 07:08 and 10:34 (crew events stop while it sleeps)
```

Actors: `lead` (the main session), `→ <type>` and `← <type>` (a subagent started and finished, logged by hooks), `↺ <name>` (a subagent resumed), `<type> →` (a subagent started another), and `system` (lines written by the hooks themselves). A ` [<branch>]` suffix on the actor means the line came from a linked worktree.

A compaction line reads: who compacted (`lead (opus · high)`, or the subagent's name, type, model and effort), context before → after, how long the summarization took, the trigger (`auto` or `manual`), and the estimated cost of the summarization request. It is written at the compaction's own time by the next crew event, because Claude Code records the compaction after its hooks have run. Request lines (`Queued`, `Scheduled`, `Done`, `Dropped`) are written by `bin/crew request`; defect lines (`Deferred`, `Promoted`, `Scheduled`, `Fixed`, `Dropped`) by `bin/crew defect`. A sleep line is written by the first crew event after the computer wakes.

## The dashboard

A local web page that shows what the crew is doing, for a browser tab or a Paseo side panel. `dashboard/server.mjs` (Node.js 20 or later, no dependencies) serves it on `127.0.0.1`, at a port derived from the project's path so the URL stays the same across restarts. The session-start hook starts it in the background, and it runs until you stop it or the computer restarts. One server serves each project, whoever started it: another session, you, or a Paseo panel.

- `bin/crew session start` prints `Open the dashboard at <url>` when this session started it, and nothing when it was already running.
- `bin/crew status` prints its URL (and starts it if needed).
- `bin/crew dashboard start|stop|restart|url` manages it; `start` prints nothing and exits 3 when one is already running for the project.
- `CREW_DASHBOARD=0` in the environment keeps it from starting.
- `node dashboard/server.mjs state` prints the state the page shows, as JSON.

The server reads the task-set indexes and specs, `queue.md`, `defects.md`, `handoff.md`, the journal, the hook state under `tmp/` and git, and watches them. When one changes, it pushes the new state to every open page over server-sent events; the page updates in place, keeping its scroll position, tab and open panels. Nothing polls: while agents run or the set is open, the server recomputes once a minute, and nothing else happens while the crew is quiet. In between, the page's running durations tick every second on their own (`02:53:22`, colons blinking) and freeze when the run ends (`1h 19m`); sleep and closed intervals never tick. Each new journal line shows as a notice at the top of the page for 10 seconds; notices stack, and a click opens the Journal. If the server goes away, the page says so and reconnects when it comes back. Nobody edits anything here: the page only reads.

The lead's state sits in the header:
- **Lead working · since HH:MM**: the lead is working on your last message.
- **N agents working · lead idle**: subagents are running; the lead waits for them.
- **Waiting for you · since HH:MM**: nothing is running; the crew needs you.
- **Stopped by you · since HH:MM**: you ran `/crew stop`; `/crew resume` continues.

The header's icon is the project's own when the repository has a square one (a favicon, an app icon or a logo; the server picks the best by name, size and depth). If it picked a wrong one, click it: it switches to crew's mark, and the page remembers that for this project until you click again.

Task statuses: pending, in progress, in review, rework, accepted, blocked. A task, or its bar on the Timing tab's chart, opens a panel with its spec, its agents and runs, its time by phase and its newest screenshots; a set or the last handoff opens as a document.

The Overview tab also shows **keep awake**: on while Claude Code runs, once `crew session start` has started `caffeinate` (macOS), tied to the Claude Code process so it ends with it; off after `/crew stop`. On battery, closing the lid still sleeps the computer, and the page warns about it. Set `CREW_KEEP_AWAKE=0` in the environment to turn keep-awake off.

### Defects

Reviews and QA classify each finding as leaf or load-bearing. The lead fixes load-bearing and high-severity findings in the task, and may defer a leaf (low or medium severity, nothing pending builds on it, fails safely) to `defects.md` instead of another review round. Briefs list the known defects on a task's surfaces so agents neither fix nor chase them; a deferred defect that blocks or breaks other work is promoted and fixed at once, and the set's deferred defects are fixed before its final review. The Defects tab shows the counts (including how many deferrals were promoted, the measure of whether deferral is paying off), the open entries and the closed ones.

`bin/crew defect "<symptom>" --where "<surface>" [--from "T04 review"] [--severity low|medium] [--slot "<when>"]` adds the next `D<n>`; `bin/crew defect D<n> --status scheduled|fixed|dropped|deferred [--note "<why>"]` moves it along, and `--promote` marks a deferral that bit.

### Timing

Where the current set's time went, from the agent runs the hooks record. The Timing tab splits the time since the set started (its index's first commit) into sleep, agents at work (the union of all agent runs) and the rest (the lead, and waiting for you); once every task is accepted it stops at the last agent run. Task time splits into build (a builder's first run), review and rework (a builder resumed, or a debugger), with the CHANGES verdicts that caused the rework. The critical path follows the tasks' `Depends on` lines weighted by agent time; **parallel headroom** (task time minus the critical path) is the most that running independent tasks side by side could have saved. A Gantt chart shows every agent run on one time axis (drag to pan, ctrl + wheel or pinch to zoom), with the sleeps shaded. The same split is given per task; agents not tied to a task (QA, scouts, the planner) sit in a set-level row.

Sleep is measured on macOS: every crew event compares the wall clock with the awake-time clock (`sysctl kern.monotonicclock_usecs`), and a gap of 2 minutes or more is logged and left out of agent time.

### Compactions

The Overview tab counts compactions (lead and subagents); the Compactions tab charts context before and after each one, lists the last 40, and sums them up per role: how many, the context size at which they happened, and how often (lead: time between its compactions; subagents: time from start to compaction). Each row carries three estimates at Anthropic list prices (the price table is at the top of the compaction block in `bin/crew`, with the date it was read), assuming a warm prompt cache:

- **Est. overhead** = context before × cache-read price + context after × output price: the summarization request itself.
- **Est. saved** = turns since × (before − after) × cache-read price: what the API requests made after the compaction would have paid to keep carrying the dropped context. It grows while the agent keeps working.
- **Net** = saved − overhead.

Not measured: the files an agent re-reads after a compaction, and the detail the summary lost. A row that stays at a small "turns since" (the agent finished soon after) was a compaction that bought nothing; a role whose rows show net ≤ 0 compacts too early for the work it does. Windows are set per model with `/autocompact <size>` (Claude Code v2.1.288 or later), for one agent with `autoCompactWindow` in its definition's frontmatter (v2.1.296 or later), or with `autoCompactWindow` in a settings file. Subagents keep a 5-minute prompt cache (the main session 1 hour), so a subagent compaction after a long idle gap costs more than the estimate.

### Requests

`bin/crew request "<text>" [--affects <x>] [--slot <y>] [--urgent]` adds the next `R<n>` entry to `queue.md`; `bin/crew request R<n> --status scheduled|done|dropped` moves it along. Both journal; the dashboard picks the change up. While work is in flight, a hook reminds the lead under each of your messages to queue requests before acting on them, and the file-changed hook flags a task row added to an index without a `Requests:` line in its spec.

## Task data

`task-data/<id>/` holds what agents produce that you or a later agent may want to see. `<id>` is `T<NN>-<slug>` for a task, `qa-<YYYY-MM-DD>-<mode>` for a QA run, `scout-<topic>` or `advisor-<topic>` otherwise. Crew never deletes it. When a builder works in a worktree, its task data is copied here when the worktree is torn down.

## Worktrees

Parallel builders run in git worktrees under `.claude/worktrees/`. `bin/crew worktree setup` prepares one (copies the files listed in `.worktreeinclude`, then runs `worktree/setup.sh`); `bin/crew worktree teardown <path>` copies its task data and journal lines back here, runs `worktree/teardown.sh`, and removes the worktree and its branch. Only the builder's commit and its task data survive a worktree.

## Maintenance

`/crew setup` (from the crew skill) maintains `bin/`, `templates/` and the header of the `worktree/` scripts, merging and never overwriting. Edit the marked project section of `worktree/setup.sh` and `worktree/teardown.sh` freely; setup keeps your edits.
