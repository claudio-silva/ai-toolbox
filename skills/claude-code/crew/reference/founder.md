# The founder: tiers, batched questions, milestones

Reader: the lead. Read before asking the founder anything, and when a task is blocked on a decision.

## The steward principle

You act on the founder's behalf and make every decision not reserved for the founder, so the crew can keep working while the founder is away. A question to the founder costs their attention and can stall the crew; ask only what the tiers below send to them, and ask it in batches.

## Three tiers

Sort anything that might need the founder into exactly one tier.

**Interrupt now** (stop and ask immediately, with `AskUserQuestion`):
- An action would be irreversible or destructive: a destructive data operation, a production deploy, a force-push, deleting a branch with unmerged work.
- Spending would exceed the budget posture in `CREW.md`.
- A security exposure or a data-loss risk is discovered.
- A required credential or account is missing.
- No unblocked work remains.

**Batch** (collect, ask later):
- The founder-reserved decisions, when they do not block all work:
  - product direction and priorities;
  - taste calls the spec cannot settle;
  - credentials and accounts;
  - production deploys;
  - destructive data operations;
  - spending above the posture;
  - the additions listed in `CREW.md` (Founder-reserved additions).
- Any question whose wrong guess would cost more than one task to redo.

**Decide and record:** everything else. Write the decision and its reason into the state file's decisions log, and journal it.

## Up-front questions

Ask every foreseeable question at the start of a project, a plan, or a milestone, before work starts. Read the plan or the request, list what only the founder can settle, and ask it as one batch. Questions found later are the exception, not the routine.

## Batching and default-taking

Questions that arise during work go to the task set's `queue.md` (`.crew/queue.md` with no set open), under "Questions for the founder", one line each:

```
- [F<n>] <date> · <question> · default taken: <X or "none, T<NN> parked"> · status: open | answered
```

- **Default-taking.** When a batched question blocks a task and a reversible default exists, take the default, record it in the entry and in the decisions log, and continue. In the batch, phrase it as "Decided <X> because <reason>; override?".
- **No reversible default:** park the blocked task (status `blocked` in the index), record "none, T<NN> parked", and continue other work.
- **Deliver the batch** when unblocked work runs out or at a milestone, whichever comes first.
- **How to ask.** Use `AskUserQuestion`: one question per decision, ordered by importance, the default as the first option. The tool takes 1 to 4 questions per call and 2 to 4 options per question (an "Other" row is added automatically), so a batch of more than 4 questions takes one call per group of 4.
- **Answers.** Set each entry's status to `answered`, record the answer in the decisions log, and act on it. An answer that overrides a default you took is a request: handle it with `reference/requests.md`.
- **Auto-closed questions.** If a dialog closes unanswered because of the founder's `askUserQuestionTimeout`, the default stands, the entry stays `open`, and it is asked again in the next batch. Continue as if the founder were away.

## The question timeout

The founder's user-level `askUserQuestionTimeout` is `10m` or unset (`/crew setup` offers `10m`). Never ask for a shorter value: a founder who is present but busy on other projects needs time to notice the question and think; a founder who is away loses nothing, because you take the recorded defaults and continue. Never wait on a question while unblocked work exists.

## Milestones

At a milestone:
1. Send the milestone report (template in `reference/briefs.md`), including the defaults you took and the open questions.
2. Ask the batch.
3. Continue to the next milestone unless the founder says otherwise.

## Journal

Log the batch when you ask it (`.crew/bin/crew journal "Asked the founder 3 questions (F4–F6)"`) and when the answers arrive (`.crew/bin/crew journal "Received answers to F4–F6"`).
