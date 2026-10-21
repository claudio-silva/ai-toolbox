# Execution: running a task set

Reader: the lead. Read when starting, running or closing a task set or a direct task; when a review returns findings; before any parallel fan-out; when a premise turns out false.

A direct task is a task set of one: write `.crew/tasks/<task-slug>/index.md` with one row (from `.crew/templates/index.md`) and the spec beside it as `01-<slug>.md`. Every rule below applies to it unchanged.

## Before the first task

1. Run `git status --short`. Uncommitted changes that are not crew's belong to the founder: ask before touching, stashing or committing them.
2. Create the branch from the base branch (the branch checked out when the work was planned):
   - a task set: `crew/<plan-slug>`; a later stage: `crew/<plan-slug>-s<N>`;
   - a direct task: `crew/<task-slug>`.
   Trivial changes that skip review commit on the current branch, with no task set. A milestone is recorded in the state file, not as a branch.
   One task set is open per checkout, and one lead per checkout. A second set beside an open one runs from its own worktree with its own lead (Several leads, below).
3. Baseline commit of the plan, the specs and the index: `Plan <slug>: <what this set covers>`.
4. `.crew/bin/crew journal "Started task set <slug>"`.

## The index

You own `.crew/tasks/<plan-slug>/index.md`; builders never edit it.

- **Statuses:** `pending`, `in progress`, `in review`, `rework`, `accepted`, `blocked`. Update the row and the Progress line at every change: they feed the founder's dashboard.
- **Evidence only.** A status changes only from evidence in files or commands (a reviewer verdict, a command result), never from a claim in conversation.
- **Facts.** Append the FACTS lines builders report that later tasks need. Facts are how a fresh builder learns what earlier tasks found.

## The serial loop

1. **Pick** the next `pending` task whose dependencies are all `accepted`.
2. **Handle its flags** before the brief:
   - `cross-cutting`: have a scout re-check the surfaces named in Read first and Design against the current tree; patch the spec where it no longer matches the tree, and record the correction in Facts.
   - `judgement`: the builder runs at effort high and the brief names the judgement.
   - `discovery`: the brief repeats the rule "on a failing criterion, first decide: code wrong or premise wrong? On a false premise, stop and report."
3. **Dispatch** a fresh builder (a worker for mechanical work) with the dispatch format in `reference/briefs.md`, listing the known defects on the task's surfaces (Known defects in briefs, below). Set the row to `in progress`.
4. **On the report:** set `in review`, brief a fresh reviewer. For UI, look at 1–3 key screenshots.
5. **ACCEPT:**
   - Run `git status --short` and check nothing is unexplained.
   - Minor findings that came with the ACCEPT: triage them (Findings, below). Quick fixes go to the builder (resume it), and you check them by command or screenshot, with no re-review.
   - Stage by path the files the builder listed under CHANGED, plus the `.crew/` state files (index, queue, defects, handoff, plan).
   - Commit: `T<NN> <slug>: <summary>`.
   - Set the row to `accepted`, append Facts.
   - Drain the queue (`reference/requests.md`): `.crew/bin/crew request R<n> --status scheduled` for each entry that becomes a task, `--status done` for one this task delivered.
   - Journal the acceptance when it closes a milestone or the set; the hooks already log each agent.
6. **CHANGES:** set `rework`; triage the findings (below). Resume the builder with the ones to fix now (counts toward its 5 follow-ups); defer the rest. Then the re-review (the reviewer resumed, or a fresh one given the previous findings) checks only those findings and the fix diff.
7. **Failure:** routing rule 6 in `SKILL.md`.

## Findings: fix now or defer

The first review is the complete one; later rounds are bounded. Each finding carries a severity (high, medium, low) and the reviewer's call on whether it is a **leaf**: nothing pending builds on it, and it fails safely.

**Triage every finding into one of three:**
1. **Fix now, re-reviewed:** high severity, or not a leaf.
2. **Fix now, no re-review:** a leaf the builder fixes in a few minutes and you can check by command or screenshot.
3. **Defer:** any other leaf, typically one that would need investigation, another review round or another agent.

