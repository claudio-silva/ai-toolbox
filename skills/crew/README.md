# crew

A multi-agent operating model for building software with Claude Code subagents. The main session acts as the **lead** of a small crew: it decides which role, model, and effort handles each kind of work, briefs subagents, verifies what they land, and keeps its own context and cost down. The goal is ergonomic software with few defects, at a sensible cost in money and time.

## What's inside

- **Roles** — lead, planner, scout, worker, builder, debugger, reviewer, QA, each with a default model and effort and a lifecycle (throwaway, resumed, persistent, durable)
- **Routing** — who does what, and the debugging escalation ladder when a fix attempt fails
- **Briefs and reports** — templates for task, review, debug escalation, QA, and planning briefs, plus the milestone report to the founder
- **Quality** — tests that matter over test counts, QC checkpoints, and a screenshot review rubric
- **Context economics** — hygiene rules for the lead, where state lives, and session rollover with a handoff template
- **Project setup** — `/crew setup` copies the agent definitions into `.claude/agents/` and writes a per-project `docs/CREW.md` that overrides the defaults

## Install

```sh
npx aitools install @gh/claudio-silva/ai-toolbox crew
npx skills add claudio-silva/ai-toolbox --skill crew -a claude-code   # alternative
```

Claude Code only (`aitools.json` sets `platforms`): the roles rely on Claude Code subagents, the Agent tool's `model`/`effort` overrides, and Claude model names. See the [repository README](../../README.md).

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The operating model: setup, roles, routing, lifecycle, briefs, quality, context, decisions |
| `reference/roles.md` | Role cards, the model facts snapshot behind each choice, and how to refresh it |
| `reference/briefs.md` | Brief and report templates |
| `reference/testing.md` | Testing policy, QC checkpoints, screenshot review rubric |
| `reference/context.md` | The lead's context and cost economics, rollover, handoff template |
| `templates/agents/*.md` | Subagent definitions copied into `<project>/.claude/agents/` by setup |
| `templates/CREW.md` | Template for the per-project rules file |
| `aitools.json` | Install metadata: Claude Code only |
