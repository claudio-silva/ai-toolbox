# Founder requests: the detail behind the rule

Reader: the lead. The rule itself is in `SKILL.md` ("Founder requests") and must be applied to every founder message, unprompted. Read this file when a request is hard to assess or route, when it invalidates running work, and when draining the queue.

## Assessing a request

Before acknowledging, work out:
- which plan sections and tasks it touches;
- conflicts with in-flight work, accepted work, or the decisions log;
- its cost in tasks;
- whether it changes the milestone outcome.

Use a scout if assessing needs reading beyond the plan and the index. The assessment goes into the entry's `affects:` and `slot:` fields, and into the 3-line acknowledgement. Example:

```
Understood: drafts should autosave every 10 seconds, not only on blur.
Affects T05 (autosave) and the conflict banner in T06; costs one extra task.
Queued as R3, slot: after T05. Note: the decisions log has "save on blur only" (2026-10-12); this overrides it.
```

## Classes and routing

- **Clarification:** answer it now; no entry.
- **Operational instruction** ("stop", "pause", "do X first", `/crew stop`): takes effect immediately; no entry unless it changes what gets built.
- **Request** (change, fix, feature, feedback, an answer that overrides a default you took): an entry, always, even when phrased as a question ("could the editor also save drafts?") or buried in a list of remarks. Five feedback items are five entries, or one entry listing them if they belong to the same task.
- **Urgent** (the founder says so, or it is a data-loss or security problem): `--urgent` puts it first; it is drained at the very next boundary.
- **Invalidation:** the request means a running task's output would be discarded or rewritten:
  1. Stop the affected agents now (`TaskStop`, or `SendMessage` telling them to stop).
  2. If it also means reverting accepted work, tell the founder exactly what would be reverted and lost, and get confirmation before accepting the request and resuming.
  3. Mark the affected tasks `blocked` in the index until re-planned, and queue the request as urgent.
- **External framework:** requests still go through the queue; the framework's re-plan path does the scheduling.

## The entry

`.crew/bin/crew request` writes it; the format, under "Requests from the founder" in `.crew/queue.md`:

```
- [R<n>] <date> · <request in the founder's words> · affects: <plan sections / tasks> · slot: <after T<NN> | end of set | milestone <N>> · status: queued | scheduled | done | dropped
```

```
.crew/bin/crew request "Autosave every 10 s, not only on blur" --affects "T05, T06" --slot "after T05"
.crew/bin/crew request "Rename the Save button to Guardar" --urgent
.crew/bin/crew request R3 --status scheduled --note "as T07"
.crew/bin/crew request R3 --status done
.crew/bin/crew request R4 --status dropped --note "superseded by R5"
```

`queued`: waiting for its slot. `scheduled`: turned into tasks or a plan change; the task spec carries `Requests: R<n>` and the entry's slot names the task. `done`: the work is accepted. `dropped`: withdrawn or superseded (say by what in `--note`). Each command journals the transition and re-renders the dashboard; no separate `crew journal` line is needed.

## Draining

- Drain **only at task-acceptance boundaries**: after a reviewer's ACCEPT and the commit, before the next brief. Never mid-task.
- Take due items oldest first, urgent items before all others.
- A request that touches one task's spec: amend that spec (if no agent is working from it) or add a task row and spec to the index, with `Requests: R<n>` in the spec.
- A request that affects more than one task, or the plan: brief the planner to amend the plan, the specs and the index; give it the R numbers.
- Never edit a plan, spec or index entry an in-flight agent is working from.
- When you add an index row whose spec has no `Requests:` line, the file-changed hook flags it in the journal and to you: either queue the request it comes from, or write `Requests: none` for planned work.
