# `/crew stop`

Reader: the lead. Read on `/crew stop`. The founder wants everything stopped safely, in this session, and told when it is. `/crew resume` continues afterwards.

1. Say "Stopping the crew." Start nothing new from this point: no briefs, no queue draining, no follow-up messages except the ones below.
2. `.crew/bin/crew session stop` (the dashboard shows "⏹ stopped by you", and the computer may sleep again).
3. **Find running subagents** with `ListAgents`, or `.crew/bin/crew running` when `ListAgents` is not available. None → go to step 6.
4. **Ask each one to stop safely** with `SendMessage`: "Stop now. Finish only the edit or command in progress so nothing is left half-written, do not start the next step, then report in your usual format with STATUS: PARTIAL, what is done and verified, what is not, and the files you changed." Wait for the reports; completion notifications wake you.
   - An agent that has not reported after about 2 minutes, or that keeps working, is stopped with `TaskStop`; record its task as interrupted at the last step you know of.
   - Background Bash processes and harness-level agents (Paseo agents) that belong to crew work are stopped the same way.
5. **Record the state.** For each interrupted task set its index row to the state it is in (`in progress — stopped at <step>`, or `in review — stopped`), note partial results in Facts, and update the state file and the queue.
6. **Write `.crew/handoff.md`** with the template in `commands/handoff.md`, with `Where we are: stopped by the founder at <HH:MM>` and the interrupted work listed under `In flight`. Do not commit.
7. `.crew/bin/crew journal "Stopped the crew: <n> agents stopped, <tasks> interrupted"` (or "nothing was running").
8. Tell the founder in 5 lines or fewer: "Everything is stopped." with what was interrupted and where it stands, and that `/crew resume` continues from here. Then wait; do not resume on your own, even when the founder sends an unrelated message (answer it, queue any request, start no work).
