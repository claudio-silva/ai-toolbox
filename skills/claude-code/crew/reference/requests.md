# Founder requests during work: the queue

Reader: the lead. Read when a message from the founder arrives while work is in flight, and at every task-acceptance boundary when `.crew/queue.md` has due items.

## Four steps for every message

1. **Classify.**
   - A clarification gets an answer now.
   - Anything that changes what gets built is a **request**, even if phrased as a question ("could the editor also save drafts?").
   - An instruction about the crew's operation ("stop", "pause", "do X first") takes effect immediately.
2. **Assess** the request:
   - which plan sections and tasks it touches;
   - conflicts with in-flight work, accepted work, or the decisions log;
   - its cost in tasks;
   - whether it changes the milestone outcome.

   Use a scout if assessing needs reading beyond the plan and the index.
3. **Route.**
   - It invalidates in-flight work → Invalidation, below.
   - The founder marks it urgent → the front of the queue.
   - Otherwise → append it to `.crew/queue.md` with the assessment and its slot.
4. **Acknowledge in 3 lines or fewer:** how you understood it, what it affects, its slot ("after T04", "after the current task set", "next milestone"). Flag any contradiction with the decisions log.

Example acknowledgement:

```
Understood: drafts should autosave every 10 seconds, not only on blur.
Affects T05 (autosave) and the conflict banner in T06; costs one extra task.
Queued as R3, slot: after T05. Note: the decisions log has "save on blur only" (2026-10-12); this overrides it.
```

## Invalidation

If a request means the running task's output would be discarded or rewritten:
1. Stop the affected agents now (`TaskStop`, or `SendMessage` telling them to stop).
2. If it also means reverting accepted work, tell the founder exactly what would be reverted and lost, and get confirmation before accepting the request and resuming.
3. Mark the affected tasks in the index (`blocked` until re-planned) and route the request to the front of the queue.

## Queue entry format

In `.crew/queue.md`, under "Requests from the founder", one line each:

```
- [R<n>] <date> · <request in the founder's words> · affects: <plan sections / tasks> · slot: <after T<NN> | end of set | milestone <N>> · status: queued | scheduled | done | dropped
```

`queued`: waiting for its slot. `scheduled`: turned into tasks or a plan change. `done`: the work is accepted. `dropped`: the founder withdrew it, or it was superseded (say by what).

## Draining

- Drain **only at task-acceptance boundaries**: after a reviewer's ACCEPT and the commit, before the next brief. Never mid-task.
- Take due items oldest first, urgent items before all others.
- A request that touches one task's spec: amend that spec (if no agent is working from it) or add a task row and spec to the index.
- A request that affects more than one task, or the plan: brief the planner to amend the plan, the specs and the index.
- Never edit a plan, spec or index entry an in-flight agent is working from.
- With an external framework, requests go through that framework's re-plan path.

## Journal

Log each transition: `.crew/bin/crew journal "Queued R3: autosave every 10 s, after T05"`, then "Scheduled R3 as T07", "Done R3", or "Dropped R3: superseded by R5".
