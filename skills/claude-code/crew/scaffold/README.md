# .crew/

State for the `crew` skill: how the main Claude Code session (the **lead**) runs this project with a crew of subagents. The project's rules for the crew live in `docs/CREW.md` (or the path named in `CLAUDE.md` / `AGENTS.md`).

## What is here

| Path | What it is | Git |
|---|---|---|
| `README.md` | This file | committed |
| `bin/crew` | The crew script: writes the journal, renders the dashboard, tracks running agents, registers crew sessions for the hooks, prepares and tears down worktrees | committed |
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
| `tmp/` | Scratch: the lock, hook state, `worktree.json` | ignored |

## The journal

`journal.md` is a history for you, not an input for the crew. One `## YYYY-MM-DD` heading per day, one line per event:

```
- 14:03 · → builder (sonnet · high) · T03 autosave conflict banner
- 14:41 · ← builder · DONE · T03 autosave conflict banner
```

Actors: `lead` (the main session), `→ <type>` and `← <type>` (a subagent started and finished, logged by hooks), `↺ <name>` (a subagent resumed), `<type> →` (a subagent started another), and `system` (lines written by the hooks themselves, such as "Context compacted"). A ` [<branch>]` suffix on the actor means the line came from a linked worktree.

## The dashboard

`status.md` is rendered by `bin/crew` from the task-set indexes, `queue.md`, `handoff.md`, the hook state, the journal and git. Nobody edits it; it is rewritten on every crew event. Open it in any Markdown preview that renders Mermaid (Paseo, GitHub, VS Code, Cursor, Obsidian). Render it by hand with `.crew/bin/crew status`.

Lead state, in the italic line under the title:
- `▶ working since HH:MM`: the lead is working on your last message.
- `▶ agents working, lead idle`: subagents are running; the lead waits for them.
- `⏸ waiting for you since HH:MM`: nothing is running; the crew needs you.

Task glyphs: ☐ pending · ◔ in progress · ◑ in review · ↻ rework · ☑ accepted · ⊘ blocked.

## Task data

`task-data/<id>/` holds what agents produce that you or a later agent may want to see. `<id>` is `T<NN>-<slug>` for a task, `qa-<YYYY-MM-DD>-<mode>` for a QA run, `scout-<topic>` or `advisor-<topic>` otherwise. Crew never deletes it. When a builder works in a worktree, its task data is copied here when the worktree is torn down.

## Worktrees

Parallel builders run in git worktrees under `.claude/worktrees/`. `bin/crew worktree setup` prepares one (copies the files listed in `.worktreeinclude`, then runs `worktree/setup.sh`); `bin/crew worktree teardown <path>` copies its task data and journal lines back here, runs `worktree/teardown.sh`, and removes the worktree and its branch. Only the builder's commit and its task data survive a worktree.

## Maintenance

`/crew setup` (from the crew skill) maintains `bin/`, `templates/` and the header of the `worktree/` scripts, merging and never overwriting. Edit the marked project section of `worktree/setup.sh` and `worktree/teardown.sh` freely; setup keeps your edits.
