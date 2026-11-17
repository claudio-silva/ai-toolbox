# project-memory

Keeps a project's long-term memory in its repository, as a live decision tracker that agents prune as they go, instead of in agent-private memory that other developers never see.

Agents left to themselves accumulate noise: decision logs that only grow, superseded entries kept beside current ones, third-party quirks and UI details filed as "decisions", and private memories nobody can inspect. This skill gives them one set of rules for what to record, where, and when to remove it.

## What it does

- **No sideband memory:** long-term knowledge goes in the repository, so every developer and agent works from the same information.
- **Knowledge in the right place:** code comments for code-specific reasons, `AGENTS.md` for project conventions, specs for requirements, the tracker only for decisions that constrain future work.
- **A buffer for unreviewed decisions** (`DECISIONS.md`): filled during unattended work, reviewed with the user, and emptied as entries are resolved.
- **A live tracker** (`docs/ADRs.md` plus optional bodies in `docs/ADRs/`): rewritten in place, pruned on every change, capped at 99 IDs as a bloat alarm.
- **Normalization:** when a project's decision records are messy, the agent proposes a cleanup and applies it after approval.
- **Defers to existing systems:** a project that names its own decision system, or already uses one, keeps it.

## Install

```sh
aitools install @gh/claudio-silva/ai-toolbox project-memory
npx skills add claudio-silva/ai-toolbox --skill project-memory   # alternative
```

All platforms. To make agents load it reliably, reference it from your global `AGENTS.md` (or equivalent), for example: "When you need to read, record or maintain project decisions or other long-term project knowledge, load the `project-memory` skill. If it is not available, warn the user and stop." See the [repository README](../../README.md).

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The rules and procedures |
