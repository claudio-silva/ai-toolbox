---
name: project-memory
description: "Keep a project's long-term memory in its repository as a live, pruned decision tracker instead of agent-private memory. Use before planning work or architectural changes (to read the project's decisions); when making or recording a decision that constrains future work; when storing any other long-term project knowledge (conventions, gotchas, environment notes); when reviewing decisions made during unattended work; and when a project's decision records are missing, bloated, stale or disorganized and need cleanup."
---

# Project memory

Project memory is a **live tracking system**, not a history. It keeps only what is highly relevant to
current and future development. Stale entries are not harmless: they cost context and can contradict
ongoing work. Git history is the archive; the files below describe the present.

## No sideband memory

Never store long-term project knowledge in agent-private memory (Claude Code auto memory,
`~/.claude/projects/*/memory`, Codex memories, or similar). Other developers do not have it, so their
results would differ, and nobody can see what it is doing to the work. Private memory is acceptable
only for scratch notes during an ongoing milestone; discard them when it ends.

## Where knowledge goes

Put each piece of knowledge where the next developer or agent will find it:

| Knowledge | Place |
| --- | --- |
| Explains specific code: a workaround, a third-party API quirk, a non-obvious constraint | A code comment at that code |
| Applies to everyone working on the project: commands, conventions, environment, gotchas | The project's `AGENTS.md`, or a document it links to |
| A requirement or product behaviour the user asked for | The project's spec or plan documents |
| A choice between alternatives that constrains future work | The decision tracker (below) |

Apply the same discipline to all of these: when you notice something outdated, fix or remove it.

## Scope: which decision system to use

Before creating or editing any decision file, check what the project already uses:

1. The project's `AGENTS.md` names a decision system or file locations: follow it.
2. The project already keeps decisions in another format or tool (for example an existing
   `docs/adr/` folder with its own numbering, or files managed by a planning framework): follow
   that system and do not create the files below. The principles in this skill (what qualifies,
   live tracking, pruning) still apply within that system's format.
3. Otherwise use the default system below.

## Default system

| Role | File | Content |
| --- | --- | --- |
| Buffer | `DECISIONS.md` (project root) | Decisions not yet reviewed by the user |
| Tracker | `docs/ADRs.md` | Index of the decisions that govern current and future work |
| Body | `docs/ADRs/<ID>-<slug>.md` | Full record, only when one line of rationale is not enough |

- Create each file only when its first entry is needed. Do not scaffold empty files.
- If a project uses different locations, they must be stated in its `AGENTS.md`.
- Timestamps use `YYYY-MM-DD hh:mm`, local time.

### What qualifies as a decision

Code shows *what* was decided. What gets lost is *why*, and which alternatives were rejected. Record a
decision only if all of these hold:

- It constrains future work.
- A reasonable developer could have chosen differently, or would be tempted to undo it.
- Its reasoning (why it was made, what was rejected and why) would be lost otherwise.

Do not record:

- low-level implementation details;
- trivial or easily reversible choices;
- the steps of the current task;
- details of content and presentation (copy, layout, styling) unless they follow a rule that
  constrains future work;
- knowledge that belongs elsewhere according to "Where knowledge goes".

### Buffer: `DECISIONS.md`

The buffer holds decisions the user has not reviewed yet.

- **Who writes it:** only the main agent (the one talking to the user). Subagents list their
  decisions in their final report; the main agent records the ones that qualify. This avoids
  concurrent writes.
- **What goes in:** qualifying decisions made without the user's confirmation, typically during
  unattended work. Decisions the user makes or confirms in conversation skip the buffer and go
  straight to the tracker.
- **Format:**
  ```markdown
  # Decisions awaiting review

  | Timestamp | Decision | Why | Waiting for |
  | --- | --- | --- | --- |
  | 2026-11-17 14:05 | One line | One line | |
  ```
  No IDs. Leave "Waiting for" empty unless the entry is deferred (see below).
