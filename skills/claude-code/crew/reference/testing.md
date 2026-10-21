# Testing and QC policy: quality over quantity

A test suite exists to catch real defects before users do, cheaply and reliably. A large suite is not a better one: every test costs writing time, run time, maintenance, and trust once it turns flaky.

## The value test

Before writing or accepting a test, answer: **"Which real defect would this catch that nothing else in the suite (or the type checker) would?"** If there is no good answer, don't write it. Reviewers apply this question to every new test.

## What to test

1. **The critical user journeys, end to end, in a real browser against the real app.** Keep them between 5 and 15 per product, deterministic (seeded data, no sleeps, stable selectors such as roles, labels and test ids) and fast. They are listed in `CREW.md`, and any change touching their area runs them.
2. **Data cores, using golden or round-trip tests over real data.** This covers parsers, serializers, import and export, sync and merge, diffs and anchoring, money, dates and time zones, and permissions. Prefer "run over every real fixture and compare" to hand-written micro-cases.
3. **Integration tests where business rules and integrity live:** API endpoints enforcing permissions, invariants, transactions, locks and conflict handling.
4. **A regression test for an escaped bug,** at the cheapest level that reproduces it, and only when the bug could plausibly come back.

## What not to test

- Trivial code: getters, pass-through wrappers, constants, framework glue.
- Mock-heavy unit tests whose mocks encode the implementation. When the implementation changes, they break without catching anything.
- Snapshot tests of UI markup or styling.
- Third-party libraries' behaviour.
- Anything written to raise coverage. Coverage is not a goal.

## E2E hygiene

- **One journey per test,** named after the user goal ("author accepts a suggestion and it persists").
- **Each test seeds its own data** through APIs or fixtures. Tests never depend on each other's state.
- **Flaky means broken.** Fix it or delete it within the same task. Never "retry until green".
- **Run locally before landing** and in CI on push. A slow suite gets trimmed, not tolerated.

## Interactive QA (the `qa` agent)

- **Critical-journeys run:** at the end of every stage or milestone, and before deploys.
- **Exploratory session:** after major UI changes and at milestone ends, done *as the persona*:
  - Can they discover how to do the task?
  - Do errors explain themselves?
  - Is anything slow, jumpy or lost on reload?
  - Does it work at the usual window sizes, keyboard only, and in the dark theme?
- **Output:** the defects (severity, leaf or load-bearing, repro, expected/actual, screenshot) and the UX friction, listed separately. The lead triages each defect as for review findings: fixed now, or deferred with `crew defect` (`reference/execution.md`, "Findings: fix now or defer").

## QC checkpoints (the lead)

| When | Who produces | What the lead looks at | Decision |
|---|---|---|---|
| Each UI landing | builder screenshots + reviewer verdict | 1–3 key screenshots vs spec | accept / polish |
| End of stage or milestone | QA exploratory + journeys | the 5 key screenshots, the defect list, journey results | accept / fix list |
| Before production deploy | QA full journeys | pass/fail summary, any new screenshots | ask the founder for go |

When the app needs interacting with and screenshots alone won't show it, delegate to QA rather than driving it yourself.

## Screenshot review rubric (ergonomics)

Judge in this order, and send work back on any clear failure:
1. **Purpose:** is the main action obvious within 3 seconds? Is there exactly one primary action per area?
2. **Hierarchy:** do size, weight and contrast follow importance? Does nothing compete with the content?
3. **Alignment and spacing:** a consistent grid and rhythm, no cramped clusters, no orphaned elements.
4. **Legibility:** text size and contrast are fine for the persona (older users need larger text), and line lengths are comfortable.
5. **Language:** labels are concrete, in the user's language, with no jargon, and consistent across the app.
6. **States:** empty, loading, error, long content and many items each look intentional.
7. **Consistency with the spec and mockups:** "similar in spirit" is fine; drift without reason is not.

"Works but clumsy" fails this rubric. Polish is part of done.
