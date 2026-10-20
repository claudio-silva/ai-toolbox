# .crew/

State for the `crew` skill: how the main Claude Code session (the **lead**) runs this project with a crew of subagents. The project's rules for the crew live in `docs/CREW.md` (or the path named in `CLAUDE.md` / `AGENTS.md`).

## What is here

| Path | What it is | Git |
|---|---|---|
| `README.md` | This file | committed |
| `bin/crew` | The crew script: writes the journal, renders the dashboard, tracks running agents and compactions, keeps the request queue, registers crew sessions for the hooks, prepares and tears down worktrees | committed |
| `templates/task.md`, `templates/index.md` | Templates for task specs and task-set indexes | committed |
| `worktree/setup.sh` | The project's development setup for a fresh checkout (install dependencies, create local files, build). Idempotent | committed |
| `worktree/teardown.sh` | The project's cleanup for a checkout about to be removed. A no-op by default | committed |
| `queue.md` | Founder requests and founder questions, with their status | committed |
| `handoff.md` | Where the last session stopped, written by `/crew handoff` | committed (with the next task) |
| `plans/<slug>.md` | Plans written by the lead with the founder | committed |
| `tasks/<slug>/index.md`, `NN-<slug>.md` | One task set: its index (statuses, Facts) and one spec per task | committed |
| `journal.md` | Informational history of crew activity, newest at the bottom | ignored |
| `status.md` | The status dashboard | ignored |
| `task-data/<id>/` | Evidence per task: `screenshots/`, `reports/`, `logs/` | ignored |
| `tmp/` | Scratch: the lock, hook state, the compaction log (`tmp/journal-state/compactions.tsv`), `worktree.json` | ignored |

## The journal

`journal.md` is a history for you, not an input for the crew. One `## YYYY-MM-DD` heading per day, one line per event:

```
- 14:03 · → builder (sonnet · high) · T03 autosave conflict banner
- 14:30 · system · Context compacted · s2a-t03-builder (builder · sonnet · high) · 167k → 10k · 41 s · auto · ≈$0.11
- 14:41 · ← builder · DONE · T03 autosave conflict banner
- 14:42 · lead · Queued R2: Autosave every 10 s, not only on blur, slot: after T03
```

Actors: `lead` (the main session), `→ <type>` and `← <type>` (a subagent started and finished, logged by hooks), `↺ <name>` (a subagent resumed), `<type> →` (a subagent started another), and `system` (lines written by the hooks themselves). A ` [<branch>]` suffix on the actor means the line came from a linked worktree.

A compaction line reads: who compacted (`lead (opus · high)`, or the subagent's name, type, model and effort), context before → after, how long the summarization took, the trigger (`auto` or `manual`), and the estimated cost of the summarization request. It is written at the compaction's own time by the next crew event, because Claude Code records the compaction after its hooks have run. Request lines (`Queued`, `Scheduled`, `Done`, `Dropped`) are written by `bin/crew request`.

## The dashboard

`status.md` is rendered by `bin/crew` from the task-set indexes, `queue.md`, `handoff.md`, the hook state, the journal and git. Nobody edits it; it is rewritten on every crew event. Open it in any Markdown preview that renders Mermaid (Paseo, GitHub, VS Code, Cursor, Obsidian). Render it by hand with `.crew/bin/crew status`.

Lead state, in the italic line under the title:
- `▶ working since HH:MM`: the lead is working on your last message.
- `▶ agents working, lead idle`: subagents are running; the lead waits for them.
- `⏸ waiting for you since HH:MM`: nothing is running; the crew needs you.
- `⏹ stopped by you since HH:MM`: you ran `/crew stop`; `/crew resume` continues.

Task glyphs: ☐ pending · ◔ in progress · ◑ in review · ↻ rework · ☑ accepted · ⊘ blocked.

### Compactions

The "Now" block counts compactions (lead and subagents); the "Compactions" section lists the last 12 and a summary per role: how many, the context size at which they happened, and how often (lead: time between its compactions; subagents: time from start to compaction). Each row carries three estimates at Anthropic list prices (the date is in the legend; the price table is at the top of the compaction block in `bin/crew`), assuming a warm prompt cache:

- **Est. overhead** = context before × cache-read price + context after × output price: the summarization request itself.
- **Est. saved** = turns since × (before − after) × cache-read price: what the API requests made after the compaction would have paid to keep carrying the dropped context. It grows while the agent keeps working.
- **Net** = saved − overhead.

Not measured: the files an agent re-reads after a compaction, and the detail the summary lost. A row that stays at a small "turns since" (the agent finished soon after) was a compaction that bought nothing; a role whose rows show net ≤ 0 compacts too early for the work it does. Windows are set per model with `/autocompact <size>` (Claude Code v2.1.288 or later), for one agent with `autoCompactWindow` in its definition's frontmatter (v2.1.296 or later), or with `autoCompactWindow` in a settings file. Subagents keep a 5-minute prompt cache (the main session 1 hour), so a subagent compaction after a long idle gap costs more than the estimate.

### Requests

`bin/crew request "<text>" [--affects <x>] [--slot <y>] [--urgent]` adds the next `R<n>` entry to `queue.md`; `bin/crew request R<n> --status scheduled|done|dropped` moves it along. Both journal and re-render. While work is in flight, a hook reminds the lead under each of your messages to queue requests before acting on them, and the file-changed hook flags a task row added to an index without a `Requests:` line in its spec.

## Task data

`task-data/<id>/` holds what agents produce that you or a later agent may want to see. `<id>` is `T<NN>-<slug>` for a task, `qa-<YYYY-MM-DD>-<mode>` for a QA run, `scout-<topic>` or `advisor-<topic>` otherwise. Crew never deletes it. When a builder works in a worktree, its task data is copied here when the worktree is torn down.

## Worktrees

Parallel builders run in git worktrees under `.claude/worktrees/`. `bin/crew worktree setup` prepares one (copies the files listed in `.worktreeinclude`, then runs `worktree/setup.sh`); `bin/crew worktree teardown <path>` copies its task data and journal lines back here, runs `worktree/teardown.sh`, and removes the worktree and its branch. Only the builder's commit and its task data survive a worktree.

## Maintenance

`/crew setup` (from the crew skill) maintains `bin/`, `templates/` and the header of the `worktree/` scripts, merging and never overwriting. Edit the marked project section of `worktree/setup.sh` and `worktree/teardown.sh` freely; setup keeps your edits.