- **Resolving an entry:** each entry ends in one of these outcomes:
  * **promote** it to the tracker;
  * **accept and drop** it (it is fine, but not worth tracking);
  * **rework** the implementation, then drop it or promote the revised decision;
  * **defer** it, when it cannot be settled yet (for example it needs a real-device test or a
    further step). Fill in "Waiting for" with what will settle it.

  Remove each entry once it is resolved. The buffer should tend to become empty as soon as
  possible, but deferred entries legitimately stay until what they wait for happens.

#### Reviewing the buffer

The user's attention is the scarce resource: bring them only what needs their judgment.

1. **Triage on your own first.** Without asking the user:
   * drop entries that no longer apply, or that turn out not to qualify;
   * settle entries you can verify yourself (a test passes, a measurement or the documentation
     confirms the choice, an accepted decision already covers it): promote or drop them;
   * defer entries that are waiting for something, or revisit deferred ones whose wait is over.
2. **Bring the rest to the user.** What remains are judgment calls: product or user-visible
   choices, choices that are hard to reverse, and choices you were not confident about. Present
   them as one compact list, each with your recommended outcome and a one-line reason, so the user
   can accept all recommendations at once and discuss only the exceptions.
3. **Pick the moment.** Review at a natural pause: the end of a task or milestone, or when the user
   returns to unattended work. Never interrupt more pressing work for it, and let the user postpone
   it; the entries simply stay. The exception is an entry the current work depends on: raise it
   when it matters.

### Tracker: `docs/ADRs.md`

```markdown
# Architecture decisions

| ID | Date | Decision | Rationale |
| --- | --- | --- | --- |
| ADR01 | 2026-11-17 | One line | One line |
```

- **When to read it:** before planning work or making architectural changes. Open a body only when
  its decision is relevant to the task.
- **IDs:** `ADR01` to `ADR99`, never reused. The two-digit limit is deliberate: reaching it means
  the tracker is bloated and must be consolidated, not extended.
- **Bodies** (`docs/ADRs/ADR01-short-slug.md`) only when a decision needs more than one line of
  rationale. Sections: Status (`proposed` or `accepted`), Date, Context, Decision, Consequences,
  Alternatives considered, plus others if needed. Keep the rejected alternatives while the decision
  stands, so they are not proposed again. Keep bodies concise.
- **Contradicting a decision:** if a task requires going against an accepted decision, ask the user
  before proceeding. If they agree, update the tracker in the same change.

### Maintaining the tracker

Every time you add or change an entry, review the whole index and:

- delete decisions that were superseded, reverted, or no longer apply, together with their bodies;
  never leave "superseded by" entries;
- rewrite a decision in place when a later one changes part of it, instead of adding a new entry;
- merge redundant entries;
- move knowledge that is not a decision to where it belongs ("Where knowledge goes");
- resolve `proposed` entries only when the information to settle them is available. Otherwise leave
  them as they are; never accept or delete a decision just to tidy the list.

Keep the tracker as short as possible, but no shorter: every entry must earn its place, and a
decision that still constrains the work stays no matter how long the list is. Never prune a valid
decision to shorten the list.

## Normalizing a project's decisions

When you notice that a project's decisions are unmanaged or poorly managed, propose a cleanup
proactively; do not wait to be asked. Signs:

- a buffer that only grows: many entries, old entries, entries with statuses instead of being
  resolved;
- superseded, reverted or contradictory entries kept alongside current ones;
- decisions mixed with requirements, third-party facts, tuning values or environment notes;
- long-lived `proposed` entries;
- inconsistent formats, or decision records with no index;
- decisions scattered across plans, READMEs or other documents.

Procedure:

1. Tell the user what you found, with examples, and propose a plan: what will be promoted, merged,
   rewritten, moved elsewhere, or deleted. Normalization deletes and rewrites documentation, so do
   not carry it out without the user's approval.
2. Make sure the current files are committed, so git history preserves what you delete.
3. Apply the plan. Entries whose fate needs the user's judgment go to the buffer, or are asked about
   directly.
4. In a project that uses another decision system (see Scope), clean up within that system's format
   instead of converting it.
5. Report the result: entries before and after, and where moved knowledge went.
