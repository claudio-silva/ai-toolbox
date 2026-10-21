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
2. **Never paste a file, diff or log you would only skim.** Use `tail -n 30`, `grep -c`, `head`, `--stat`, `wc -l`, or a scout summary. Redirect any output you would only skim to a file and read only what you need.
3. **Cap reports.** Briefs set a word limit; bulk detail goes to files.
4. **Don't re-read** what you already know. Record facts in state files once.
5. **Screenshots are cheap and high-value** (about 1–2K tokens each), but use them at checkpoints, not on every step.
6. **Don't poll.** Background agents notify you on completion. If you must wait for a background agent, keep the context lean before it.

## Where state lives (so you can forget safely)

| What | Where |
|---|---|
| Status, milestones, decisions log, owner actions | the project's roadmap/state file (e.g. `docs/ROADMAP.md`) |
| What and why for current work | the active plan |
| Task status, findings, memory | the tracker, if an external framework uses one |
| Crew rules and project facts for agents | `docs/CREW.md` |
| Durable role know-how | `.claude/agent-memory/<agent>/MEMORY.md` (`memory: project`) |
| Cross-project facts about the user | the harness's user memory |
| Founder requests and questions | `.crew/queue.md` (committed) |
| Deferred defects (leaf findings from reviews and QA) | `.crew/defects.md` (committed) |
| Plans | `.crew/plans/<slug>.md` (committed), unless `CREW.md` names another location |
| Task statuses, specs and Facts for a task set | `.crew/tasks/<slug>/index.md` and `NN-<slug>.md` (committed) |
| Where the last session stopped | `.crew/handoff.md` (committed with the next task) |
| Evidence per task: screenshots, reports over the cap, logs | `.crew/task-data/<id>/` (gitignored, never deleted by crew) |
| Development history and the founder's dashboard | `.crew/journal.md`, and the web page served by `.crew/dashboard/` (gitignored; for the founder; never read by the lead) |
| Scratch: lock, hook state, agent runs and sleep for the dashboard's Timing tab | `.crew/tmp/` (gitignored) |

Rule: if losing your context right now would lose a decision, write it down now.

## Compaction: what survives, and how crew keeps its rules in context

Compaction replaces the conversation with a summary. Claude Code then re-injects from disk: the system prompt, the project-root `CLAUDE.md`, auto memory, the bodies of invoked skills (from v2.1.304, capped at 5,000 tokens per skill and 25,000 in total, oldest dropped first), up to five recently read files, and the output of `SessionStart` hooks matching `compact`. Everything else, including earlier hook context and nested or path-scoped rules, survives only as far as the summary kept it. Hooks cannot tell which agent compacted (see the comment block at the top of `.crew/bin/crew`), so every reminder is written so that it is safe for both roles.

Crew relies on five layers, in this order:

1. **State in files.** The state file, the plan, the index, the specs and `.crew/queue.md` hold everything that must survive. If losing context now would lose a decision, write it down now.
2. **`CLAUDE.md`.** `/crew setup` writes a short crew block there (the pointer to `CREW.md`, the request rule, where state lives). It is re-injected after every compaction, for the lead and for subagents, and costs a few hundred tokens per session.
3. **`SKILL.md` carries every rule you must never lose.** Claude Code re-attaches the skill's body after a compaction, so a rule written there survives whether or not a hook fires and whether or not a reminder is followed. Anything you must apply unprompted (every founder message, every delegation, every returned report, every step of the work loop) belongs in `SKILL.md`; everything needed only at a trigger stays in the reference file the Read-when table names. The body stays within the 5,000 tokens that are re-attached, with its sections in order of importance. If the skill's rules are no longer in your context, invoke the `crew` skill again.
4. **The compaction hooks.** `PreCompact` appends crew's instructions to the summarizer (keep the request rule, the task statuses, the live agents, unwritten decisions and the next step; for a subagent, its spec path, verified criteria, changed files and report format). `SessionStart(compact)` adds a conditional reminder: read `CREW.md`, the queue, the active index and the state file only if they are no longer in context; run `ListAgents` only if unsure which subagents are live. A subagent is reminded of its spec path, never of the lead's duties.
5. **`UserPromptSubmit` while work is in flight.** One line per founder message reminds you to queue requests before acting on them.

**Re-reads cost tokens.** After a compaction, read a file only when it is no longer in your context: the summary and the five automatic re-reads often already hold it.

### Measuring compactions

Every compaction is logged (`.crew/journal.md`, "Context compacted · <agent> · 267k → 14k · 57 s · auto · ≈$0.33") and tracked on the dashboard's Compactions tab: how many for the lead and for subagents, the context size at which each one happened, how often (the lead: time between its compactions; subagents: time from start to compaction), and three estimates per compaction at Anthropic list prices:

- **overhead** ≈ `pre × cache-read price + post × output price` (the summarization request, warm cache; a cold cache after an idle gap longer than the TTL costs up to the full input price, which hooks cannot see);
- **saved so far** ≈ `turns since × (pre − post) × cache-read price` (what the API requests made after the compaction would have paid to carry the dropped context);
- **net** = saved − overhead.

Not measured: the re-reads an agent performs after a compaction, and the detail that the summary lost. Read the numbers with that in mind:

- **Net ≤ 0 or a small "turns since"** on most rows of a role: it compacts too early for the work it does. Raise that model's window.
- **Subagents compacting mid-task** (builders at ~170k with hours to go): the task is too big for one context, or the window is too small. Prefer smaller tasks, then a larger window for that agent.
- **The lead compacting rarely at a very large context**: each turn is paying for context it no longer uses; a smaller window saves on every turn and the summary loses little when state is in files.

Windows are set per model with `modelSettings.<model>.autoCompactWindow` in a settings file (Claude Code v2.1.288 or later); a model's window applies to the lead and to every subagent on that model. Recommended starting points: Haiku 100K, Sonnet 200K, Opus 300K, Fable 400K. Compaction triggers about 33K below the window (room for the summary): a 200K window compacts at ~167K, so read the Compactions tab's sizes against window − 33K. `/autocompact <size>` sets and saves only the current model's window, the lead's. A top-level `autoCompactWindow` sets every model without its own; `autoCompactWindow: <tokens>` in an agent definition's frontmatter only lowers the window for that role (v2.1.296 or later); `--autocompact` sets one launch; `CLAUDE_CODE_AUTO_COMPACT_WINDOW` overrides them all. A 1M window is a ceiling, not a target.

## Handoff and stop

The founder rolls the session over with `/crew handoff`, then `/clear`, then `/crew resume` (`commands/handoff.md`, `commands/resume.md`). `/crew stop` stops every running subagent safely in the current session and waits; `/crew resume` continues from the handoff it wrote (`commands/stop.md`).
