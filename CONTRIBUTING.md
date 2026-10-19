# Adding a tool

## Where a skill goes

| The skill serves | Directory | `aitools.json` |
| --- | --- | --- |
| Every platform | `skills/<name>/` | Only if it needs `exclude`, `files`, or `remove` |
| One platform | `skills/<platform>/<name>/` (`codex`, `cursor`, `claude-code`, `devin`) | Required: `"platforms": ["<platform>"]` |
| Some platforms | `skills/<name>/` | Required: `"platforms": [...]` |

Folders are organization only. `platforms` in `aitools.json` is what aitools enforces, so keep the folder and the file in agreement. Don't nest deeper than `skills/<platform>/<name>/`: `npx skills` searches three levels down.

## What a skill contains

- **`SKILL.md`** (required). Its frontmatter needs `name` and `description`:
  - `name` is the directory name: lowercase letters, digits, and hyphens.
  - `description` says what the skill does and when to use it. Quote the value if it contains `: `. Strict YAML parsers, `npx skills` among them, skip the skill otherwise.
- **`README.md`** (required, not installed). Write it for people browsing the repository, with these sections:
  - a summary;
  - `## What's inside`;
  - `## Install`, with the `npx aitools` and `npx skills` commands and the platforms;
  - `## Contents`, a table of the files.
- **Supporting files** — scripts, references, and assets the skill uses. They are all installed unless excluded. In `SKILL.md`, refer to them relative to the skill's directory.
- **`aitools.json`** (optional) — only what defaults can't express:

  ```json
  {
    "platforms": ["codex"],
    "exclude": ["tests", "scripts/test_*.py"],
    "files": [{ "from": "roles/*.toml", "to": "$CODEX_HOME/agents/" }],
    "remove": ["$SKILLS_DIR/old-name"]
  }
  ```

  The full format is in [ai-tools/ABOUT.md](https://github.com/claudio-silva/ai-tools/blob/main/ABOUT.md).

## Files placed outside the skill

`npx skills` ignores `aitools.json`, so a `files` placement outside the skill directory (agent roles, config fragments) doesn't happen with it. Instead, it copies the source files into the skill directory. Add a short `## Setup check` section to `SKILL.md`. It tells the agent to look for the placed file, copy it from the skill directory if it's missing, and ask the user to restart the client. See `skills/codex/auto-routing/` for an example.

## MCP servers

`mcp/<name>/aitools.json` with `settings`, plus `bin/<name>` for a shipped binary or `files` for a script payload. Add a `README.md` too.

## Before committing

1. Add a row to the skills (or MCP servers) table in [README.md](README.md).
2. Check that both installers see the tool, and that aitools installs the files you expect:

   ```sh
   aitools list .
   aitools install . <name> -l -C "$(mktemp -d)" -n
   npx skills add . --list
   ```

   Treat any aitools warning about the skill as an error.
