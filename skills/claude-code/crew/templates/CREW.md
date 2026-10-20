# CREW — multi-agent rules for <PROJECT>

> Project rules for the `crew` skill. **This file wins over the skill's defaults.** List only what differs from the defaults, plus the facts agents need. Log every change in §9.

## 1. Project facts every agent needs

- **Stack:** <…>
- **Run locally:** `<cmd>` → <URL>. <Single dev server? ports?>
- **Checks:** lint `<cmd>` · typecheck `<cmd>` · tests `<cmd>` · E2E `<cmd>`
- **Worktree setup and teardown:** `.crew/worktree/setup.sh` and `.crew/worktree/teardown.sh` (edit the scripts, not this line).
- **Seed and log in for QA:** <how; test accounts; never use real user data>
- **Conventions:** see `<AGENTS.md / CLAUDE.md>`. <the rules agents break most here>
- **Never:** <e.g. deploy to production, touch real data, modify sibling repos, commit secrets>

## 2. Critical user journeys

Between 5 and 15, in the user's words. E2E covers each one; any task touching one of these areas runs its E2E before it lands.

1. <journey: user goal, in the user's words>
2. <…>

## 3. Judgement-heavy areas

Delete this section if it adds nothing to the defaults. Tasks in these areas are flagged `judgement`: builder at effort high, and the reviewer judges the judgement.

- <e.g. UI/UX of the editor, user-facing copy, public API/schema shape, prompts, the sync/merge algorithm>

## 4. Quality bar and persona

Delete this section if it adds nothing to the defaults.

- **Spec and mockups to judge against:** <paths>
- **Persona:** <who the user is; what they find hard>
- **Bar:** <e.g. "familiar to Word users, calm, large text; polish is part of done">

## 5. Budget and advisor posture

- **Budget:** <lean | balanced | quality-first>. In practice: <e.g. "balanced: reviewer on every landing except docs; QA exploratory only at milestone ends">
- **Advisor:** <at the skill's triggers | only when the founder asks | off>

## 6. Founder-reserved additions

Delete this section if it adds nothing to the defaults. Decisions the founder keeps, beyond the skill's list:

- <e.g. "any change to pricing copy", "adding a third-party service">

## 7. Workflow and state

- **Workflow:** <crew standard | a named framework; its role mapping only where it differs from the default>
- **State file:** `<docs/ROADMAP.md>` (status, milestones, decisions log)
- **Plans:** `.crew/plans/` <or the project location>
- **Git:** <branches and commits | none>
- **Durable agent memory committed** (`.claude/agent-memory/`): <yes | no>

## 8. Overrides

Delete this section if it adds nothing to the defaults. Only the rows that differ from the skill:

| Role | Default | Override | Why |
|---|---|---|---|
| <role> | <model · effort, or rule> | <override> | <why> |

## 9. Crew decisions log

| Date | Change | Why |
|---|---|---|
| <date> | Initial setup from the crew skill | — |
