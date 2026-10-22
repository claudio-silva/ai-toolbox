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
| `queue.md` | The backlog of founder requests and questions: what no open task set takes (each set keeps its own, below) | committed |
| `defects.md` | The backlog of deferred defects: what an open task set does not fix | committed |
| `handoff.md` | Where the last session stopped, when no task set was open (a set's handoff is in its folder) | committed (with the next task) |
| `tasks/<slug>/` | A task set: `index.md`, the specs, and its own `queue.md`, `defects.md` and `handoff.md` | committed |
| `plans/<slug>.md` | Plans written by the lead with the founder | committed |
| `tasks/<slug>/index.md`, `NN-<slug>.md` | One task set: its index (statuses, Facts) and one spec per task | committed |
| `journal.md` | Informational history of crew activity, newest at the bottom | ignored |
| `dashboard/` | The dashboard: its server (`server.mjs`), the model that reads the crew files (`model.mjs`) and the page (`app/`). Installed and replaced by `/crew setup` | ignored |
| `task-data/<id>/` | Evidence per task: `screenshots/`, `reports/`, `logs/` | ignored |
| `tmp/` | Scratch: the lock, hook state, the compaction log (`tmp/journal-state/compactions.tsv`), agent runs (`runs.tsv`) and sleeps (`sleep.tsv`) for the Timing tab, `worktree.json`, the dashboard's port (`dashboard.json`) and log (`dashboard.log`), each session's way in for the dashboard's messages (`tmp/journal-state/reach/`, readable by you only), and the files you attach to them (`tmp/attachments/`) | ignored |

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

A local web page that shows what the crew is doing, for a browser tab or a Paseo side panel. `dashboard/server.mjs` (Node.js 20 or later, no dependencies) serves it at a port derived from the project's path so the URL stays the same across restarts. The session-start hook starts it in the background, and it runs until you stop it or the computer restarts. One server serves each project, whoever started it: another session, you, or a Paseo panel.

It listens on every network interface, so a phone or a tablet on the same Wi-Fi (or the same Tailscale network) can open it too. The URL it prints uses this computer's local network address and carries the project's key (`http://192.168.1.20:47242/?key=…`). Other devices need that key: the page saves it in a cookie, so later visits work without it. On this computer, `http://127.0.0.1:<port>/` and `http://localhost:<port>/` need no key; neither does an SSH tunnel to a remote machine (`ssh -N -L 47242:127.0.0.1:47242 server`, any local port). A request through a proxy or a tunnel agent (cloudflared, ngrok, Tailscale Serve, Paseo's service proxy) needs the key even though it comes from this computer: its forwarding headers give it away. The header's QR code button shows that URL as a code to scan, worked out when opened, so it follows the network. The key lives in `tmp/dashboard.key`; delete it and run `bin/crew dashboard restart` to replace it. The URL never shows a public address: on a server without a private one it shows `127.0.0.1`, for a tunnel.

- `bin/crew session start` ends with `Dashboard: [<url>](<url>)`, and the lead ends its reply with that link.
- `bin/crew status` prints its URL (and starts it if needed).
- `bin/crew dashboard start|stop|restart|url` manages it; `start` prints nothing and exits 3 when one is already running for the project.
- `CREW_DASHBOARD=0` in the environment keeps it from starting; `CREW_DASHBOARD_LAN=0` keeps it on this computer only (`127.0.0.1`, no key).
- `node dashboard/server.mjs state` prints the state the page shows, as JSON.
- Once a day it reads Crew's published release notes (nothing is sent but the request) and compares them with `dashboard/RELEASES.md`, the notes of this copy; when a newer Crew is out, the header shows an **Update** button with what's new and how to update. The result is kept in `tmp/update.json`. `CREW_UPDATE_CHECK=0` turns the daily check off. `bin/crew dashboard updates` prints what it found (`--check` checks now); `--simulate` makes the latest release count as new, to see the notice, and `--reset` ends that.

- **Messages to the lead.** The Agents tab writes to the lead, and each lead's Stop, Resume and Setup buttons (in the Overview and the Agents tab) send `/crew stop`, `/crew resume` and `/crew setup` to that lead the same way. At each session start and each of your messages, `bin/crew` records how the session can be reached in `tmp/journal-state/reach/<session>`: Claude Code's messaging socket and token, and, when Paseo's daemon runs this Claude Code, Paseo's agent id. The server then sends with `paseo send` (the message arrives as if you typed it in Paseo), or else over the socket: the token, then the message, opening with *From the founder, via the Crew dashboard*, which the rule in `CLAUDE.md` tells the lead to treat as yours. A session that skips permission prompts holds messages from other sessions unless they say they run in the same permission mode; the server wraps each message in Claude Code's own envelope, with the mode the lead's transcript records. Attached files are kept in `tmp/attachments/` and named in the message by their full path. Only the page can send: each request needs the `X-Crew` header, which another site's page can't send, and the usual key or local-address check.

The server reads the task-set indexes and specs, `queue.md`, `defects.md`, `handoff.md`, the journal, the hook state under `tmp/` and git, and watches them. When one changes, it pushes the new state to every open page over server-sent events; the page updates in place, keeping its scroll position, tab and open panels. Nothing polls: while agents run or the set is open, the server recomputes once a minute, and nothing else happens while the crew is quiet. In between, the page's running durations tick every second on their own (`02:53:22`, colons blinking) and freeze when the run ends (`1h 19m`). Only work ticks: agent time, and the lead's while it works; idle time, sleep and the elapsed time never do. Each new journal line shows as a notice at the top of the page for 10 seconds; notices stack, and a click opens the Journal. If the server goes away, the page says so and reconnects when it comes back. The page changes no crew file: what you want done goes to the lead as a message (below), and the lead does it.

Each lead's state shows in the Overview (with its Stop or Resume and Setup buttons) and in the Agents tab. When a lead has nothing running and waits for your answer, a toast at the top of the page says so and stays until you close it; a click on the toast opens that lead's conversation, and having that conversation open closes it too. A closed toast comes back only when that lead waits again. A lead is in one of these states:
- **Working**: the lead is working on your last message, with a live duration.
- **Idle, agents working**: subagents are running; the lead waits for them.
- **Waiting for you**: nothing is running; the crew needs you.
- **Stopped by you**: you ran `/crew stop`; `/crew resume` continues.
- **Claude Code closed**: that lead's Claude Code process is gone (each session's is recorded in `tmp/journal-state/claude/`, with its start time, so a reused process id doesn't count). The subagents it ran ended with it: their runs show as interrupted, ending at their transcript's last write, and `crew session start` records them so. Nothing ticks, the set's elapsed time included; when Claude Code comes back, the time it was closed counts as idle.

**Several leads.** Each checkout has at most one lead, and the lead works on the task set open there. A second `/crew` in a checkout that already has a lead is refused: `crew session start` exits 4, names the other session, and offers a take-over (`--take-over`, refused while the other one runs subagents) or a separate worktree for another set. The session taken over is told so at your next message to it. After `/clear`, the same Claude Code process takes the lead again without a conflict. Leads in separate worktrees work side by side: each one's state is in `tmp/journal-state/leads/<session>`, its keep-awake in `awake/<session>`, and its checkout in `sessions/<session>`. With two or more open sets, a set switcher in the header, above the tabs, picks the set every tab shows: its tasks and timing, its lead and agents, its requests and defects with the backlog's, its compactions and its journal lines (each line goes to the set open in the checkout that wrote it). The Sets tab still lists every set. `bin/crew where` prints the checkout, its task set and files, and the other leads.

Only a working lead carries a live duration. Each panel's **?** and each "What these mean" row open an explanation of what the panel shows. When the window is too narrow for every tab, the tabs that fit stay in the bar (the current one always) and the rest go into a **N more** menu, with their counts; a dot on it means one of them needs you.

The header's icon is the project's own when the repository has a square one (a favicon, an app icon or a logo; the server picks the best by name, size and depth). If it picked a wrong one, click it: it switches to crew's mark, and the page remembers that for this project until you click again.

Task statuses: pending, in progress, in review, rework, accepted, blocked. A task, or its bar on the Timing tab's chart, opens a panel with its spec, its agents and runs, its time by phase and its newest screenshots; a set or the last handoff opens as a document.

The Overview tab also shows **keep awake**: on while Claude Code runs, once `crew session start` has started `caffeinate` (macOS), tied to the Claude Code process so it ends with it, one per lead; off after `/crew stop` and once Claude Code has closed, and the card says which. On battery, closing the lid still sleeps the computer, and the page warns about it. Set `CREW_KEEP_AWAKE=0` in the environment to turn keep-awake off.

### Defects

Reviews and QA classify each finding as leaf or load-bearing. The lead fixes load-bearing and high-severity findings in the task, and may defer a leaf (low or medium severity, nothing pending builds on it, fails safely) to the set's `defects.md` instead of another review round. Briefs list the known defects on a task's surfaces so agents neither fix nor chase them; a deferred defect that blocks or breaks other work is promoted and fixed at once, and the set's deferred defects are fixed before its final review. The Defects tab shows the counts (including how many deferrals were promoted, the measure of whether deferral is paying off), the open entries and the closed ones, with when the open ones are due (the end of the set, and how many tasks it has to go) and a legend for every label.

`bin/crew defect "<symptom>" --where "<surface>" [--from "T04 review"] [--severity low|medium] [--slot "<when>"]` adds the next `D<n>`; `bin/crew defect D<n> --status scheduled|fixed|dropped|deferred [--note "<why>"]` moves it along, and `--promote` marks a deferral that bit. The note stays at the end of the entry (`note: as T13`); one that names a task of the set links to it on the page.

### Timing

Where the current set's time went, from the agent runs the hooks record. The Timing tab splits the elapsed time since the set started (its index's first commit) into four parts: **agents at work** (any subagent running), **lead alone** (the lead working, from your message to the end of its reply, with no subagent running; recorded in `tmp/journal-state/lead.tsv`), **idle** (awake with nothing running: waiting for you, stopped, or Claude Code closed) and **asleep**. **Crew at work** is the first two together. Once every task is accepted the elapsed time stops at the last agent run; while Claude Code is closed it stops at its last sign of life. Task time splits into build (a builder's first run), review and rework (a builder resumed, or a debugger), with the CHANGES verdicts that caused the rework. The critical path follows the tasks' `Depends on` lines weighted by agent time; **parallel headroom** (task time minus the critical path) is the most that running independent tasks side by side could have saved. A Gantt chart shows every agent run on one time axis (drag to pan, ctrl + wheel or pinch to zoom), with the sleeps shaded. The same split is given per task; agents not tied to a task (QA, scouts, the planner) sit in a set-level row.

Sleep is measured on macOS: every crew event compares the wall clock with the awake-time clock (`sysctl kern.monotonicclock_usecs`), and a gap of 2 minutes or more is logged and left out of agent time.

### Compactions

The Overview tab counts compactions (lead and subagents); the Compactions tab charts context before and after each one, lists the last 40, and sums them up per role: how many, the context size at which they happened, and how often (lead: time between its compactions; subagents: time from start to compaction). Each row carries three estimates at Anthropic list prices (the price table is at the top of the compaction block in `bin/crew`, with the date it was read), assuming a warm prompt cache:

- **Est. overhead** = context before × cache-read price + context after × output price: the summarization request itself.
- **Est. saved** = turns since × (before − after) × cache-read price: what the API requests made after the compaction would have paid to keep carrying the dropped context. It grows while the agent keeps working.
- **Net** = saved − overhead.

Not measured: the files an agent re-reads after a compaction, and the detail the summary lost. A row that stays at a small "turns since" (the agent finished soon after) was a compaction that bought nothing; a role whose rows show net ≤ 0 compacts too early for the work it does. Windows are set per model with `modelSettings.<model>.autoCompactWindow` in a settings file (Claude Code v2.1.288 or later), for the lead and every agent on that model; recommended starting points are Haiku 100K, Sonnet 200K, Opus 300K and Fable 400K. Compaction triggers about 33K below the window, so a 200K window compacts at about 167K. `/autocompact <size>` sets only the current model's window, the lead's. `autoCompactWindow` in an agent definition's frontmatter lowers it for that role (v2.1.296 or later). Subagents keep a 5-minute prompt cache (the main session 1 hour), so a subagent compaction after a long idle gap costs more than the estimate.

### Requests

`bin/crew request "<text>" [--affects <x>] [--slot <y>] [--urgent] [--backlog]` adds the next `R<n>` entry to the open task set's `queue.md` (`--backlog`, or no set open: `.crew/queue.md`); `bin/crew request R<n> --status scheduled|done|dropped` moves it along. `R` and `D` numbers are unique across the project, whichever file holds them. At a set's close, `bin/crew carry` moves what is still open in its queue and defect log to the backlog. Both journal; the dashboard picks the change up. While work is in flight, a hook reminds the lead under each of your messages to queue requests before acting on them, and the file-changed hook flags a task row added to an index without a `Requests:` line in its spec.

## Task data

`task-data/<id>/` holds what agents produce that you or a later agent may want to see. `<id>` is `T<NN>-<slug>` for a task, `qa-<YYYY-MM-DD>-<mode>` for a QA run, `scout-<topic>` or `advisor-<topic>` otherwise. Crew never deletes it. When a builder works in a worktree, its task data is copied into the lead's checkout when the worktree is torn down.

## Worktrees

Parallel builders run in git worktrees under `.claude/worktrees/`. `bin/crew worktree setup` prepares one (copies the files listed in `.worktreeinclude`, then runs `worktree/setup.sh`); `bin/crew worktree teardown <path>`, run from the lead's checkout, copies its task data and journal lines back, runs `worktree/teardown.sh`, and removes the worktree and its branch. Only the builder's commit and its task data survive a worktree.

## Maintenance

`/crew setup` (from the crew skill) maintains `bin/`, `templates/` and the header of the `worktree/` scripts, merging and never overwriting. Edit the marked project section of `worktree/setup.sh` and `worktree/teardown.sh` freely; setup keeps your edits.
