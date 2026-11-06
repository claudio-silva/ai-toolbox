---
name: save-skill
description: Publish a locally created skill to the user's toolbox repository, commit and push it, then reinstall it through aitools so it becomes a managed install.
disable-model-invocation: true
---

# Save a skill to the toolbox

Move a hand-made skill out of `~/.claude/skills/` and into the user's toolbox repository, so it is versioned, shareable, and maintained by `aitools` rather than by hand.

A skill placed directly in `~/.claude/skills/` is unmanaged: `aitools` shows it as ◎ and will neither update nor uninstall it. This procedure makes it ◉.

## Inputs

The skill name, or a path to its directory. Default location: `~/.claude/skills/<name>/`.

If the user names a skill that was just created in this session, use that one without asking.

## Procedure

### 1. Resolve the toolbox

```sh
aitools use          # prints the default source
```

A local path means edits and `git push` happen in that clone, and `aitools pull` is a `git pull` there. A remote `@gh/owner/repo` means you must find the working clone (usually `~/My-GitHub-Projects/<repo>`) and push there first; installing from a stale snapshot silently ships the old version.

Read that repository's `CONTRIBUTING.md` before writing anything. The conventions below were true at the time of writing; the file is authoritative.

### 2. Validate the skill

- `SKILL.md` exists, with frontmatter `name` and `description`.
- `name` is lowercase letters, digits and hyphens, and matches the directory name.
- Quote any `description` containing `: ` — strict YAML parsers skip the skill otherwise.

### 3. Choose the location

Read the placement rules from the repository's `CONTRIBUTING.md` — which directory a skill goes in depends on how many platforms it serves, and whether `aitools.json` is required. Follow that file, not memory.

Platforms are `claude-code`, `cursor`, `codex`, `devin`. Never nest deeper than `skills/<platform>/<name>/`.

Treat a skill as single-platform when it depends on that client's features: `disable-model-invocation` or subagent spawning (Claude Code), agent `.toml` roles (Codex), `.cursor/agents` (Cursor). When in doubt, ask the user rather than guessing wide.

### 4. Copy and document

Copy `SKILL.md` and every supporting file. Then add:

- **`aitools.json`** — only if the platform set is limited.
- **`README.md`** — required by the repo, and excluded from installs. Write it for a person deciding whether to install: a summary, what's inside, the install commands (`aitools install @gh/<owner>/<repo> <name>` and the `npx skills add` alternative), the platform note, and a contents table. Match the shape of a neighbouring skill's README.

### 5. Update the toolbox README (author's toolbox only)

Applies only when the repository is `claudio-silva/ai-toolbox`: its root `README.md` begins with `# ai-toolbox` and `git remote get-url origin` points at `claudio-silva/ai-toolbox`. Skip this step for any other toolbox.

The root README is the showcase for the whole collection, so a new or changed tool must be reflected there:

1. Read the root `README.md` and match its current structure, tone and table formats; do not assume the layout below is still accurate.
2. **New tool:** add its entry to the skills table (or the MCP servers section for a server), in alphabetical order. The description is one line of user-facing value: what the tool lets someone do, not how it works. Set the platforms column to match `aitools.json` (`all` when there is none). If the README has a counts line, a highlights list or a per-platform grouping, update those too.
3. **Existing tool updated (new capability, renamed, removed):** edit its entry and any other README passage that mentions it, so nothing goes stale.
4. Link to the tool's own `README.md`, which holds the detail.
5. Check every relative link in the lines you touched.

Stage `README.md` in the same commit as the tool.

### 6. Commit and push

Stage only the new skill directory (plus the root `README.md` when step 5 applied). Write a message saying what the skill does and why it exists, not just "add skill". Push before installing.

### 7. Make it managed

```sh
diff -r ~/.claude/skills/<name> <repo>/skills/.../<name>   # expect only README.md and aitools.json to differ
rm -rf ~/.claude/skills/<name>                             # remove the unmanaged copy FIRST
aitools pull
aitools install <name>
aitools about <name>                                       # must show ◉
```

Removing the hand-made directory before installing is what makes the install recorded. Installing over it with `--force` drops the directory wholesale and is riskier; verify with `diff` first either way, so nothing unpushed is lost.

### 8. Report

Give the user: the repository path, the commit, the installed path, and the ◉ status line from `aitools about`.

## Gotchas

- **Push before install.** With a local-clone source, `aitools pull` is a `git pull`; with a remote source it re-downloads. Either way an unpushed commit will not be installed.
- **`README.md` is not installed.** The repository's root `aitools.json` excludes it. Do not put anything the agent needs at runtime there — that belongs in `SKILL.md` or a reference file.
- **Supporting files ship by default.** Everything except dotfiles, `.DS_Store`, `__pycache__`, `.pyc` and `aitools.json` is copied. Use `exclude` for notes meant only for maintainers.
- **Folder and `platforms` must agree.** The folder is organisation only; `aitools.json` is what is enforced.
