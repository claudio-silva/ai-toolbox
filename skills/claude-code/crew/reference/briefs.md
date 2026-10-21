# Brief and report templates

A brief is the agent's whole world. A throwaway agent knows only what the brief and the files it points to contain. Write it so a capable engineer could start without asking anything.

Every Agent call's `description` starts with the task id when there is one ("T03 autosave conflict banner"); the journal and the dashboard show it. Give every agent you may resume a `name`.

## Task dispatch (builder / worker)

The task spec carries Objective, Read first, Design, Steps, Acceptance and Do not. The dispatch points at it and adds what the spec cannot know.

```
TASK T<NN> <slug>. Spec: .crew/tasks/<plan-slug>/<NN>-<slug>.md — read it first; its Design is settled, its Do not is a hard boundary.
FLAGS: <none | judgement | cross-cutting | discovery>
FACTS (from the index, the ones this task needs):
- <fact>
KNOWN DEFECTS (open entries in the set's defects.md and .crew/defects.md on this task's surfaces, or "none"): known and scheduled;
don't fix them, don't chase them; if one blocks your work or causes a failure you see, report it under OPEN.
- D<n> <symptom> · where: <surface>
PROJECT RULES: AGENTS.md / CLAUDE.md, docs/CREW.md.

VERIFY BY
- Dev server: <command> → <URL>. Seed and log in: <how>.
- Worktree: <"none, work in <the lead's checkout>; do not commit" | "you are in a worktree at <path>; run .crew/bin/crew worktree setup first; commit once as T<NN> <slug>: <summary>">
- Screenshots: .crew/task-data/T<NN>-<slug>/screenshots/  (output beyond the report cap: .crew/task-data/T<NN>-<slug>/reports/ and logs/)

REPORT (≤ 300 words; the first line is the status keyword)
STATUS: DONE | PARTIAL | BLOCKED
CHANGED: every file path, one per line
EVIDENCE: each Acceptance command and its result line; screenshot paths
DEMONSTRATED FAILURES: for each new check, what it said when you broke what it guards
DEVIATIONS & DECISIONS: what differs from the spec, and why
FACTS: one line each, for later tasks (names, paths, behaviours you established)
OPEN: risks, follow-ups, questions for the lead
```

For `judgement` tasks, add a line naming the judgement ("the judgement here is the review-card layout and wording; follow UI spec §6"), so both builder and reviewer aim at it. For `discovery` tasks, add: "On a failing criterion, first decide: code wrong or premise wrong? On a false premise, record what you observed and stop."

## Review brief (reviewer)

```
REVIEW T<NN> <slug>. You did not write this code. Be independent.
SPEC: <spec path>; FLAGS: <flags>
WORKTREE: <none | path — run every command in it with `cd <path> && <cmd>` or `git -C <path>`; screenshots are under <path>/.crew/task-data/>
CHANGES: <commit or diff command>; builder report: <path or pasted ≤300 words>
SCREENSHOTS: <paths>; UI spec: <path §>
KNOWN DEFECTS: <open entries in the set's defects.md and .crew/defects.md on these surfaces, or "none"> — already logged; not findings.
PREVIOUS FINDINGS: <for a re-review: the findings sent back, or "none">
RE-REVIEW SCOPE: <first review: "complete — list every finding now; later rounds check only the fixes" |
       re-review: "only PREVIOUS FINDINGS and the fix diff <command>; a new finding outside it only if high
       severity, otherwise list it under DEFERRABLE">
CHECK: re-run every Acceptance command yourself; check every `Detects:` clause is actually exercised;
       check demonstrated failures for new checks; correctness & edge cases; security & data integrity;
       scope creep; conventions; test value (reject tests that catch nothing real); UX vs spec + rubric.
       cross-cutting: verify every Design invariant across the codebase, not only the diff.
VERDICT (≤ 400 words; the first line is ACCEPT or CHANGES): findings ranked by severity (high / medium / low),
       each with evidence, a concrete fix, LEAF or LOAD-BEARING (leaf: nothing pending builds on it and it fails
       safely — no data loss, security, crash on a main path, contract change or bad test), and whether the work
       is wrong (fix it) or the premise is false (stop and re-plan). CHANGES when a load-bearing or high finding
       exists; leaf findings alone give ACCEPT with them listed under DEFERRABLE.
```

