---
name: ultracompact-prompt
description: Shrink a rules-or-procedure prompt (system prompt, custom instructions, skill body) to the smallest wording that still behaves identically, verified by scored A/B runs on cheap subagents.
disable-model-invocation: true
---

# Ultracompact prompt

Compress an operational prompt without losing behaviour, and prove it.

## Applies to

Prompts whose compliance is **objectively checkable**: rule sets, decision procedures, output formats, tool-use policies, conventions.

Not for tone, persona or taste prompts. Compression there cannot be scored, only guessed at.

## Method

1. **Inventory.** Split the prompt into atomic rules. For each, note what triggers it, what it asserts, and where it came from: observed behaviour, assumption, or copied folklore. Mark every unverified claim. Those are candidates for deletion, not compression.
2. **Build the battery before compressing.** 15-25 scenarios with objectively correct answers, covering every rule at least once, common and rare cases labelled separately. Add 2-4 comprehension questions ("what does X do?") that expose silent misreadings the output alone would hide.
3. **Baseline.** Score the current prompt: 3 runs. Sampling makes one run an anecdote. Ask for exact output, never for an explanation of intent.
4. **Prune by frequency x harm.** Delete rules whose case is rare *and* whose absence degrades gracefully (a dead link, not a wrong action). Keep whatever fires daily or fails destructively. Nearly all the savings are here.
5. **Re-notate, do not re-encode.** Use notation the model has deep priors for: decision tables, switch/case, substitution lists, EBNF. Never invent glyphs or private opcodes. Rare symbols fragment into more tokens *and* strip the priors that make terse syntax legible.
6. **Score and iterate.** 3 runs per variant. Change ONE thing between variants or the result cannot be attributed. Stop when two consecutive variants score full marks; further rounds fit noise.

## Scoring loop

Agent tool: `subagent_type: general-purpose`, `model: haiku`, `effort: low`, one agent per run, all runs launched in a single message so they go in parallel.

Give each agent the candidate prompt verbatim, the scenarios, and: "Output only the exact text you would emit, numbered. Do not use tools."

Score against ground truth yourself. Attribute every failure to a specific deleted or reworded rule.

Cost is roughly 20k tokens per run, so ~60k per variant. State that before starting.

## Report

- Each variant with char count and per-run scores
- Each failure traced to the rule that caused it
- Every rule in the final prompt traced to evidence; flag whatever is still inferred
- Confounds: if the prompt *and* the test changed together, say the result is unattributed

## Pitfalls

- **Char count is not token count.** Punctuation, digits, arrows and %-escapes tokenize worse than plain words, so a 40% character cut may be a 15% token cut. Never quote token savings you did not measure.
- **Cached prompts make tokens cheap.** The scarce resource is instruction budget, attention competing against every other rule. Prune for that, not for bytes.
- **Scaffolding is temporary.** Numbered steps and STOP markers help while rules are ambiguous, then become dead weight once the rules are right. Test removing them.
- **A rule the model already follows by prior is pure cost.** Test deleting it before keeping it.

Full worked example: `references/method.md`.
