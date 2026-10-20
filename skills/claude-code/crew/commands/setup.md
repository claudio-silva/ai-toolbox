# `/crew setup`

Reader: the lead. Read on `/crew setup`, or when `.crew/` is missing and the founder agrees to set up.

`<skill>` below is the skill directory (`${CLAUDE_SKILL_DIR}` in `SKILL.md`). Run every command from the project root. Setup never overwrites: for every file that already exists, show a diff and merge. Re-run it after every skill update; every step merges.

## 0. Announce, then proceed

List every project change setup is about to make (files created, files merged, settings and hooks, `.gitignore`, `.worktreeinclude`, the `CLAUDE.md` or `AGENTS.md` pointer), then carry on. Do not ask for permission: running `/crew setup` is the permission, and none of these parts is optional. The only questions setup asks are in step 1 (`git init`), step 7 (what the repo cannot answer) and step 9 (the question timeout).

## 1. Prerequisites (hard)

- **Git.** `git rev-parse --show-toplevel`. Not a repository → ask the founder whether to `git init`. If declined, set `Git: none` in `CREW.md` and skip the branch-related checks (the `.gitignore` and `git check-ignore` steps still run only when git exists).
- **`jq`.** `command -v jq`. Missing → install it:
  - macOS: `brew install jq` (no Homebrew → abort);
  - Debian or Ubuntu: `sudo apt-get install -y jq`;
  - Fedora: `sudo dnf install -y jq`;
  - Arch: `sudo pacman -S --noconfirm jq`;
  - Alpine: `sudo apk add jq`.

  A `sudo` that needs a password fails in a non-interactive shell; treat that as a failure. **On any failure, abort setup** with: "crew needs jq. Install it, then run /crew setup again." No partial setup.
- **Claude Code.** `claude --version`. Below 2.1.292 → warn that per-call effort overrides are unavailable and recommend updating; continue.

## 2. Scaffold `.crew/`

1. Copy `<skill>/scaffold/` to `<project>/.crew/`: create missing files; for existing files, diff and merge. `.crew/bin/crew` and `.crew/templates/*` are crew-owned: take the skill's version and show the diff.
2. `chmod +x .crew/bin/crew .crew/worktree/*.sh`.
3. `mkdir -p .crew/tmp .crew/task-data`.
4. **Fill `.crew/worktree/setup.sh`** when creating it. Fill only the section between `# --- project setup (edit freely) ---` and `# --- end ---`, from the repo:
   - the install command from the lockfile: `pnpm-lock.yaml` → `pnpm install --frozen-lockfile`; `package-lock.json` → `npm ci`; `yarn.lock` → `yarn install --frozen-lockfile`; `bun.lockb` → `bun install --frozen-lockfile`; `uv.lock` → `uv sync`; `poetry.lock` → `poetry install`; `Cargo.lock` → `cargo fetch`; `go.sum` → `go mod download`;
   - a copy rule for each `*.example` env file (`cp -n .env.example .env`);
   - the build step the dev server needs, if any (read the dev script in the package manifest).

   When nothing applies, leave the section empty and say so.
5. **On re-runs**, the founder's edits to both worktree scripts are kept: the sections between `# --- project setup (edit freely) ---` (in `teardown.sh`: `# --- project teardown (edit freely) ---`) and `# --- end ---` are never touched; only the crew-owned header above them is merged.

## 3. `.gitignore`

Add these lines if absent:

```
# Crew (multi-agent): scratch, task data, and the founder-facing journal and dashboard
.crew/tmp/
.crew/task-data/
.crew/journal.md
.crew/status.md
.claude/worktrees/
```

If an older blanket `.crew/` line exists, replace it with these lines and say so. Everything else in `.crew/` is committed.

## 4. Settings

Merge `<skill>/templates/settings.json` into `<project>/.claude/settings.json` (create it if missing):

- Never remove existing keys.
- Merge arrays by value: add a hook entry or an allow rule only when an identical one is absent.
- Set `worktree.baseRef` to `"head"`. If it holds another value, replace it and say so: crew requires it.
- Every hook, the `permissions.allow` rule and `worktree.baseRef` are required. The hooks include `PreCompact` and two `SessionStart` entries (`startup|resume|clear|fork` and `compact`): they are how crew identifies who compacted and keeps its rules in context (`reference/context.md`, "Compaction").
- An older `SessionStart` entry with matcher `compact` and the same command is identical: keep it, add the rest.

Do the merge with `jq` (for example `jq -s '.[0] * .[1]'` for objects, then de-duplicate the arrays), write to a temp file, then move it into place. Validate with `jq . .claude/settings.json`. If writing or validation fails, **abort setup** with the reason.

## 5. `.worktreeinclude`

If the app needs gitignored files to run (for example `.env`, `.dev.vars`), list them, one path per line, in `.worktreeinclude` at the repository root. Merge with an existing file.

## 6. Agents

Copy `<skill>/templates/agents/*.md` to `.claude/agents/`. For existing files, diff and merge: keep project-specific additions, take the skill's version of everything else.

## 7. `CREW.md`

**New:** create it from `<skill>/templates/CREW.md` at `docs/CREW.md` (or the location the project uses for agent docs), filled by reading the repo. Ask the founder, in one `AskUserQuestion` batch, only what the repo cannot answer:
- the critical user journeys;
- the persona and the quality bar;
- the budget posture and the advisor posture;
- founder-reserved additions;
- the workflow: only if a planning or implementation framework skill is installed ("Use <framework> or Crew standard?").

