# `/crew resume`

Reader: the lead. Read on `/crew resume`. Two cases, same steps: a **new session** after `/crew handoff` and `/clear`, or the **same session** after `/crew stop`.

1. **Register:** `.crew/bin/crew session start ${CLAUDE_SESSION_ID}`. In a new session it makes this session the checkout's lead; after `/crew stop` it clears the stopped state on the dashboard. Exit 4: another session leads this checkout; relay its message to the founder and stop here.
   Its output names this checkout's task set, the set's files and, on its `Handoff:` line, the handoff. **Read the handoff.** None → say so, and fall back to `CREW.md`, the state file, the set's index and queue (`.crew/queue.md` when no set is open).
2. **Read the files on its Files line** that are no longer in your context. Read the plan only if the next step needs it.
3. **Check HEAD.** Compare `git rev-parse --abbrev-ref HEAD` and `git rev-parse --short HEAD` with the HEAD line. If they differ, warn the founder with the output of `git log --oneline <recorded sha>..HEAD` (and the branch names). Continue unless the change conflicts with the next step; then ask.
4. **In-flight work.**
   - New session: agents from the previous session cannot be resumed. Restart in-flight work from its recorded state (for example "T05 implemented, review not started" → brief a fresh reviewer).
   - Same session after `/crew stop`: an agent that stopped cleanly on request can continue with `SendMessage` ("Resume from <step>"; it counts as a follow-up). An agent stopped with `TaskStop`, or one whose partial work was not verified, is replaced by a fresh agent briefed from the index row and Facts; run the acceptance commands first to learn what state the code is in.
5. Drain the queue if it has due items, then `.crew/bin/crew journal "Resumed from the handoff of <date>"` (or "Resumed after the stop at <HH:MM>").
6. Tell the founder, in 5 lines or fewer, where things stand and what you do next. Then do it.