**A finding is a leaf only when all of these hold:**
- Severity low or medium.
- No pending or running task's spec reads or changes its surface (its Read first and Design), and no critical journey runs through it.
- It fails safely: no data loss or corruption, no security or privacy exposure, no crash or dead end on a main path, no change to a contract (API, schema, data format, an exported type), and nothing wrong in a test or its harness (a flaky or false check pollutes every later task's evidence).

Typical leaves: misaligned or cropped elements, spacing, copy polish, a rare error path that shows a poor message but keeps the data. The same rare error path is not a leaf when it loses data.

**Defer** with `.crew/bin/crew defect "<symptom>" --where "<surface or files>" --from "T<NN> review" --severity low|medium`. The task is accepted with its deferred defects; the defect log is their record. High severity cannot be deferred.

**Re-review scope.** A re-review checks the findings sent back and the fix diff, nothing else. A new finding outside that diff is triaged like any other: high → fix now (it escaped the first review); otherwise defer it. Review rounds then converge instead of finding something new each time.

**Known defects in briefs.** Before every dispatch, review and QA brief, `grep` the set's `defects.md` and the backlog's (`.crew/defects.md`) for the surfaces the work touches and list the open matches under KNOWN DEFECTS: known and scheduled, so agents neither fix nor chase them, and a reviewer or QA does not report them again.

**Promotion.** A deferred defect that blocks another task's check, or causes a failure in other work, is fixed now: fold it into the current task when small, otherwise run it as an urgent task, and mark it `crew defect D<n> --promote --note "<what it broke>"`. A failure whose cause is unclear goes to the debugger with the defect log in its brief. Promotions on the dashboard show how often deferral backfired; many of them mean the leaf test is being read too loosely.

**Draining.** At set close, before the final review, one task fixes the set's deferred defects (`--status scheduled --note "as T<NN>"`, then `--status fixed` when accepted). No medium defect outlives its set. Low ones may move on (`--slot "<next set>"`) and are listed in the milestone report.

## Discovery failure

If the evidence says a premise is false (from a `discovery` task, a debugger, or a reviewer):
1. Mark the dependent tasks `blocked`.
2. Record the finding in the plan ("Now known false: …") and in Facts.
3. Re-plan through the planner.
4. If the outcome or scope changes, add a founder question; interrupt now if no unblocked work remains (`reference/founder.md`).

## Parallel fan-out

Run tasks in parallel only when they have no dependency between them, no overlapping files in their specs, and none settles a contract the others use.

1. **Check** that `.claude/settings.json` has `worktree.baseRef` set to `"head"` (`jq -r '.worktree.baseRef' .claude/settings.json`). Otherwise do not fan out: worktrees would branch from the remote default branch.
2. **Commit everything** on the set branch first; worktrees see only committed work.
3. **Dispatch** every builder in the batch with `isolation: worktree`. Add to each brief:
   > You are in a worktree at <path>. Run `.crew/bin/crew worktree setup` first. Keep everything you produce inside the worktree; screenshots and reports go under `.crew/task-data/T<NN>-<slug>/`. When done, commit once as `T<NN> <slug>: <summary>`. Report the worktree path and branch.
4. No agent edits source files in your checkout (the main one, or the worktree you lead from) until the batch is integrated. You still update `.crew/` files there.
5. **Review in the worktree.** Add to the review brief:
   > Run every command in <path>, with `cd <path> && <cmd>` or `git -C <path>`; screenshots are under `<path>/.crew/task-data/`.
6. **Integrate one task at a time**, after its ACCEPT:
   1. Cherry-pick its commit onto the set branch (or fast-forward when possible).
   2. Re-run the project's checks on the set branch.
   3. Run `.crew/bin/crew worktree teardown <path>`. Run it from your checkout: it copies the worktree's `.crew/task-data/` into it, appends any worktree journal lines, runs `.crew/worktree/teardown.sh`, and removes the worktree and its branch.
   4. Update the index and drain the queue as in the serial loop.
7. **A merge conflict goes to a builder**, never to you.

Only two things leave a worktree: the builder's commit and `.crew/task-data/`. Everything else is deleted with it. Durable agents (`memory: project`) and QA never run in worktrees.

## Closing a set

1. All tasks `accepted`.
2. **Deferred defects** of the set: fixed by one task, or (low ones only) moved on (Findings, above). Then `.crew/bin/crew carry` moves what is still open in the set's queue and defect log to the backlog, `.crew/queue.md` and `.crew/defects.md`.
3. **Final review** by a fresh reviewer (template in `reference/briefs.md`). CHANGES → add the follow-up tasks to the index and run them.
4. **QC checkpoint** (`reference/testing.md`).
5. **Merge locally:** `git merge --no-ff crew/<slug>` into the base branch, then delete the set branch. Never push; pushing is the founder's call unless `CREW.md` says otherwise. Leading from a worktree, merge in the checkout that has the base branch (`git -C <it> merge --no-ff crew/<slug>`) only when its `git status --short` is clean and `crew where` shows no other lead there; otherwise tell the founder the set is ready to merge, and leave the worktree for them to remove.
6. Add a line `Closed: <YYYY-MM-DD>` under the index title.
7. Update the state file (status, milestone, decisions).
8. `.crew/bin/crew journal "Closed task set <slug>; merged into <base>"`.

## Several leads

Each checkout has at most one lead: `crew session start` refuses a second session in a checkout that has one (exit 4) and offers a take-over. Two sets run side by side from separate checkouts: the founder adds a worktree for the second, `git worktree add ../<repo>-<slug> -b crew/<slug> <base>`, and starts Claude Code there with `/crew`. Not the builders' worktrees under `.claude/worktrees/`: those are short-lived.

- Each lead works in its own checkout and set: `crew where` names them, the other leads, and their sets. Never edit another set's files or another checkout's source.
- `crew request` and `crew defect` write your set's files; their numbers are unique across the project. `--backlog` writes `.crew/queue.md` or `.crew/defects.md`, for work no open set takes.
- The journal, the dashboard and the hooks' state are shared; `crew running` lists your agents (`--all`: every lead's).
- Two sets that touch the same files will conflict at merge: the planner keeps sets apart, and the founder decides the merge order.

## Reorient

When a premise is false and the set cannot continue:
1. Stop: no new briefs; stop running agents (`TaskStop`).
2. Re-run the command acceptance of every accepted task.
3. Keep what still passes. Revert the rest only after founder confirmation, telling them exactly what would be reverted and lost.
4. Write what was learned into the plan ("Now known false: …") and the state file.
5. Re-plan through the planner.
6. `.crew/bin/crew journal "Re-planned <slug>: <premise> is false"`.

## `Git: none` in `CREW.md`

No branches and no commits. Report changes as uncommitted, and no parallel fan-out (worktrees need git).
