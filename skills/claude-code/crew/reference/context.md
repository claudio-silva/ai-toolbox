# The lead's context: economics, hygiene, handoff

## Why it matters

The API is stateless, so every turn re-sends the whole conversation. With prompt caching, the cached prefix is billed at the cache-read price, and new content at the cache-write price. The lead's cost per turn therefore grows **linearly with its context size**, and a session's total cost grows roughly **with the square of its length**.

Order of magnitude for Opus 5.5 (cache read $0.20/MTok, cache write about $5/MTok for the 5-minute TTL and more for 1 h; check current prices):

| Lead context | Cost per turn (cache reads only) | 300-turn session |
|---|---|---|
| 150K | ~$0.03 | ~$9 |
| 400K | ~$0.08 | ~$24 |
| 800K | ~$0.16 | ~$48 |

There is also a hidden spike. If the cache expires (an idle gap longer than the TTL), the next turn re-writes the **entire** context at write price: about $4–6 at 800K, every time. Large context combined with long waits is the expensive pattern.

A 1M window is therefore a safety margin, not a target. Long memory belongs in **files**, not in the conversation.

## Hygiene rules

1. **Delegate reading.** Use scouts for exploration, the planner for planning, and the reviewer for diffs. You consume conclusions.
2. **Never paste a file, diff or log you would only skim.** Use `tail -n 30`, `grep -c`, `head`, `--stat`, `wc -l`, or a scout summary. Redirect any output you would only skim to a file and read only what you need.
3. **Cap reports.** Briefs set a word limit; bulk detail goes to files.
4. **Don't re-read** what you already know. Record facts in state files once.
5. **Screenshots are cheap and high-value** (about 1–2K tokens each), but use them at checkpoints, not on every step.
6. **Don't poll.** Background agents notify you on completion. If you must wait for a background agent, keep the context lean before it.

## Where state lives (so you can forget safely)

| What | Where |
|---|---|
| Status, milestones, decisions log, owner actions | the project's roadmap/state file (e.g. `docs/ROADMAP.md`) |
| What and why for current work | the active plan |
| Task status, findings, memory | the tracker, if an external framework uses one |
| Crew rules and project facts for agents | `docs/CREW.md` |
| Durable role know-how | `.claude/agent-memory/<agent>/MEMORY.md` (`memory: project`) |
| Cross-project facts about the user | the harness's user memory |
| Founder requests and questions | `.crew/queue.md` (committed) |
| Plans | `.crew/plans/<slug>.md` (committed), unless `CREW.md` names another location |
| Task statuses, specs and Facts for a task set | `.crew/tasks/<slug>/index.md` and `NN-<slug>.md` (committed) |
| Where the last session stopped | `.crew/handoff.md` (committed with the next task) |
| Evidence per task: screenshots, reports over the cap, logs | `.crew/task-data/<id>/` (gitignored, never deleted by crew) |
| Development history and the founder's dashboard | `.crew/journal.md`, `.crew/status.md` (gitignored; for the founder; never read by the lead) |
| Scratch: lock, hook state | `.crew/tmp/` (gitignored) |

Rule: if losing your context right now would lose a decision, write it down now.

## Handoff

The founder rolls the session over with `/crew handoff`, then `/clear`, then `/crew resume` (`commands/handoff.md`, `commands/resume.md`).
