# save-skill

Turn a skill you wrote by hand into a managed, versioned part of your toolbox: it moves the skill into your toolbox repository, commits and pushes it, then reinstalls it through [aitools](https://github.com/claudio-silva/ai-tools) so it updates like everything else.

Invoked only by the user, as `/save-skill`. The frontmatter sets `disable-model-invocation: true`, so the skill stays out of context until you call it.

## What it does

- **Finds your toolbox** from your aitools default source, and reads that repository's own `CONTRIBUTING.md` instead of trusting a copy of the rules
- **Validates the skill**: frontmatter, naming, quoting that strict YAML parsers need
- **Places it correctly**: cross-platform or single-platform folder, with an `aitools.json` when needed
- **Writes the README** the toolbox requires, in the shape of its neighbours
- **Commits and pushes**, then replaces the hand-made copy with a managed install and confirms it shows as managed
- **Keeps this toolbox's showcase current**: when run on `ai-toolbox`, it also updates the root `README.md` so the new or changed tool appears there

## Install

```sh
aitools install @gh/claudio-silva/ai-toolbox save-skill
npx skills add claudio-silva/ai-toolbox --skill save-skill   # alternative
```

Claude Code only (`aitools.json` sets `platforms`), because it relies on `disable-model-invocation` frontmatter. See the [repository README](../../../README.md).

## Contents

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The procedure, including the root README update for `ai-toolbox` |
