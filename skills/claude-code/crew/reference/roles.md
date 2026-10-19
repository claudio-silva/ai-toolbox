# Role cards and model facts

## Model facts snapshot (2026-10-17)

Sources: anthropic.com/news/claude-opus-5-5, anthropic.com/news/claude-sonnet-5-5, anthropic.com/claude-haiku-5-5, and the `claude-api` skill's model table. **Refresh before relying on these numbers:** re-read those pages, or invoke the `claude-api` skill, and update this table and the date.

| Model (alias) | $/MTok in / out | Cache read | Terminal-Bench 4.0 | FrontierCode 1.1 | CursorBench 4.0 | OSWorld 2.1 | Notes |
|---|---|---|---|---|---|---|---|
| Fable 5.1 (`fable`) | 10 / 50 | 0.25 | 55.8 | 50.3 | 51.8 | 80.7 (partial) | Most capable *widely released* tier on paper; long turns |
| Opus 5.5 (`opus`) | 4 / 20 | 0.20 | 66.4 (xhigh) | 54.4 (54.6 at medium) | 57.8 | 81.8 (partial) | Default effort **medium**; "performs at Fable 5.1's level on most work" (Anthropic) |
| Sonnet 5.5 (`sonnet`) | 2 / 10 | 0.10 | 70.6 | 52.1 (xhigh) | 55.5 | 80.1 (partial) | Low/medium effort beats Sonnet 5's best at ~1/10 the cost; "sharp eye for design" |
| Haiku 5.5 (`haiku`) | 0.10 / 0.50 (≤100K prompt), **0.50 / 2.50 above** | 0.01 | 39.2 | 46.4 | — | 72.4 (offline subset) | Fastest; marketed as a subagent for Opus/Sonnet, and for browser use |

What this means for routing:
- **Sonnet ≈ Opus on coding**, at half the price and half the cache-read price. Sonnet is the default implementer. Opus earns its price on *judgement*: lead, planning, review, and hard debugging.
- **Opus ≥ Fable on coding and agentic work**, at less than half the price. Fable is therefore not an escalation step. Use it only as a deliberately *different* second opinion.
- **Haiku is about 20× cheaper than Sonnet but far weaker at agentic coding** (39 vs 71 on Terminal-Bench). It is excellent for reading, searching, summarising, mechanical edits and scripted browser runs. It is not for design or debugging. Keep its context under 100K, where the price tier jumps.
- **Effort:**
  - `medium` is the efficient default for Opus and Sonnet in agentic coding.
  - `high` is for judgement-heavy work.
  - `xhigh` is for the hardest problems.
  - Avoid `max`: Anthropic's own run scored below `xhigh` because of over-spawning and out-of-scope edits.
  - Lower effort on a newer model often beats higher effort on an older one. Measure before raising it.

## Role cards

### Lead (the main session)
- **Model and effort:** opus, high. The founder may pick Fable for a session of hard product or architecture thinking; that is rare.
- **Owns:** the outcome, priorities, high-level plans, routing, the decisions log, QC checkpoints, founder dialogue, state files.
- **Does not:** implement, read large code areas, run long debugging sessions, or decompose tasks in detail.
- **Anti-patterns:**
  - Doing a scout's job "because it's quick". Three quick reads become thirty.
  - Accepting a report without evidence.
  - Letting its context grow without rolling over.

### Planner (`planner`)
- **Model and effort:** opus, high. Throwaway, one per planning job. Resume it only to amend the plan it just wrote.
- **Input:** the outcome, the decisions and the constraints (authoritative), pointers to code and specs, and the framework or format to use.
- **Output:** plan and task files on disk, plus a report of 400 words or fewer covering what it produced, its assumptions, and the questions only the lead or founder can answer.
- **Rules:** acceptance criteria say whether a command or a person checks them; boundaries are explicit; nothing is invented that the founder must decide.

### Scout (`scout`)
- **Model and effort:** haiku, medium (high for subtle questions). Read-only. Throwaway.
- **Good for:** where is X, how does Y work, inventories, diffs between branches, summarising logs, web and doc research, quick comparisons.
- **Report:** conclusions with `path:line` evidence, with verified and inferred claims marked apart, in 400 words or fewer unless asked otherwise.
- **Caveat:** Haiku can be confidently wrong. The lead spot-checks any claim that changes a decision.

### Worker (`worker`)
- **Model and effort:** haiku, high. Throwaway.
- **Good for:** renames, moves, codemods, bulk find/replace, import fixes, dependency bumps with no API changes, doc sweeps, data reformatting.
- **Gate:** a command proves it (typecheck, tests, grep counts, before/after file counts).
- **Escalate to a builder** when cases need behavioural judgement. The worker stops and lists them; it does not guess.

### Builder (`builder`)
- **Model and effort:** sonnet. Medium by default; high for judgement tasks (UI/UX, public API or schema shape, prompts and copy, tricky algorithms, security, data migrations).
- **Lifecycle:** throwaway per task. Resumed for fixes to its own task. Retired on acceptance.
- **Done means:** the acceptance criteria are verified by running them. Lint and typecheck are clean. UI work has screenshots that the builder itself has compared against the spec. Tests follow `testing.md`.
- **Stops and reports** when the brief is wrong or an architectural choice is needed. It does not improvise architecture.

### Debugger (`debugger`)
- **Model and effort:** sonnet, high, escalating to opus, xhigh (with `model`/`effort` overrides and a fresh, synthesized brief).
- **Method:** reproduce, then hypothesise, then test, then fix the root cause, then verify, and keep a log of each hypothesis. No symptom patches, and no disabling or loosening of tests.
- **Escalate when:** 2–3 hypotheses have failed, fixing A breaks B, the cause crosses subsystems, or there is no progress for a long stretch.
- **Fresh eyes are the point.** An escalated debugger gets what was tried and observed, not the previous transcript.

### Reviewer (`reviewer`)
- **Model and effort:** opus, medium (high for risky or judgement-heavy landings). Fresh context. Never the author.
- **Does:** re-runs the acceptance itself; reads the diff for correctness, edge cases, security, data integrity, scope creep and conventions; judges whether the tests are worth having; checks screenshots against the spec and rubric.
- **Verdict:** `ACCEPT`, or `CHANGES` with ranked findings, each carrying evidence and a concrete fix. It skips style nitpicks that don't matter.
- **Why a different model from the builder:** diversity catches more defects than self-review, and a review costs a fraction of the implementation.

### QA (`qa`)
- **Model and effort:** sonnet, medium. **Durable (`memory: project`).** For a purely scripted run (executing a written checklist or the E2E suite and reporting), invoke it with `model: haiku`, effort high.
- **Does:** drives the real UI the way the target user would; runs the critical journeys and exploratory sessions; captures screenshots; maintains the E2E suite; reports defects with severity, repro steps, expected vs actual, and a screenshot, with UX friction listed separately.
- **Memory:** how to start, seed and log in; the stable selectors; known flaky areas; persona notes. No run results.
