# Execution: running a task set

Reader: the lead. Read when starting, running or closing a task set or a direct task; before any parallel fan-out; when a premise turns out false.

A direct task is a task set of one: write `.crew/tasks/<task-slug>/index.md` with one row (from `.crew/templates/index.md`) and the spec beside it as `01-<slug>.md`. Every rule below applies to it unchanged.

## Before the first task

1. Run `git status --short`. Uncommitted changes that are not crew's belong to the founder: ask before touching, stashing or committing them.
2. Create the branch from the base branch (the branch checked out when the work was planned):
   - a task set: `crew/<plan-slug>`; a later stage: `crew/<plan-slug>-s<N>`;
   - a direct task: `crew/<task-slug>`.
   Trivial changes that skip review commit on the current branch, with no task set. A milestone is recorded in the state file, not as a branch.
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
3. **Dispatch** a fresh builder (a worker for mechanical work) with the dispatch format in `reference/briefs.md`. Set the row to `in progress`.
4. **On the report:** set `in review`, brief a fresh reviewer. For UI, look at 1–3 key screenshots.
5. **ACCEPT:**
   - Run `git status --short` and check nothing is unexplained.
   - Stage by path the files the builder listed under CHANGED, plus the `.crew/` state files (index, queue, handoff, plan).
   - Commit: `T<NN> <slug>: <summary>`.
   - Set the row to `accepted`, append Facts.
   - Drain the queue (`reference/requests.md`).
   - Journal the acceptance when it closes a milestone or the set; the hooks already log each agent.
6. **CHANGES:** set `rework`; resume the builder with the findings (counts toward its 5 follow-ups); then a fresh reviewer gets the previous findings with the new report.
7. **Failure:** routing rule 6 in `SKILL.md`.

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
4. No agent edits source files in the main checkout until the batch is integrated. You still update `.crew/` files there, and the hooks write the journal and the dashboard there.
5. **Review in the worktree.** Add to the review brief:
   > Run every command in <path>, with `cd <path> && <cmd>` or `git -C <path>`; screenshots are under `<path>/.crew/task-data/`.
6. **Integrate one task at a time**, after its ACCEPT:
   1. Cherry-pick its commit onto the set branch (or fast-forward when possible).
   2. Re-run the project's checks on the set branch.
   3. Run `.crew/bin/crew worktree teardown <path>`. It copies the worktree's `.crew/task-data/` into the main checkout, appends any worktree journal lines, runs `.crew/worktree/teardown.sh`, and removes the worktree and its branch.
   4. Update the index and drain the queue as in the serial loop.
7. **A merge conflict goes to a builder**, never to you.

Only two things leave a worktree: the builder's commit and `.crew/task-data/`. Everything else is deleted with it. Durable agents (`memory: project`) and QA never run in worktrees.

## Closing a set

1. All tasks `accepted`.
2. **Final review** by a fresh reviewer (template in `reference/briefs.md`). CHANGES → add the follow-up tasks to the index and run them.
3. **QC checkpoint** (`reference/testing.md`).
4. **Merge locally:** `git merge --no-ff crew/<slug>` into the base branch, then delete the set branch. Never push; pushing is the founder's call unless `CREW.md` says otherwise.
5. Add a line `Closed: <YYYY-MM-DD>` under the index title.
6. Update the state file (status, milestone, decisions).
7. `.crew/bin/crew journal "Closed task set <slug>; merged into <base>"`.

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
