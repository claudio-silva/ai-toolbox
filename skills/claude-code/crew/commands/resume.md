# `/crew resume`

Reader: the lead. Read on `/crew resume`.

1. **Read `.crew/handoff.md`.** Missing → say so, and fall back to `CREW.md`, the state file, the active index (`.crew/tasks/*/index.md` without a `Closed:` line) and `.crew/queue.md`.
2. **Read the files on its Files line.** Read the plan only if the next step needs it.
3. **Check HEAD.** Compare `git rev-parse --abbrev-ref HEAD` and `git rev-parse --short HEAD` with the HEAD line. If they differ, warn the founder with the output of `git log --oneline <recorded sha>..HEAD` (and the branch names). Continue unless the change conflicts with the next step; then ask.
4. **Agents from the previous session cannot be resumed.** Restart in-flight work from its recorded state (for example "T05 implemented, review not started" → brief a fresh reviewer).
5. `.crew/bin/crew journal "Resumed from the handoff of <date>"`.
6. Tell the founder, in 5 lines or fewer, where things stand and what you do next. Then do it.
