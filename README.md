# ai-toolbox

Skills and MCP servers for AI coding agents — an [aitools](https://github.com/claudio-silva/ai-tools) toolbox for Codex, Cursor, Claude Code, and Devin.

## Install

The recommended way to install these tools is [`aitools`](https://github.com/claudio-silva/ai-tools), the tool manager for AI coding agents. Install it (macOS) with:

```sh
curl -fsSL https://raw.githubusercontent.com/claudio-silva/ai-tools/main/install.sh | sh
```

Then:

```sh
aitools use @gh/claudio-silva/ai-toolbox     # make this repo your default source
aitools list                                 # browse the toolbox
aitools install --all                        # install everything
aitools install imagen                       # install one tool
aitools install removebg-cli -p cursor       # install for one platform only
```

Or keep no default and name the repo per command:

```sh
aitools install @gh/claudio-silva/ai-toolbox removebg-cli
aitools list @gh/claudio-silva/ai-toolbox
```

Manage what's installed:

```sh
aitools installed            # what's installed, per platform and scope
aitools update               # reinstall tools whose repo copy is newer
aitools pull                 # refresh the cached snapshot of this repo
aitools uninstall removebg-cli
aitools about imagen
```

### With `npx skills`

The skills also install with the [`skills`](https://github.com/vercel-labs/skills) CLI:

```sh
npx skills add claudio-silva/ai-toolbox --list
npx skills add claudio-silva/ai-toolbox --skill lite-chrome-automation
```

What it does differently:

- It doesn't read `aitools.json`, so the platform column below isn't enforced. Pick agents with `-a` (e.g. `-a codex` for the Codex skills).
- It copies each skill directory whole, including READMEs and files aitools leaves out.
- `auto-routing` and `codex-remote` need agent roles in `$CODEX_HOME/agents`. The `skills` CLI leaves them inside the skill directory; on first use each skill places its roles and asks you to restart Codex.
- MCP servers (`imagen`) are not skills; install them with aitools.

## MCP servers

| Project | Description |
| --- | --- |
| [imagen](mcp/imagen/) | Lightweight Go MCP server (stdio) for OpenAI **gpt-image-2.5** image generation and editing — `generate_image`, `edit_image`, embedded prompting guide; single static binary |

Installing `imagen` copies its shipped binary and writes the server into each platform's MCP config. Tool calls need `OPENAI_API_KEY`; install fills it from the environment, or prompts for it. Pass `--raw` to leave the `$OPENAI_API_KEY` placeholder. Restart the MCP client after installing.

## Skills

Each skill is a directory with a `SKILL.md`: under `skills/<name>/` when it works across platforms, under `skills/<platform>/<name>/` when it only serves one. An optional `aitools.json` next to it limits platforms, places extra files, or leaves files out. To add one, see [CONTRIBUTING.md](CONTRIBUTING.md).

| Skill | Platforms | Description |
| --- | --- | --- |
| [affinity-sdk](skills/affinity-sdk/) | all | Verified operating procedure for the official Affinity by Canva MCP |
| [auto-routing](skills/codex/auto-routing/) | codex | Cost-aware delegation: routes work to the cheapest pinned `te_*` worker role; ships 9 role definitions |
| [codex-remote](skills/codex/codex-remote/) | codex | Delegate bounded tasks to Codex on SSH servers via a local Luna/low relay subagent; durable job IDs, observe or dispatch-only |
| [cua-browser-automation](skills/cua-browser-automation/) | all | Real-browser E2E testing via the `browse` wrapper over `cua-driver` — snapshot → act → verify, parallel contexts, evidence capture |
| [cursor-plugin-development](skills/cursor/cursor-plugin-development/) | cursor | Verified guide to Cursor plugins: commands, skills, subagents, hooks — including undocumented gotchas |
| [lite-chrome-automation](skills/lite-chrome-automation/) | all | Lightweight CDP control of dedicated Chrome instances — MAIN-world JS eval, cookies, screenshots, extension debugging |
| [removebg-cli](skills/removebg-cli/) | all | remove.bg background removal via CLI/API with credit-aware defaults and mandatory validation |
| [who-am-i](skills/codex/who-am-i/) | codex | Report the agent's real runtime model/effort/thread from read-only local evidence (self-contained script) |
| [working-with-codex-subagents](skills/codex/working-with-codex-subagents/) | codex | Verified guide to Codex subagent discovery, `spawn_agent` binding, and model/effort resolution |
| [working-with-cursor-subagents](skills/cursor/working-with-cursor-subagents/) | cursor | Verified Task-tool/model-resolution behavior for Cursor subagents |

"All" is Cursor, Codex, Claude Code, and Devin. Skills may carry metadata for one environment (e.g. `agents/openai.yaml` for Codex) that the others ignore.

## Layout

```
aitools.json              # repo-wide: leave each skill's README.md out of installs
skills/
  <name>/                 # cross-platform skills
  codex/<name>/           # Codex-only skills
  cursor/<name>/          # Cursor-only skills
  claude-code/<name>/     # Claude Code-only skills
mcp/<name>/               # MCP server: aitools.json, optional bin/<name> and payload files
```

Folders are organization only. The supported platforms come from each skill's `aitools.json`, which is what aitools enforces. aitools and `npx skills` find skills by their `SKILL.md`, and aitools finds MCP servers by their `aitools.json`. The format is specified in [ai-tools/ABOUT.md](https://github.com/claudio-silva/ai-tools/blob/main/ABOUT.md).

## Developing imagen

```sh
cd mcp/imagen
make build      # mcp/imagen/bin/imagen
```

## Author and license

Created and maintained by **Cláudio Silva** ([@claudio-silva](https://github.com/claudio-silva)).

Copyright © 2026 Cláudio Silva. Licensed under the [Apache License, Version 2.0](LICENSE). Some tools carry their own copy of the license, so they can be used on their own.
