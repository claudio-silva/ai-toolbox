# The lead's context: economics, hygiene, handoff

## Why it matters

The API is stateless, so every turn re-sends the whole conversation. With prompt caching, the cached prefix is billed at the cache-read price, and new content at the cache-write price. The lead's cost per turn therefore grows **linearly with its context size**, and a session's total cost grows roughly **with the square of its length**.

Order of magnitude for Opus 5.5 (cache read $0.20/MTok, cache write about $5/MTok for the 5-minute TTL and more for 1 h; check current prices):

| Lead context | Cost per turn (cache reads only) | 300-turn session |
|---|---|---|
| 150K | ~$0.03 | ~$9 |
| 400K | ~$0.08 | ~$24 |
| 800K | ~$0.16 | ~$48 |

There is also a hidden spike. If the cache expires (an idle gap longer than the TTL), the next turn re-writes the **entire** context at write price: about $4–6 at 800K, every time. Large context combined with long waits is the expensive pattern.

A 1M window is therefore a safety margin, not a target. Long memory belongs in **files**, not in the conversation.

## Hygiene rules

1. **Delegate reading.** Use scouts for exploration, the planner for planning, and the reviewer for diffs. You consume conclusions.
2. **Never ingest raw bulk.** No full files, diffs or logs. Use `tail -n 30`, `grep -c`, `head`, `--stat`, `wc -l`, or a scout summary. Redirect long command output to a file and read only what you need.
3. **Cap reports.** Briefs set a word limit; bulk detail goes to files.
4. **Don't re-read** what you already know. Record facts in state files once.
5. **Screenshots are cheap and high-value** (about 1–2K tokens each), but use them at checkpoints, not on every step.
6. **Don't poll.** Background agents notify you on completion. If a long wait is unavoidable, keep the context lean before it.
7. **Keep Haiku agents under about 100K tokens of context;** above that its price goes up five times.

## Where state lives (so you can forget safely)

| What | Where |
|---|---|
| Status, milestones, decisions log, owner actions | the project's roadmap/state file (e.g. `docs/ROADMAP.md`) |
| What and why for current work | the active plan |
| Task status, findings, memory | the tracker, if a framework uses one |
| Crew rules and project facts for agents | `docs/CREW.md` |
| Durable role know-how | `.claude/agent-memory/<agent>/MEMORY.md` (`memory: project`) |
| Cross-project facts about the user | the harness's user memory |

Rule: if losing your context right now would lose a decision, write it down now.

## Handoff: `/crew handoff`

The lead keeps going — there are no context thresholds to act on. Compaction settings are the user's choice and the harness compacts as needed; what makes a long session painless is that state lives in files, not in the conversation. A session ends only when the user invokes `/crew handoff`. A natural boundary (a stage or milestone closing) is the best moment to suggest it; if it comes mid-task, note in-flight agents rather than abandoning them.

Steps:
1. Make sure no agent is mid-task (or note which ones are, with their IDs from `ListAgents`; in-session agents can be resumed only from the same session).
2. Update the state file: status, the decisions taken, what is next.
3. Write the handoff (template below) into the state file's "Next session" section, or into `docs/HANDOFF.md`.
4. Tell the user to start fresh (`/clear`, then "continue from `<state file>`"), or use the harness's handoff mechanism (e.g. a Paseo handoff to a new agent).

Compaction may still fire on the user's own settings between handoffs; it keeps a summary, so disciplined state files are what make it lossless. Write a decision down when you take it.

### Handoff template

```
## Next session — handoff (<date>)
Where we are: <stage/milestone, one line>
In flight: <task — agent/branch — state> (or "nothing")
Next step: <the very next action>
Decisions since last handoff: <bullets, or "see decisions log">
Open asks to founder: <bullets>
Watch out for: <gotchas discovered>
```
