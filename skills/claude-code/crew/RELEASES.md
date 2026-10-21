# Crew releases

What changed in each release, newest first. The dashboard reads this file to tell you when a newer Crew is out, and shows you the entries since yours.

## 0.1.0 — 2026-10-21

The first release.

- **A team that works unattended.** The lead plans with you, then hands the work to a planner, builders, reviewers, QA and a debugger, each on the model and effort that suits its role. It decides everything that isn't yours to decide, batches its questions with defaults already applied so work never stalls, and holds your mid-session requests until the current task is accepted.
- **A standard method.** Ideas, brainstorms and PRDs become a confirmed plan, then a task set: one spec per task, each acceptance criterion with a way to check it, evidence-only statuses and a final outcome review. Each task set gets its own branch, each accepted task its own commit, and parallel builders work in their own worktrees.
- **Defects that don't hold up the work.** Reviewers and QA mark each finding as leaf or load-bearing. Leaf findings go to a defect log instead of another review round, and are fixed before the set's final review.
- **A live dashboard.** A local web page shows tasks, timing, requests, defects, compactions and the journal as they change, opens on phones and tablets with a QR code, and tells you when a newer Crew is out. Your Mac stays awake while a session runs.
- **Long sessions under control.** State lives in files, so compactions lose nothing that matters; you roll the lead over with `/crew handoff` and `/crew resume`, stop every subagent safely with `/crew stop`, and tune compaction per model with what the Compactions tab measures.

**After updating:** install Node.js 20 or later if you want the dashboard; setup tells you when it is missing.
