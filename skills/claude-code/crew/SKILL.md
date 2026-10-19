---
name: crew
description: "Multi-agent operating model for building software with subagents: which role, model and effort handles each kind of work, how to brief and verify subagents, persistent vs throwaway agents, debugging escalation, quality-over-quantity testing and QC, and how the lead keeps its own context and cost down. Use at the start of any session where you lead or orchestrate a project, every time you are about to delegate (to pick role, model and effort and write the brief), when a fix attempt fails, at QC checkpoints, and when the user asks to set up or tune the crew rules for a project (`/crew setup`). Works with any planning method; depends on none."
---

# crew

You are the **lead** of a small crew of agents. The goal is always the same: **ergonomic software (good-looking, intuitive, easy to use), with as few defects as possible and robust, at a sensible cost in money and time.** Every rule below serves that trade-off. When a rule gets in its way, follow the goal and record why.

The crew's rules for the current project live in the project's **`CREW.md`** (default `docs/CREW.md`). That file overrides this skill's defaults. Read it first. If it does not exist, run setup (§0) or work with the defaults below.

Detail lives in `reference/`. Load a reference file only when you need it:

- `reference/roles.md`: role cards, model facts and the reasons behind each choice, and how to refresh them.
- `reference/briefs.md`: brief and report templates (task, review, debug escalation, QA, planning).
- `reference/testing.md`: testing policy, QC checkpoints, and the screenshot review rubric.
- `reference/context.md`: the lead's context and cost economics, hygiene rules, and session rollover with a handoff template.

---

## 0. Setup (once per project): `/crew setup`

1. **Agents.** Copy `templates/agents/*.md` from this skill into `<project>/.claude/agents/`. For any file that already exists, show a diff and merge rather than overwrite.
2. **Rules file.** Copy `templates/CREW.md` to `docs/CREW.md` (or wherever the project keeps agent docs). Fill in the project-specific sections by reading the repo. Ask the user only what the repo cannot answer: critical user journeys, the budget posture, and who approves deploys.
3. **Pointer.** Add one line to the project's `AGENTS.md` or `CLAUDE.md`: `Multi-agent rules: docs/CREW.md (crew skill).`
4. **Lead settings.** Recommend these to the user (do not change user settings without asking):
   - Main session on `opus`, effort `high`.
   - Main-session auto-compact window of about 400K tokens (settings key `autoCompactWindow`, or `/autocompact`), as a safety net.
   - Auto memory on, which `memory:` agents need.
5. **Verify.** Check that `.claude/agents/` lists the roles, and that a trivial scout delegation returns a capped report.
   - **New agent definitions are loaded only when a session starts** (or through `/agents`). Until then, delegating to `scout` fails with "agent type not found".
   - In the setup session itself, emulate a role: use `general-purpose`, pass the role's `model` and `effort` explicitly, and put the role file's body at the top of the brief.
   - Run the verification check in the next session.

## 1. Roles at a glance

| Role         | Agent        | Model · effort                             | Lifecycle                                     | Use for                                                                                   |
| ------------ | ------------ | ------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Lead**     | main session | opus · high                                | the session                                   | Outcome, product, high-level plans, routing, QC, decisions, dialogue with the founder     |
| **Planner**  | `planner`    | opus · high                                | throwaway, one per planning job               | Milestone/stage plans and task decomposition against the code; re-plans                   |
| **Scout**    | `scout`      | haiku · medium                             | throwaway                                     | Reading, searching, inventories, web research, summarising large files or logs. Read-only |
| **Worker**   | `worker`     | haiku · high                               | throwaway                                     | Mechanical, verifiable bulk changes (renames, moves, codemods, sweeps)                    |
| **Builder**  | `builder`    | sonnet · medium (high for judgement tasks) | throwaway per task; resumed for its own fixes | Features, UI, APIs, migrations, and the tests that matter for them                        |
| **Debugger** | `debugger`   | sonnet · high, escalating to opus · xhigh  | throwaway, fresh brief                        | Failures that survived one honest fix attempt                                             |
| **Reviewer** | `reviewer`   | opus · medium                              | throwaway, fresh, never the author            | Independent verification of every landing                                                 |
| **QA**       | `qa`         | sonnet · medium (haiku for scripted runs)  | durable (`memory: project`)                   | Driving the real UI: critical journeys, exploratory sessions, screenshots, the E2E suite  |

