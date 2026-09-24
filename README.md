# ai-toolbox

Skills and MCP servers for AI coding agents — an [aitools](https://github.com/claudio-silva/ai-tools) toolbox for Codex, Cursor, Claude Code, and Devin.

## Install

The recommended way to install these tools is [`aitools`](https://github.com/claudio-silva/ai-tools), the tool manager for AI coding agents. No installation needed — `npx` runs it directly:

```sh
npx aitools use @gh/claudio-silva/ai-toolbox   # make this repo your default source
npx aitools list                             # browse the toolbox
npx aitools install --all                    # install everything
npx aitools install imagen                   # install one tool
npx aitools install removebg-cli -p cursor   # install for one platform only
```

Or keep no default and name the repo per command:

```sh
npx aitools install @gh/claudio-silva/ai-toolbox removebg-cli
npx aitools list @gh/claudio-silva/ai-toolbox
```

Manage what's installed:

```sh
npx aitools installed            # what's installed, per platform and scope
npx aitools update               # reinstall tools whose repo copy is newer
npx aitools pull                 # refresh the cached snapshot of this repo
npx aitools uninstall removebg-cli
npx aitools about imagen
```

Every tool is a self-contained directory, so you can also install them manually — but that's up to you; no instructions are provided.

## MCP servers

| Project | Description |
| --- | --- |
| [imagen](mcp/imagen/) | Lightweight Go MCP server (stdio) for OpenAI **gpt-image-2.5** image generation and editing — `generate_image`, `edit_image`, embedded prompting guide; single static binary |

Installing `imagen` copies its shipped binary and writes the server into each platform's MCP config. Tool calls need `OPENAI_API_KEY`; install fills it from the environment, or prompts for it. Pass `--raw` to leave the `$OPENAI_API_KEY` placeholder. Restart the MCP client after installing.

## Skills

Each skill is a directory under `skills/<Platform>/<name>/` with a `SKILL.md` and a `manifest.json`. The platform folder decides where it can be installed.

### Cross-environment — `skills/Shared/`

Work in any MCP/agent environment; may carry env-specific metadata (e.g. `agents/openai.yaml` for Codex) that other environments ignore.

| Skill | Description |
| --- | --- |
| [removebg-cli](skills/Shared/removebg-cli/) | remove.bg background removal via CLI/API with credit-aware defaults and mandatory validation |
| [affinity-sdk](skills/Shared/affinity-sdk/) | Verified operating procedure for the official Affinity by Canva MCP |
| [cua-browser-automation](skills/Shared/cua-browser-automation/) | Real-browser E2E testing via the `browse` wrapper over `cua-driver` — snapshot → act → verify, parallel contexts, evidence capture |
| [lite-chrome-automation](skills/Shared/lite-chrome-automation/) | Lightweight CDP control of dedicated Chrome instances — MAIN-world JS eval, cookies, screenshots, extension debugging |

### Codex — `skills/Codex/`

| Skill | Description |
| --- | --- |
| [auto-routing](skills/Codex/auto-routing/) | Cost-aware delegation: routes work to the cheapest pinned `te_*` worker role; installer ships 9 role definitions |
| [codex-remote](skills/Codex/codex-remote/) | Delegate bounded tasks to Codex on SSH servers via a local Luna/low relay subagent; durable job IDs, observe or dispatch-only |
| [who-am-i](skills/Codex/who-am-i/) | Report the agent's real runtime model/effort/thread from read-only local evidence (self-contained script) |
| [working-with-codex-subagents](skills/Codex/working-with-codex-subagents/) | Verified guide to Codex subagent discovery, `spawn_agent` binding, and model/effort resolution |

### Cursor — `skills/Cursor/`

| Skill | Description |
| --- | --- |
| [cursor-plugin-development](skills/Cursor/cursor-plugin-development/) | Verified guide to Cursor plugins: commands, skills, subagents, hooks — including undocumented gotchas |
| [working-with-cursor-subagents](skills/Cursor/working-with-cursor-subagents/) | Verified Task-tool/model-resolution behavior for Cursor subagents |

## Layout

```
mcp/<name>/                 # MCP server: manifest.json, optional bin/<name> and payload files
skills/
  Shared/<skill>/           # cursor, codex, claude-code, and devin
  Codex/<skill>/            # codex
  Cursor/<skill>/           # cursor
  Claude/<skill>/           # claude-code (none yet)
  Devin/<skill>/            # devin (none yet)
```

The repository layout and manifest format — which any repo can adopt to become an aitools source — are specified in [ai-tools/ABOUT.md](https://github.com/claudio-silva/ai-tools/blob/main/ABOUT.md).

## Developing imagen

```sh
cd mcp/imagen
make build      # mcp/imagen/bin/imagen
```