## Final review brief (reviewer, at set close)

```
FINAL REVIEW of task set <plan-slug>. You did not write this code.
INDEX: .crew/tasks/<plan-slug>/index.md — Outcome: "<outcome line>"; Not covered: "<line, or none>"
PLAN: <plan path> — its outcome: "<the plan's outcome line, quoted>"
RANGE: <base>..crew/<plan-slug>
CHECK: the Outcome against the running app and the commands, not against the reports.
REPORT (≤ 400 words; the first line is ACCEPT or CHANGES):
  (a) does this set's scope hold — the index Outcome, end to end?
  (b) what does the plan's outcome still lack? (quote it)
  FOLLOW-UP TASKS: one line each, needed for (a); (b) items are for the next stage.
```

## Debug escalation brief (debugger, fresh)

```
SYMPTOM: <exact failure: command + output tail / steps + observed vs expected>
REPRO: <shortest known reproduction>
TRIED (and result): 1) <hypothesis → change → outcome> 2) … (synthesized; no transcripts)
KNOWN FACTS / CONSTRAINTS: <…>
DONE WHEN: root cause identified with evidence; minimal fix; original failure + nearby critical tests pass.
STOP AND REPORT after 3 failed hypotheses, with what is now known.
If the evidence shows the task's premise is false, stop and report it as a premise failure.
REPORT: root cause · evidence · fix · verification output · residual risk.
```

## QA brief (qa)

```
MODE: critical-journeys | exploratory | scripted (<checklist path>)
PERSONA: <target user, e.g. "a 70-year-old novelist who knows Word, not tech">
SCOPE: <journeys/areas>; spec: <path §>; build/commit under test: <ref>
SETUP: (from your MEMORY.md) + <anything new>
KNOWN DEFECTS: <open entries in the set's defects.md and .crew/defects.md for this scope, or "none"> — already logged; report one only if it got worse.
OUTPUT: defects (severity · leaf or load-bearing · repro · expected/actual · screenshot) and UX friction (separately);
        screenshots of key states in .crew/task-data/qa-<YYYY-MM-DD>-<mode>/screenshots/;
        update MEMORY.md only with durable how-to facts.
REPORT ≤ 400 words + the files; the first line is the status keyword.
```

## Planning brief (planner)

```
PLAN: <plan path> (and its satellite documents: <paths>)
OUTCOME: <what someone sees when this works>
DECISIONS (authoritative): <…>    CONSTRAINTS / NON-GOALS: <…>
METHOD: crew standard (your definition) | <named framework — follow it, keep the acceptance rules>
OUTPUT: .crew/tasks/<plan-slug>/ (index.md from .crew/templates/index.md; NN-<slug>.md from .crew/templates/task.md)
RETURN (≤ 400 words; the first line is the status keyword):
  founder-only gaps (if any, return them before writing specs and stop);
  proposals, each with its source;
  the task list with flags, one line each;
  what this stage delivers and what it does not;
  the task least likely to be sized correctly.
```

## Advisor brief (advisor)

```
QUESTION: <the decision to make, in one or two sentences>
CONTEXT: <vision, persona, constraints, known facts; paths to read>
OPTIONS: <each option stated neutrally — no preference, no ranking>
WHAT I NEED: your recommendation; its risks; what would change your mind; any better option not listed.
REPORT ≤ 400 words; the first line is RECOMMENDATION: <option>.
```

## Lead → founder milestone report

```
<Milestone> — <one-line verdict>
What works now: <bullets> + <2–4 screenshots>
Decisions I took: <bullets with one-line why>
Defaults I took (override?): <"Decided X because Y; override?" per item, or "none">
Risks / known gaps: <bullets, including the low defects moved to the next set>
Next: <next milestone/stage, its size in tasks>
Questions for you: <the batch, asked next with AskUserQuestion, or "none">
```