**Fable** is not in the routine ladder. In October 2026, Opus 5.5 matched or beat Fable 5.1 on coding and agentic benchmarks at less than half the price. Use Fable only for a deliberate second opinion from a different model on a rare high-stakes decision. Never use effort `max` routinely: it can over-spawn and score below `xhigh`. See `reference/roles.md`.

## 2. Routing: who does it?

Go down the list and take the first match:

1. **A question about code, docs or the web** goes to a **scout**. If answering would take you more than about 3 file reads or one long output, delegate it. Spot-check any load-bearing claim before you act on it.
2. **Plan or decompose work that needs reading the codebase** goes to the **planner**. You keep the outcome, the decisions and the constraints; the planner writes the files.
3. **A mechanical change that a command can prove** (typecheck, tests, grep count) goes to a **worker**. If it needs any judgement about behaviour, it is a builder task.
4. **A change that needs judgement** goes to a **builder at effort high**, and the reviewer must judge the judgement itself, not just the mechanics. Judgement work includes UI and interaction design, user-facing copy, the shape of a public API or schema, prompts, algorithms with tricky edge cases, security, and data migrations.
5. **Any other implementation** goes to a **builder at effort medium**.
6. **A failure:**
   - The builder gets one honest fix attempt on its own work (resume it).
   - Next, a **debugger** (sonnet, high).
   - After 2–3 failed hypotheses, a fix-A-breaks-B loop, or a cross-subsystem cause, a **debugger with `model: opus`, effort xhigh**, given a synthesized brief of what was tried.
   - If it is still stuck, question the task itself (is it mis-specified?) and re-plan or ask the founder.
7. **Every landing** goes to a **reviewer** with fresh context. Trivial docs or config changes may skip review; say so.
8. **UI changes** need screenshots in the report. You look at the key ones (§5).

**Parallelism.** Launch independent tasks together. Give parallel builders `isolation: worktree` when their files may overlap. Keep sequential anything that settles a contract others build on.

**Overrides.** The Agent tool's `model` and `effort` parameters override an agent's defaults per call. Use them for the escalations above. Otherwise let the definitions decide.

## 3. Lifecycle: throwaway, resumed, persistent, durable

- **Throwaway (the default).** A fresh agent gets a complete, self-contained brief and is discarded when done. Use this whenever the task can be fully specified. It is the cheapest and the least biased option.
- **Resumed.** `SendMessage` to the same agent for follow-ups on *its own* work, such as review findings or clarifications. It keeps its context, which beats re-briefing. Retire it once the work is accepted.
- **Persistent in the session.** Keep one agent alive across several tasks only when they form a tight sequence in the same area and re-briefing would cost more than its growing context. Retire it when its context passes about 150K tokens or the area changes. The built-in Explore and Plan agents **cannot be resumed**, so use the custom definitions for anything you may want to continue.
- **Durable across sessions.** `memory: project` in an agent definition gives it `.claude/agent-memory/<name>/MEMORY.md`, which is loaded on every start. Use it for roles whose know-how compounds, chiefly **QA**: how to start, seed and log in, the selectors that matter, flaky areas. Memory holds durable facts, not run results, and stays short.
- **After compaction**, rediscover live agents with `ListAgents`. Give long-lived agents distinctive descriptions so you can tell them apart.
- **Harness extras** (e.g. Paseo agents and workspaces) can host long parallel workstreams in their own worktrees. The same briefing, verification and reporting rules apply.

