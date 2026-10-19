# CREW — multi-agent rules for <PROJECT>

> Instance of the `crew` skill (`~/.claude/skills/crew`). **This file wins over the skill's defaults for this project.** Keep it short; change it when reality teaches you something, and log why in §8.

## 1. Roles and routing

Defaults come from the skill. Use the **Override** column only when this project needs something different, and say why.

| Role | Agent | Default model · effort | Override (why) |
|---|---|---|---|
| Lead | main session | opus · high | |
| Planner | `planner` | opus · high | |
| Scout | `scout` | haiku · medium | |
| Worker | `worker` | haiku · high | |
| Builder | `builder` | sonnet · medium, high for judgement tasks | |
| Debugger | `debugger` | sonnet · high, escalating to opus · xhigh | |
| Reviewer | `reviewer` | opus · medium | |
| QA | `qa` | sonnet · medium (haiku for scripted runs), memory: project | |

**Judgement-heavy areas in this project** (always builder at effort high, and the reviewer judges the judgement):
- <e.g. UI/UX of the editor, user-facing copy, public API/schema shape, prompts, the sync/merge algorithm>

**Framework mapping (if any):** <e.g. "Realizer Nano: rn-run implementer → builder; rn-review → reviewer; final review → reviewer + lead QC checkpoint">

## 2. Project facts every agent needs

- **Stack:** <…>
- **Run locally:** `<cmd>` → <URL>. <Single dev server? ports?>
- **Checks:** lint `<cmd>` · typecheck `<cmd>` · tests `<cmd>` · E2E `<cmd>`
- **Seed and log in for QA:** <how; test accounts; never use real user data>
- **Screenshots go to:** `<dir>` (gitignored)
- **Conventions:** see `<AGENTS.md / CLAUDE.md>`. <the 3–5 rules agents most often break here>
- **Never:** <e.g. deploy to production, touch real data, modify sibling repos, commit secrets>

## 3. Critical user journeys (E2E must cover these)

1. <journey: user goal, in the user's words>
2. <…>

(About 5–15 journeys. Any task touching one of these areas runs its E2E before it lands.)

## 4. Testing policy (project additions)

The skill's policy applies (`reference/testing.md`: quality over quantity; E2E for journeys; golden or round-trip tests over real data for data cores; integration tests where rules live; nothing trivial, mock-heavy or snapshot-based). Project additions:
- **Real-data fixtures:** <where they live and how they are used>
- <anything else>

## 5. QC checkpoints and the quality bar

- **Spec and mockups to judge against:** <paths>
- **Persona:** <who the user is; what they find hard>
- **Checkpoints:** each UI landing (1–3 screenshots); end of each stage or milestone (QA exploratory, ~5 screenshots); before each production deploy (full journeys plus the founder's go).
- **Bar:** <e.g. "familiar to Word users, calm, large text; polish is part of done">

## 6. Budget posture

<lean | balanced | quality-first>. In practice: <e.g. "balanced: reviewer on every landing except docs; QA exploratory only at milestone ends; no Fable unless the founder asks">

## 7. State and continuity

- **Entry point for every session:** `<docs/ROADMAP.md>`
- **Active plan or tracker:** `<paths>`
- **Handoff:** `<state file § / docs/HANDOFF.md>`
- **Durable agent memory:** `.claude/agent-memory/<agent>/` (commit it: yes/no)
- **Lead rollover:** at stage or milestone close, or past ~40% of the context window. Auto-compact window ≈ 400K.

## 8. Founder escalation and the crew decisions log

**Ask the founder for:** product direction and priorities, taste calls the spec can't settle, credentials and accounts, production deploys, destructive data operations, spending above the posture.

| Date | Change to the crew rules | Why |
|---|---|---|
| <date> | Initial setup from the crew skill | — |
