# `/crew handoff`

Reader: the lead. Read on `/crew handoff`. The founder's flow is `/crew handoff`, `/clear`, `/crew resume`. To pause without a new session, the founder runs `/crew stop` instead (`commands/stop.md`).

1. **Wait for running work.** Say "Preparing the handoff." Find running subagents with `ListAgents`, or `.crew/bin/crew running` when `ListAgents` is not available.
   - If any is running, say "Waiting for ongoing work to finish." Start nothing new.
   - When each one reports, only record its result (for example a finished builder becomes "T05 implemented, review not started"). Do not start the next step.
   - Only if the founder explicitly insists on handing off now: stop the running agents with `TaskStop` and record their tasks as interrupted.
2. **Update the state:** the state file (status, decisions log), the index statuses and the queue.
3. **Write `.crew/handoff.md`** (overwrite it) with this template:
   ```
   # Crew handoff — <YYYY-MM-DD HH:MM>
   HEAD: <branch> @ <short sha>
   Files: CREW <path> · state <path> · plan <path> · index <path> · queue .crew/queue.md
   Where we are: <milestone / task set / task, one line>
   In flight: <"nothing", or task — state, e.g. "T05 implemented, review not started">
   Next step: <the very next action>
   Decisions since last handoff: <bullets, or "see decisions log">
   Open founder questions: <bullets, or "none">
   Watch out for: <gotchas discovered>
   ```
   Get the HEAD line from `git rev-parse --abbrev-ref HEAD` and `git rev-parse --short HEAD`. Write "none" for a plan or index when no task set is active.
4. **Do not commit.** The handoff file is swept into the next task commit.
5. `.crew/bin/crew journal "Handed off: <where we are>"`.
6. Tell the founder: "Handoff written. Run `/clear`, then `/crew resume`."