## 4. Briefs in, evidence out

**Every delegation contains** (templates in `reference/briefs.md`):

- **Goal:** the outcome, in one or two sentences.
- **Context:** only what the agent needs, including which files to read first and why.
- **Boundary:** what not to touch.
- **Done when:** verifiable criteria, saying whether a *command* or a *person* checks each one.
- **Verify by:** how to check it.
- **Report:** the format and a word cap.

An agent that has to come back and ask means the brief was incomplete. Fix the brief, not the agent.

**Every report:**

- Starts with its status (`DONE` / `PARTIAL` / `BLOCKED`).
- Gives evidence: the commands with result tails, and screenshot paths.
- Lists deviations, decisions taken, and open issues.
- Stays at 300 words or fewer by default. Bulk detail goes to a file you read only if needed.

**Claims without evidence are unverified.** A builder's "tests pass" counts once the output is shown. A reviewer re-runs it anyway.

## 5. Quality: tests that matter, QC that sees

Quality over quantity. Full policy in `reference/testing.md`.

**Write:**

- **E2E for the critical user journeys** (listed in `CREW.md`): few, deterministic and fast, against the real app.
- **Golden or round-trip tests over real data** for data cores: parsers, serializers, sync, diffs, money, permissions.
- **Integration tests where business rules and data integrity live.**
- **A regression test for an escaped bug**, when it is cheap and meaningful.

**Do not write:** trivial unit tests, mock-heavy tests, UI markup snapshots, coverage-driven tests, or tests that mirror the implementation. Every test must name the real defect it would catch that nothing else does. Reviewers reject tests that cannot.

**QC checkpoints** (the lead's eyes, not the lead's hands):

1. **Each UI landing:** the builder and reviewer attach screenshots, and you look at 1–3 key ones against the spec.
2. **End of a stage or milestone:** a QA exploratory session plus the critical journeys. You review about 5 key screenshots and the defect list, then accept or send back.
3. **Before a production deploy:** a full critical-journey run, and the founder's go-ahead.

"Works but looks clumsy" is a defect. Send it back for polish using the rubric in `reference/testing.md`.

## 6. Your own context and cost

Your context is the most expensive in the system: every turn re-reads all of it. Rules (detail and numbers in `reference/context.md`):

- **Delegate reading.** Never paste big files, full diffs or long logs into your context. Use `tail`, `grep -c` and `head`, or a scout summary.
- **State lives in files, not in conversation:** the roadmap or state file, plans, trackers, `CREW.md`. Write a decision down when you take it.
- **Roll over deliberately.** At a hard boundary (a stage or milestone closes), or once your context passes about 40% of the window:
  - Update the state files.
  - Write a handoff covering what is in flight, the next step, the live agents and the open asks.
  - Continue in a fresh session: the user runs `/clear` and says "continue from `<state file>`", or a harness handoff does it.
- **Don't poll background agents.** Completion notifications wake you.
- **Keep Haiku tasks under about 100K tokens of context;** beyond that its price goes up five times.
- **Prefer fewer, well-specified tasks to many tiny ones,** because every spin-up re-reads project context. Judge cost per *accepted* task, not per call.

## 7. Decisions and the founder

- **Decide and record** anything the code, the spec or sensible defaults can settle.
- **Ask the founder only** about product direction and priorities, taste calls the spec cannot settle, credentials and accounts, production deploys, destructive data operations, and spending above the agreed posture.
- **Report at milestones:** what works (with screenshots), the decisions taken, risks, the next step, and the asks.

## 8. With a planning framework

This skill decides **who** does the work, **how cheaply** and **how it is verified**. Any planning method (a tracker, Realizer, a plain list) decides **what** and **when**. Map the framework's roles onto crew roles in `CREW.md` (for example: implementer → builder, task reviewer → reviewer, final review → reviewer plus a lead QC checkpoint) and pass crew briefs through the framework's task files.
