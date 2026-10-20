# Planning: the crew standard method

Reader: the lead. Read when the founder brainstorms, defines requirements, or plans a project, a roadmap or the next milestone; when the work needs more than one independently verifiable change; and when choosing a framework.

## From idea to plan

The founder brings an idea, a wish list, a PRD, a spec, or "what's next?". You turn it into a plan the founder confirms. Building starts only after that.

1. **Collect what exists.** Read the state file (vision, roadmap, milestones, decisions log) and any document the founder points to. A PRD or spec the founder wrote is an input to the plan: quote it, link it, never silently rewrite it.
2. **Restate the outcome** in the user's terms, in one or two sentences, and check it with the founder. Everything else follows from it.
3. **Brainstorm options** where the path is open. Before presenting options, consult the advisor (its brief states them without your preference). Present each choice with `AskUserQuestion`, your recommendation as the first option, and the advisor's view in the option description when it differs.
4. **Vision and roadmap.** When the conversation changes the vision or the roadmap, consult the advisor, then update the state file. A milestone on the roadmap is an outcome the founder can see, sized to one plan (one or more stages).
5. **Draft the plan** (the sections below), filling every answer the code, the documents or a scout can give. What only the founder can settle goes into one batch (`reference/founder.md`).
6. **Confirm.** Show the founder the outcome line, what is out of scope, and the open bets. Their confirmation of the plan's outcome and scope is a founder-reserved decision: do not decompose before it.
7. Journal it: `.crew/bin/crew journal "Agreed plan <slug> with the founder"`.

## Framework selection

1. If `CREW.md` names a workflow framework, use it.
2. Otherwise, if a planning or implementation framework skill is installed, ask once, in the up-front founder batch: "Use <framework> or Crew standard?" Record the answer as the Workflow line in `CREW.md`.
3. Otherwise use Crew standard (this file, the planner definition and `reference/execution.md`).

With an external framework, crew still owns roles, routing, briefs, review, QC, the journal and the queue. The framework decides what and when, and its tracker replaces the crew index. Default role mapping (record it in `CREW.md` only where it differs):

| Framework role | Crew role |
|---|---|
| implementer | builder |
| task reviewer | reviewer |
| final review | reviewer, plus a lead QC checkpoint |

## Where the plan lives

At `.crew/plans/<slug>.md`, unless `CREW.md` names a project location. You write it with the founder. Consult the advisor at its triggers (writing the vision or roadmap, planning a milestone, a decision costly to reverse).

## What a plan must answer

1. **What does someone see when this works?** The observable outcome, in the user's terms. It is the most valuable line in a plan.
2. **How would we know it worked?** For each check: a command or a person.
3. **What has to be true that nobody has checked?** Distinguish a documented third-party guarantee from something observed once and assumed general.
4. **What is deliberately out of scope?**
5. **Where does it live?** Files, modules, surfaces; what to read first.
6. **What is already decided?** Keep decisions distinct from open bets: "we use Postgres" is a decision; "Postgres will handle this load" is a bet.
7. **What has to happen before what, and why?** Contracts and vocabulary before their consumers; checks others rely on early.
8. **Where is the judgement?** Copy, prompts, public interfaces, thresholds, UI and interaction design.

Then answer once: **is the change proportionate to the outcome?**

## The split

What only the founder can settle belongs in the plan. What only the codebase can settle belongs in the tasks.

The plan does not cut tasks. A sketch under a heading "How this might decompose (non-binding)" is allowed; the planner treats it as input, not instruction.

## Name surfaces, not edits

Point at the surfaces that change (a module, a route, a component, a table) and give anchors by surrounding text or symbol names, not line numbers.

## Groupings and constraints

Mark each phase or group as one of:
- a **coherence grouping**: the planner may cut tasks across it;
- a **hard boundary**: nothing after it starts until everything before it is accepted. State why.

Constraint vocabulary, for the planner to honour: *must not be split*, *must not be merged*, *must precede because …*.

## Stages

- Cover the whole ambition, not just the first stage.
- Mark staging points as hard boundaries, with their reason.
- Write later stages at lower resolution, and say why (what the earlier stage must teach first).
- Each stage delivers something usable on its own.

## The plan says nothing about the run

No branch names, worktrees, models or agent choices in the plan. Those are execution decisions (`reference/execution.md`).

## Then

1. Commit nothing yet; the baseline commit happens when the set starts (`reference/execution.md`).
2. Brief the planner (template in `reference/briefs.md`).
3. If the planner returns founder-only gaps, add them to the founder batch (`reference/founder.md`). When answered, resume the same planner with the answers; this counts toward its 5 follow-ups.
4. Read the planner's report and the index (not every spec). Check the task list against the plan's outcome, and the "least likely to be sized correctly" task against its spec.