**Existing (migration):**
- Keep the project facts.
- Delete rows and lines identical to the skill's defaults (the full routing table, the default testing policy, the default founder list).
- Replace rollover and compaction-threshold lines; set the handoff location to `.crew/handoff.md`.
- Point screenshots and reports to `.crew/task-data/<id>/`.
- Keep the project's framework choice as its Workflow line.
- Add the advisor posture line.
- Show the diff, and log the migration in the crew decisions log.
- If the state file has a handoff or "Next session" section crew used, tell the founder it is superseded by `.crew/handoff.md` and offer to remove it. Do not remove it without confirmation.

## 8. Pointer block in `CLAUDE.md`

Add this block to `CLAUDE.md` (or to `AGENTS.md` if the project uses only that file), with the real `CREW.md` path. The project-root `CLAUDE.md` is re-injected after every compaction, for the lead and for subagents, so these lines are the floor that survives when everything else is summarized:

```
<!-- crew:begin -->
Multi-agent rules: docs/CREW.md (crew skill). Crew state: .crew/ (queue.md, tasks/, plans/, handoff.md).
Crew lead (the main session): every founder request is queued first (`.crew/bin/crew request "<text>"`) and never added to a running agent; drain the queue only at task-acceptance boundaries. If the crew skill's rules are not in your context, invoke the `crew` skill.
Crew subagents: work only from your brief and your task spec; report in the format the brief asked for.
<!-- crew:end -->
```

On re-runs, replace everything between the markers. If the file has the older single pointer line (`Multi-agent rules: … Crew state: .crew/.`) without markers, replace that line with the block.

## 9. Lead settings (user level)

- Read the question timeout: `jq -r '.askUserQuestionTimeout // empty' ~/.claude/settings.json`.
- If it is absent or shorter than `10m` (`60s`, `5m`), ask the founder in one `AskUserQuestion` whether to set it to `10m` ("Set to 10m (Recommended)" first). A founder who is present but busy needs time to notice and think; a founder who is away loses nothing, because the lead takes recorded defaults. Never offer a shorter value. When accepted, write it with `jq` to a temp file, move it into place, and validate with `jq .`. When declined, leave it as it is: unset means questions stay open until answered; a shorter value stays the founder's choice.
- Recommend, without changing anything: the main session on `opus` at effort `high`; auto memory on (needed by `memory:` agents). Compaction windows are the founder's choice; the dashboard's Compactions section gives the data to tune them (`/autocompact <size>` per model, or `autoCompactWindow` in an agent definition).

## 10. Journal

```
.crew/bin/crew session start ${CLAUDE_SESSION_ID}
.crew/bin/crew journal "Set up the crew"
```

Use the session id `SKILL.md` gave you.

## 11. Verify now

Run each check and report pass or fail:

1. The session is registered: `ls .crew/tmp/journal-state/sessions/`.
2. The journal line exists: `tail -n 3 .crew/journal.md`.
3. `.crew/status.md` exists and its first line is `# Crew status — <repository name>`: `head -n 1 .crew/status.md`.
4. The hook guard works: pipe a sample payload into the hook and count journal lines before and after:
   ```
   printf '%s' '{"session_id":"<this session id>","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"scout","description":"setup check","prompt":"x"}}' | .crew/bin/crew hook agent-start
   ```
   adds one line; the same payload with `"session_id":"unknown"` adds nothing.
5. `.crew/bin/crew worktree setup --dry-run` prints the steps it would run.
6. `jq . .claude/settings.json` succeeds, and `jq '.hooks | keys' .claude/settings.json` lists `PreCompact`, `SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`, `PreToolUse` and `PostToolUse`.
7. `git check-ignore .crew/journal.md .crew/status.md .crew/task-data/x .crew/tmp/x` prints all 4 paths (`-q` accepts only one path).
8. `git check-ignore -q .crew/queue.md` fails (the queue is committed).
9. The compaction reminder is addressed to the lead when nothing runs:
   ```
   printf '%s' '{"session_id":"<this session id>","hook_event_name":"SessionStart","source":"compact","transcript_path":"/none"}' | .crew/bin/crew hook compact
   ```
   prints one line starting with `Crew: context was compacted. If any of these are no longer in your context`. It writes no journal line (the compaction record comes from the transcript, not from the hook).
10. `.crew/bin/crew request "setup check" --dry-run` prints a `- [R1] …` line (or the next number) and changes nothing.
11. The `CLAUDE.md` block is present: `grep -c 'crew:begin' CLAUDE.md` prints 1 (or in `AGENTS.md`).

Any failure → fix it before continuing.

## 12. Next session

- Agent definitions hot-reload, except when `.claude/agents/` did not exist when the session started. Hook changes are treated as needing a restart; `settings.json` hooks are read at session start.
- After a first setup, tell the founder to restart the session. After a re-run, only when hooks changed (a re-run that adds the `PreCompact` or `SessionStart` entries does).
- A project that patched `.crew/bin/crew` by hand (for example a stopgap for the compaction reminder) gets the skill's version in step 2; show the diff and say what the stopgap did is now handled by the script.
- In the setup session itself, when a role's definition is not loaded yet, emulate the role: use `general-purpose`, pass the role's `model` and `effort`, and put the role file's body at the top of the brief.
- **Check in the next session:** a trivial scout delegation returns a capped report; the journal shows its start and stop lines; the dashboard lists it under Live agents while it runs. If the stop line is missing, the session guard does not hold inside subagent hooks: report that to the founder instead of guessing.

## 13. Re-running

After a skill update, run `/crew setup` again. It repeats every step; everything merges, nothing is overwritten. Journal "Re-ran crew setup". Restart the session when hooks changed.
