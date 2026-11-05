# ultracompact-prompt

Shrink a rules-or-procedure prompt — a system prompt, custom instructions, a skill body — to the smallest wording that still behaves identically, and prove it with scored A/B runs instead of trusting the compression.

Invoked only by the user, as `/ultracompact-prompt`. The frontmatter sets `disable-model-invocation: true`, so the skill stays entirely out of context (description included) until you call it.

## What's inside

- **Scope test** — it applies where compliance is objectively checkable (rule sets, decision procedures, output formats, tool-use policies), and not to tone or persona prompts, where a compressed version can only be guessed at
- **Six-step method** — inventory each rule with its provenance, build the scenario battery *before* compressing, baseline, prune by frequency × harm, re-notate using formats the model has priors for, then score and iterate
- **Scoring loop** — exact subagent configuration, 3 runs per variant, one change per variant so results stay attributable
- **Pitfalls** — character count is not token count; cached prompts make tokens cheap and instruction budget the real constraint; scaffolding that helped while rules were ambiguous becomes dead weight once they are right; a rule the model already follows by prior is pure cost
- **Worked example** (`references/method.md`) — a real run compressing a client's file-link rules from 1065 to 492 characters while the measured score *rose*, then back to 870 when real usage surfaced four behaviours no battery had imagined

## Install

```sh
aitools install @gh/claudio-silva/ai-toolbox ultracompact-prompt
npx skills add claudio-silva/ai-toolbox --skill ultracompact-prompt   # alternative
```

Claude Code only (`aitools.json` sets `platforms`), because it relies on `disable-model-invocation` frontmatter and on spawning subagents for scoring. See the [repository README](../../../README.md).

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The method: scope, six steps, scoring loop, report format, pitfalls |
| `references/method.md` | Worked example with measured scores, plus the lessons from its failures |

## Why the evidence matters

Every claim in the worked example was measured, including three that contradicted confident assumptions, and two sections record mistakes made while building the skill itself: a regression introduced by merging an addition with a restructuring, and a broken link emitted minutes after the rule forbidding it was written. Those are kept deliberately — they are the parts most likely to repeat.
