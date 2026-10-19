# Brief and report templates

A brief is the agent's whole world. A throwaway agent knows only what the brief and the files it points to contain. Write it so a capable engineer could start without asking anything.

## Task brief (builder / worker)

```
GOAL
<1–2 sentences: the outcome, in terms of what someone sees or can do.>

CONTEXT
- Project rules: AGENTS.md / CLAUDE.md, docs/CREW.md (testing + report rules).
- Read first: <path> — <why>; <path> — <why>.   (≤ 6 items; pointers, not dumps)
- Decisions already made (do not re-open): <…>
- Relevant facts the files won't tell you: <…>

BOUNDARY
- In scope: <…>
- Do NOT: <adjacent work to leave alone>, <files/areas not to touch>, <no new dependencies without asking>, <no commits/pushes unless stated>.

DONE WHEN
1. <criterion> — checked by: command `<cmd>` → <expected>
2. <criterion> — checked by: person (lead) via screenshot of <state>
3. Lint + typecheck clean (`<cmd>`); critical E2E touching this area pass (`<cmd>`).

VERIFY BY
<How to run it: dev server command/URL, test commands, seed/login, where to save screenshots.>

REPORT (≤ 300 words)
STATUS: DONE | PARTIAL | BLOCKED
CHANGED: files/areas (one line each)
EVIDENCE: commands + last lines of output; screenshot paths
DEVIATIONS & DECISIONS: what differs from the brief, and why
OPEN: risks, follow-ups, questions for the lead
```

For judgement tasks, add a line naming the judgement ("the judgement here is the review-card layout and wording; follow UI spec §6"), so both builder and reviewer aim at it.

## Review brief (reviewer)

```
REVIEW <task id/title>. You did not write this code. Be independent.
ACCEPTANCE: <the Done-when list, verbatim>
CHANGES: <commit range or diff command>; builder report: <path or pasted ≤300 words>
SCREENSHOTS: <paths>; spec: <path §>
CHECK: re-run every command criterion yourself; correctness & edge cases; security & data integrity;
       scope creep; conventions; test value (reject tests that catch nothing real); UX vs spec + rubric.
VERDICT (≤ 400 words): ACCEPT | CHANGES — findings ranked by severity, each with evidence and a concrete fix.
```

## Debug escalation brief (debugger, fresh)

```
SYMPTOM: <exact failure: command + output tail / steps + observed vs expected>
REPRO: <shortest known reproduction>
TRIED (and result): 1) <hypothesis → change → outcome> 2) … (synthesized; no transcripts)
KNOWN FACTS / CONSTRAINTS: <…>
DONE WHEN: root cause identified with evidence; minimal fix; original failure + nearby critical tests pass.
STOP AND REPORT after 3 failed hypotheses, with what is now known.
REPORT: root cause · evidence · fix · verification output · residual risk.
```

## QA brief (qa)

```
MODE: critical-journeys | exploratory | scripted (<checklist path>)
PERSONA: <target user, e.g. "a 70-year-old novelist who knows Word, not tech">
SCOPE: <journeys/areas>; spec: <path §>; build/commit under test: <ref>
SETUP: (from your MEMORY.md) + <anything new>
OUTPUT: defects (severity · repro · expected/actual · screenshot) and UX friction (separately);
        screenshots of key states in <dir>; update MEMORY.md only with durable how-to facts.
REPORT ≤ 400 words + the files.
```

## Planning brief (planner)

```
OUTCOME: <what someone sees when this works>
DECISIONS (authoritative): <…>    CONSTRAINTS / NON-GOALS: <…>
INPUTS: <plan/spec paths, code areas>   FORMAT: <framework/skill to follow, or default>
WRITE TO: <paths>
RETURN (≤ 400 words): what you produced, assumptions you made, questions only the lead/founder can answer.
```

## Lead → founder milestone report

```
<Milestone> — <one-line verdict>
What works now: <bullets> + <2–4 screenshots>
Decisions I took: <bullets with one-line why>
Risks / known gaps: <bullets>
Next: <next milestone/stage, rough size>
I need from you: <asks, or "nothing">
```
