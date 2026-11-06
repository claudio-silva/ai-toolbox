# ai-toolbox

A hand-picked set of skills and MCP servers that make AI coding agents more capable, more economical and more reliable. Works with **Claude Code, Codex, Cursor and Devin**.

Every tool here exists because I needed it in real work. Each one is small, focused and installs with a single command.

## What you get

- **Creative and media work.** Generate and edit images, remove backgrounds and drive design apps, all from the conversation.
- **Browser automation.** Give your agent a real browser to test your app end to end or to inspect and debug live pages.
- **Multi-agent work and cost control.** Delegate to subagents and remote machines, and keep each task on the cheapest model that can handle it.
- **Prompt engineering.** Building and optimizing prompts and skills for agents and subagents.
- **Platform know-how.** Tested guides to the parts of agent platforms the official docs leave vague or wrong.
- **Toolbox management.** Turn your own hand-made skills into versioned tools that install and update like the rest.

## Quick start

### Installation with AI-Tools

This toolbox is designed to work seamlessly with my AI-Tools manager, which manages skills and MCP servers for the most popular agents (Claude Code, Codex, Cursor, and more).

You only need to install [`aitools`](https://github.com/claudio-silva/ai-tools) (macOS) once; the CLI tool manager will be available thereafter:

```sh
curl -fsSL https://raw.githubusercontent.com/claudio-silva/ai-tools/main/install.sh | sh
```

Then point it at this toolbox and pick what you want:

```sh
aitools use @gh/claudio-silva/ai-toolbox     # make this toolbox your default source
aitools list                                 # browse everything
aitools install imagen                       # install one tool
aitools install --all                        # or install everything
aitools install removebg-cli -p cursor       # install for a single platform
```

Day to day: `aitools update` brings installed tools up to date, `aitools installed` shows what you have, and `aitools about <tool>` explains any one of them.

### Installation with Vercel's "Skills"

Prefer not to install my manager? You can also use the popular [`npx skills`](https://github.com/vercel-labs/skills) CLI:

```sh
npx skills add claudio-silva/ai-toolbox --list
npx skills add claudio-silva/ai-toolbox --skill lite-chrome-automation
```

**It has some limitations, though:** it ignores platform limits (choose your agent with `-a`), and it can't install MCP servers. Two Codex skills, `auto-routing` and `codex-remote`, set up their agent roles on first use and ask you to restart Codex.

---

## MCP SERVERS

---

### imagen: image generation and editing for your agent

[`imagen`](mcp/imagen/) is an MCP server that gives your agent access to OpenAI's **GPT Image 2.6**. It is a single small binary with nothing else to install, and it needs only an `OPENAI_API_KEY`.

GPT Image 2.6 brings capabilities `imagen` exposes in full:

- **Two models for two jobs.** `sunburst` for detail, text accuracy and precise edits; `flare` when speed matters more. Both cost the same, and the built-in guide teaches your agent to pick well and never quietly downgrade production work.
- **Animated GIFs.** Ask for a looping animation, with control over frame count and speed.
- **SVG output.** Generate logos, icons and flat illustrations as real vector files, with transparent backgrounds.
- **Markup-guided edits.** Circle the part of an image you want changed and say what to do; no mask painting needed.
- **Quality and complexity as separate dials.** Tune how much detail is rendered independently of how much the model plans, up to `max` quality.
- **Reference images.** Upload a brand asset or subject once and reuse it across many edits, with up to 16 inputs per edit.
- **Flexible output.** Custom sizes up to 3840 pixels per edge, transparent backgrounds, PNG, JPEG, WebP, GIF and SVG.
- **Fail-free mistakes.** Invalid parameter combinations are rejected before the call, so they are never billed.

```sh
aitools install imagen
```

Details and parameters are in the [imagen README](mcp/imagen/README.md).

---

## SKILLS

---

Names link to each skill's own page. "All" means Claude Code, Codex, Cursor and Devin.

### Managing your toolbox

| Skill | Platforms | What it does for you |
| --- | --- | --- |
| [save-skill](skills/claude-code/save-skill/) | claude-code | Turns a skill you wrote by hand into a versioned, installable part of your own toolbox |

### Browser and design

| Skill | Platforms | What it does for you |
| --- | --- | --- |
| [cua-browser-automation](skills/cua-browser-automation/) | all | Real-browser end-to-end testing: snapshot, act, verify, with parallel sessions and saved evidence |
| [lite-chrome-automation](skills/lite-chrome-automation/) | all | Lightweight control of a dedicated Chrome: run JavaScript in the page, set cookies, take screenshots, debug extensions |
| [affinity-sdk](skills/affinity-sdk/) | all | A tested playbook for driving the official Affinity by Canva MCP |
| [removebg-cli](skills/removebg-cli/) | all | Background removal through remove.bg, with credit-saving defaults and a validation check on every result |

### Cost-aware delegation (Codex)

| Skill | Platforms | What it does for you |
| --- | --- | --- |
| [auto-routing](skills/codex/auto-routing/) | codex | Sends each piece of work to the cheapest suitable worker role; ships nine ready-made roles |
| [codex-remote](skills/codex/codex-remote/) | codex | Hand bounded tasks to Codex on your SSH servers, with durable job IDs you can check later |
| [who-am-i](skills/codex/who-am-i/) | codex | Reports the model, effort and thread the agent is really running on, from local evidence |

### Prompts and agent building

| Skill | Platforms | What it does for you |
| --- | --- | --- |
| [ultracompact-prompt](skills/claude-code/ultracompact-prompt/) | claude-code | Shrinks a rules-style prompt to the fewest words that behave the same, verified with scored A/B runs |
| [working-with-codex-subagents](skills/codex/working-with-codex-subagents/) | codex | How Codex subagents are discovered, spawned and assigned models, verified rather than guessed |
| [working-with-cursor-subagents](skills/cursor/working-with-cursor-subagents/) | cursor | The same for Cursor: how the Task tool resolves models for subagents |
| [cursor-plugin-development](skills/cursor/cursor-plugin-development/) | cursor | Build Cursor plugins (commands, skills, subagents, hooks) with the undocumented gotchas included |

## Make it your own

This repository doubles as a template. [`aitools`](https://github.com/claudio-silva/ai-tools) can use any repository laid out this way as a toolbox, so you can fork it, or start your own and use `save-skill` to grow it. The conventions are in [CONTRIBUTING.md](CONTRIBUTING.md), and the file format is specified in [ai-tools/ABOUT.md](https://github.com/claudio-silva/ai-tools/blob/main/ABOUT.md).

## Contributing

This is my personal collection, so I'm not expecting anyone to contribute new tools. But pull requests that improve what is already here are welcome:

- fixes for bugs or outdated instructions in a skill or in `imagen`;
- corrections where a skill's guidance no longer matches how an agent platform behaves;
- clearer documentation.

If you're planning something larger, open an issue first so we can agree on it. For a tool of your own, a fork is the right home. See [CONTRIBUTING.md](CONTRIBUTING.md) for how a tool is structured.

## Author and license

Created and maintained by **Cláudio Silva** ([@claudio-silva](https://github.com/claudio-silva)).

Copyright © 2026 Cláudio Silva. Licensed under the [Apache License 2.0](LICENSE). Some tools carry their own copy of the license, so they can be used on their own.
