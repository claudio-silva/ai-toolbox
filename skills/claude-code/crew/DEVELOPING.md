# Developing Crew

For people working on the skill itself. To use Crew, see the [README](README.md).

## Editing this skill

- **`SKILL.md` carries every rule the lead must apply unprompted:** on every turn, at every step of the work loop, or on an event it would otherwise miss (a founder message, a returned report, a compaction). Claude Code re-attaches an invoked skill's body after a compaction, so these rules survive whether or not a hook fires or a reminder to re-read is followed. Never move such a rule out of `SKILL.md` to make it shorter.
- **Everything else loads at its trigger (progressive disclosure):** procedures, templates, checklists, rationale, examples and edge cases go in `reference/` or `commands/`, each with a Read-when row saying when to read it. `SKILL.md` keeps the rule and points to the detail; it never copies the detail in.
- **5,000 tokens is an absolute limit for the body of `SKILL.md`.** Claude Code keeps only the first 5,000 tokens of a skill when it re-attaches it after a compaction, so anything past that is lost exactly when it matters. `tests/skill-size.sh` checks it with a conservative estimate (characters ÷ 3.5). Within the limit, judge each line by when the lead needs it, not by how short the file could be.
- **Sections in order of importance, in a logical sequence:** session start, the work loop, founder requests, routing, briefs, quality, then the Read-when table, and last the reference sections (roles, lifecycle, context, journal). A new rule goes where its importance puts it, not at the end.

## Build and test

```sh
tests/skill-size.sh           # SKILL.md's body within 5,000 tokens
tests/hooks.sh                # the crew script and the dashboard model, on fixtures
node --test tests/            # the dashboard parsers and the live server

cd dashboard
npm install
npm run dev                   # the page with hot reload, against a running dashboard
npm run build                 # typecheck, then write scaffold/dashboard/app/
```

Commit the built `scaffold/dashboard/app/` with the source change: it is what projects install. `tests/` and `dashboard/` are not installed (`aitools.json`).

## What's inside

- **Roles** — lead, planner, scout, worker, builder, debugger, reviewer, QA and advisor, each with a default model and effort and a lifecycle (throwaway, resumed with at most 5 follow-ups, durable)
- **Routing** — who does what, with numeric triggers, and the debugging escalation ladder when a fix attempt fails
- **The crew standard method** — a plan that answers 8 questions, decomposed by the planner into a task set: an index plus one spec per task, each acceptance criterion with one method and a `Detects:` clause; flags (`judgement`, `cross-cutting`, `discovery`) that change how a task is briefed and reviewed; evidence-only statuses, demonstrated failures, a final outcome review and a reorient procedure. Any other planning framework can replace it
- **The founder** — three tiers (interrupt now, batch, decide and record), questions batched with defaults taken so work never stalls, and milestone reports
- **The request queue** — every founder message during work is classified, assessed, routed and acknowledged in 3 lines; requests are drained only at task-acceptance boundaries
- **Advisor** — a read-only second opinion from Fable at fixed triggers (vision, roadmap, milestone plans, costly-to-reverse decisions)
- **Briefs and reports** — templates for task dispatch, review, final review, debug escalation, QA, planning and advisor briefs, plus the milestone report
- **Quality** — tests that matter over test counts, QC checkpoints, and a screenshot review rubric
- **Deferred defects** — reviewers and QA mark each finding leaf or load-bearing; a first review is complete and re-reviews check only the fixes; leaf findings go to `.crew/defects.md` instead of another review round, briefs list them so agents don't chase them, one that bites other work is promoted, and the set's defects are fixed before its final review
- **Git and worktree discipline** — a branch per task set, a commit per accepted task, a local merge at set close, and parallel builders in worktrees with a lifecycle that prepares each worktree (`.crew/worktree/setup.sh`) and keeps its task data when it is removed
- **Journal and dashboard** — hooks log every subagent start, resume, finish and compaction to `.crew/journal.md`; the dashboard reads the crew's files and pushes a fresh state to the page whenever one changes
- **Keep awake** — `crew session start` holds a `caffeinate` assertion tied to the Claude Code process (macOS), so an unattended run doesn't stall on idle sleep; sleep that happens anyway is journaled and left out of the timing
- **Compaction strategy** — state in files, a `CLAUDE.md` block and a `SKILL.md` that carries every rule the lead must never lose (it is re-attached after a compaction), `PreCompact` instructions per role, a conditional post-compaction reminder, and a one-line request reminder while work is in flight; subagents never receive the lead's instructions. The lead has no context-size threshold: it rolls over only when the founder runs `/crew handoff`
- **Task data** — screenshots, reports over the cap and logs per task in `.crew/task-data/<id>/`
- **Commands** — `/crew setup` (scaffolds `.crew/`, merges hooks and settings, installs the agents, writes `docs/CREW.md`), `/crew handoff` and `/crew resume` for session rollover, `/crew stop` to stop every subagent safely (and `/crew resume` to continue)

## The dashboard server

A local web page, served by `.crew/dashboard/server.mjs` (Node.js, no dependencies at run time) at a port that stays the same for a project, so it can live in a browser tab or a Paseo side panel. The session-start hook starts it, and the lead opens its first reply with `Open the dashboard at <url>`; when one was already running for the project (started by another session, by the founder, or by a Paseo panel) it says nothing. `.crew/bin/crew status` prints its URL, and `.crew/bin/crew dashboard start|stop|restart|url` manages it (`start` exits 3, silently, when one is already running). The page uses relative URLs only, so it can be served under a sub-path.

