# Worked example: Paseo file-link rules

A real compression run, kept because every number in it was measured rather than estimated.

## Problem

A client renders agent output in a GUI. Which markdown forms become clickable file links was undocumented, so the agent emitted broken links. The rules had to be discovered by testing, then written small enough to live in a system prompt.

## Discovery phase

~60 candidate link forms were rendered and clicked by the user, one table per round, each row a single variable. Results overturned three confident assumptions:

- `file://` links worked for files but failed with a line number appended
- percent-escapes (`%20`, `%23`, `%28`) are inert inside code spans; they render as literal text
- a raw unbalanced `(` breaks a markdown link but works fine in a code span

Lesson: every rule in a prompt that was never observed is a guess wearing a rule's clothing. Test it or delete it.

## Compression phase

| Version | Form | Chars | Score (3 runs) |
|---|---|---:|---|
| v7 | prose rules | 1065 | 19/20 |
| v9 | numbered procedure with STOP guards | 880 | 19, 20, 19 |
| v10 | aggressive prune | 432 | 17, 18, 19 |
| v11 | v10 + one restored rule | 492 | 20, 20, 20 |

What each step taught:

- **Prose to procedure (v7 to v9)** removed cross-rule interference. Earlier drafts leaked encoding advice from the link form into the code-span form, producing dead output. Ordered branches with early exits made that structurally impossible.
- **Aggressive pruning (v10)** cut 50% of characters and lost 1.3 scenarios per run. The loss was concentrated in exactly one deleted rule: encoding an unbalanced paren inside a link destination.
- **Restoring that one rule (v11)** cost 60 characters and recovered full marks. The rest of the pruning was free.
- **The STOP scaffolding turned out to be the expensive part.** Once the rules themselves were unambiguous, dropping the numbered-step machinery cost nothing.

Net: 1065 to 492 characters, 54% smaller, with a *higher* measured score than the original.

## Method notes that generalise

**Self-reported clarity is weak evidence.** Asking an agent "is anything unclear?" surfaced real ambiguities, but it also passed prompts that then produced wrong output. Scoring actual emissions caught defects the agent did not know it had. Run both; trust the second.

**One run is an anecdote.** A single comparison showed one version failing an item that, over three runs, failed equally in both versions. That nearly became a false conclusion in the write-up.

**Watch for confounds.** When a prompt is reworded *and* the scenario is clarified in the same round, an improved score cannot be credited to either. Change one thing at a time, and say so when you did not.

**Ambiguous test items masquerade as prompt defects.** One scenario asked about a path "never listed or read" while naming it in the prompt text. Agents reasonably counted it as seen. The fix belonged in the battery, not the prompt.

**Invented opcodes are a trap.** A private compressed DSL (`LNK`, custom glyphs) costs more tokens than the English it replaces, because BPE gives single tokens to frequent words and fragments rare symbols. What works is notation with mass in the training data, used normally.

## Validated is not finished

A battery only covers cases someone thought to imagine. The rule set above scored 20/20 on three consecutive runs, and within minutes of shipping it the author emitted two broken links in ordinary use, plus hit two client behaviours the battery had never probed.

The two failures were different in kind, and the distinction matters:

- **Compliance failure.** A relative path was used for a file outside the workspace. A rule covering exactly that existed, had just been written, and was in context. It was still ignored. More testing would not have helped; the rule needed to be somewhere the agent actually reads at emission time.
- **Rule gap.** A directory path with a trailing slash opened the OS file manager, and a slash command auto-linkified. Neither form appeared anywhere in the battery, so no rule existed to follow.

So treat a scored prompt as provisional:

- Log every real-world failure back into the battery, then re-score. The battery grows by use, not by design.
- Separate gaps from compliance failures before reacting. A gap calls for a new rule; a compliance failure calls for better placement or stronger wording of one that already exists.
- Expect the long tail to arrive early. Three defects surfaced in the first five minutes of real output, after a battery built from imagination had returned a perfect score three times.

### Postscript: how the fix caused a regression

Folding the three newly discovered behaviours into the prompt took one edit. That edit also restructured the file-handling line, and in doing so silently dropped an unrelated rule that had been there all along: images require the link form, because a code span never links them.

It failed 3/3 runs. Restoring one clause returned the prompt to 24/24 across three runs.

This is the method's own rule — change one thing per variant — broken by the person who wrote it, one message after writing it. Merging an addition with a restructuring hides a regression inside apparent progress, and only the battery caught it. Re-score after every edit, including edits that look like pure addition.

Final sizes for the worked example: 1065 chars (prose, 19/20) to 492 (compressed, 20/20), then back to 870 once real usage added four behaviours the battery had never imagined. Compression is real, but the rule set grows; expect to re-compress periodically rather than once.