It reads the same files the crew writes (the task-set indexes and specs, `queue.md`, `defects.md`, `handoff.md`, the journal, the hook state and git) and pushes a fresh state to the page over server-sent events whenever one of them changes: no polling, and no reload, so the scroll position, the open tab and any open panel stay put. Running durations tick every second in the page and freeze when the run ends; sleep and other closed intervals never tick.

**Access.** It listens on all interfaces unless `CREW_DASHBOARD_LAN=0` (then `127.0.0.1` only). A request needs no key only when it arrives on a loopback socket, with a local Host name, and without proxy headers (`Forwarded`, `X-Forwarded-*`, `X-Real-IP` and the like). Anything else needs the project's key, in `.crew/tmp/dashboard.key`: `?key=` once, then a `crew_key_<port>` cookie. `/api/share` gives the page the network URL with the key, for the QR code.

## The `.crew/` layout in a project

```
docs/CREW.md                 committed (project facts and deviations from the defaults)
.claude/agents/*.md          committed
.claude/settings.json        committed (hooks, permission rule, worktree.baseRef)
.crew/README.md              committed
.crew/bin/crew               committed (the crew script)
.crew/templates/*.md         committed (task spec and index templates)
.crew/worktree/*.sh          committed (the project's worktree setup and teardown)
.crew/queue.md               committed (founder requests and questions)
.crew/defects.md             committed (deferred defects)
.crew/handoff.md             committed (written by /crew handoff)
.crew/plans/<slug>.md        committed
.crew/tasks/<slug>/          committed (index.md and NN-<slug>.md specs)
.crew/journal.md             gitignored (history, for the founder)
.crew/dashboard/             gitignored (the dashboard server and page, installed by /crew setup)
.crew/task-data/<id>/        gitignored (screenshots/, reports/, logs/ per task)
.crew/tmp/                   gitignored (lock, hook state, the dashboard's port, key and log)
.claude/worktrees/           gitignored
```

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The lead's core: commands, session start, the work loop, roles, routing, lifecycle, briefs, quality, context, journal, and the Read-when table |
| `commands/setup.md` | `/crew setup`: prerequisites, scaffold, `.gitignore`, settings and hooks, agents, `CREW.md`, verification |
| `commands/handoff.md` | `/crew handoff`: wait for running work, write `.crew/handoff.md` |
| `commands/resume.md` | `/crew resume`: read the handoff, check HEAD, continue (after a handoff or after `/crew stop`) |
| `commands/stop.md` | `/crew stop`: stop every running subagent safely, record where things are, report |
| `reference/founder.md` | The three tiers, batched questions and default-taking, the question timeout, milestones |
| `reference/requests.md` | Handling founder messages during work: classify, assess, route, acknowledge; the queue; draining |
| `reference/planning.md` | From idea, brainstorm or PRD to a confirmed plan; framework selection; what a crew plan must answer |
| `reference/execution.md` | Running a task set: branches and commits, the serial loop, parallel worktrees, closing, reorient |
| `reference/briefs.md` | Brief and report templates |
| `reference/roles.md` | Role cards, the model facts snapshot behind each choice, and how to refresh it |
| `reference/testing.md` | Testing policy, QC checkpoints, screenshot review rubric |
| `reference/context.md` | The lead's context and cost economics, where state lives, what survives a compaction and how to read the compaction numbers |
| `scaffold/README.md` | Copied to `<project>/.crew/README.md`: what each file is, the journal, the dashboard |
| `scaffold/queue.md` | The empty request and question queue |
| `scaffold/defects.md` | The empty defect log |
| `scaffold/bin/crew` | The crew script: journal, hook handlers, the state the dashboard reads, session registration, request queue, defect log, keep awake, starting the dashboard, worktree setup and teardown |
| `scaffold/dashboard/` | Copied to `<project>/.crew/dashboard/`: the dashboard server (`server.mjs`), the model that turns crew files into its state (`model.mjs`), and the built page (`app/`) |
| `scaffold/templates/task.md` | Task spec template |
| `scaffold/templates/index.md` | Task-set index template |
| `scaffold/worktree/setup.sh` | The project's worktree setup (setup fills the marked section) |
| `scaffold/worktree/teardown.sh` | The project's worktree teardown (a no-op by default) |
| `templates/agents/*.md` | Subagent definitions copied into `<project>/.claude/agents/` by setup (advisor, builder, debugger, planner, qa, reviewer, scout, worker) |
| `templates/CREW.md` | Template for the per-project rules file (deviations only) |
| `templates/settings.json` | Hooks, the permission rule and `worktree.baseRef`, merged into `<project>/.claude/settings.json` |
| `dashboard/` | Source of the dashboard page (Vite, React, Tailwind, shadcn, ECharts); not installed |
| `tests/skill-size.sh` | Checks that `SKILL.md`'s body fits 5,000 tokens; not installed |
| `tests/hooks.sh` | Fixture tests for the crew script and the dashboard model (hooks, compactions, requests, defects, timing, reminders); not installed |
| `tests/dashboard.test.mjs` | Tests for the dashboard parsers and the live server; not installed |
| `aitools.json` | Install metadata: Claude Code only; leaves `tests/`, `dashboard/` and this file out |
| `LICENSE` | The Apache License 2.0; installed with the skill |
