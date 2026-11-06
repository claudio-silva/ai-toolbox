# imagen

A lightweight [MCP](https://modelcontextprotocol.io) server for OpenAI **GPT Image 2.6** image generation and editing, over stdio.

Written in Go — one direct dependency ([mark3labs/mcp-go](https://github.com/mark3labs/mcp-go)) plus a minimal `net/http` client for the OpenAI calls (no OpenAI SDK). Compiles to a fully self-contained ~8 MB static binary with no runtime dependencies.

## Features

- **`generate_image`** — create images from text prompts (`gpt-image-2.6-sunburst` / `gpt-image-2.6-flare`), including animated GIF and SVG output
- **`edit_image`** — edit existing images; inputs can be local files, `https://` URLs, `data:` URIs, or OpenAI `file_id:` refs; optional `mask` or **`markup`** overlay for precise localized edits
- **`upload_reference_image`** — upload a reference image once to the Files API and reuse it by `file_id:` across many calls
- **`get_usage_guide`** — embedded usage + prompting guide, also delivered automatically at `initialize` via the MCP `instructions` field, so the server is self-sufficient for LLM callers
- Full GPT Image 2.6 parameter surface: `size` (presets or custom `WxH`), `quality` (`auto` → `max`), `complexity` (`low`/`medium`/`high`), `background` (incl. `transparent`), `outputFormat` (`png`/`jpeg`/`webp`/`gif`/`svg`), `outputCompression`, `frameCount`, `frameDurationMs`, `svgReasoningEffort`, `moderation`, `n`
- Request-shape validation before the call, so malformed combinations fail free rather than billed
- Images written to disk; optionally returned inline as MCP image content

## Model selection

Both models bill at the **same token rates**, so the choice is quality vs latency:

| Model | Use when |
| --- | --- |
| `gpt-image-2.6-sunburst` (**default**) | Detail, text accuracy, edit fidelity or preservation of existing artwork matters — production assets, print, book covers, precise edits. Also for casual work when speed is not a concern. |
| `gpt-image-2.6-flare` | Latency is the priority — brainstorming, rapid prototyping, disposable intermediates, frequent iteration. |

The tool descriptions and [guide.md](guide.md) carry this strategy to the calling model, including the rules not to silently downgrade quality or switch to flare for production artwork, and to keep editing with sunburst once an image reaches production quality.

The 2.5 model IDs remain selectable so pinned workflows keep working. GPT Image 2.6 publishes no dated snapshots yet.

## Requirements

- Go 1.24+ (built/tested with 1.27)
- An OpenAI API key with access to GPT Image 2.6 models

## Build & install

The Apple Silicon binary is shipped at `bin/imagen`. Install it into MCP clients with:

```sh
aitools install imagen
```

To rebuild during development:

```sh
make build      # → bin/imagen (static, current arch)
make release    # → darwin arm64 + amd64 + lipo universal binary in bin/
make test vet
```

The binary version defaults to the `2.0.0` baseline and is overridden by an `imagen-vX.Y.Z` git tag when one exists.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | Required at call time; the server starts without it but tools return a clear error |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Endpoint override (proxies, Azure, etc.) |
| `IMAGEN_MODEL` | `gpt-image-2.6-sunburst` | Default model |

MCP client config (Claude Desktop `claude_desktop_config.json`, Cursor `.cursor/mcp.json`, Windsurf `~/.codeium/windsurf/mcp_config.json`, Devin `~/.config/devin/mcp_config.json`):

```json
{
  "mcpServers": {
    "imagen": {
      "command": "/path/to/imagen",
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

## Tools

### `generate_image`

| Param | Required | Notes |
| --- | --- | --- |
| `prompt` | yes | Text describing the image |
| `outputPath` | yes | **Absolute** file path; parent dirs are created; missing extension filled from `outputFormat` |
| `model` | | `gpt-image-2.6-sunburst` (default), `gpt-image-2.6-flare`, or a 2.5 ID |
| `size` | | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, or custom `WxH` (multiples of 16, ratio 1:3–3:1, ≤ 3840/edge) |
| `quality` | | `auto`, `low`, `medium`, `high`, `xhigh`, `max` — rendering detail |
| `complexity` | | `low`, `medium`, `high` — planning before rendering; API default `high` when omitted |
| `background` | | `auto`, `opaque`, `transparent` (transparent requires png/webp/svg) |
| `outputFormat` | | `png` (default), `jpeg`, `webp`, `gif`, `svg` |
| `outputCompression` | | 0–100, jpeg/webp only |
| `frameCount` | | 2–16 (API default 9), gif only |
| `frameDurationMs` | | 20–2000 (API default 200), gif only |
| `svgReasoningEffort` | | `none`…`max`, svg only |
| `moderation` | | `auto`, `low` |
| `n` | | 1–10; `n>1` writes `name-1.ext … name-N.ext`; svg requires `n=1` |
| `returnInlineImage` | | Also embed image bytes in the result (default false — saves context) |

### `edit_image`

Same parameters (minus `svgReasoningEffort`; `svg` output is not supported on edits), plus:

| Param | Required | Notes |
| --- | --- | --- |
| `images` | yes | 1–16 input images: absolute paths, `https://` URLs, `data:` URIs, or `file_id:` refs. First image = primary subject |
| `mask` | | Transparent regions mark editable areas; must match input dimensions. Cannot be combined with `markup` |
| `markup` | | Transparent PNG overlay, same pixel dimensions as the first image, with a shape drawn around the region to change. Applies to the first image only; the rest act as references. Cannot be combined with `mask` |

### `upload_reference_image`

Takes an absolute `path`, uploads it with purpose `vision`, and returns a `file_id:…` string to reuse in `images`, `mask` or `markup`.

### `get_usage_guide`

Returns the embedded [guide.md](guide.md): model selection, quality/complexity tuning, markup edits, GIF and SVG rules, workflows, edit-preserve patterns, text rendering, and error codes.

## Design notes

- **No OpenAI SDK** — the Images API surface used is two JSON endpoints plus one multipart file upload; requests go through a small `net/http` client (`openai.go`).
- **Edits are sent as a single JSON body** — `/v1/images/edits` is documented as `application/json`, so local files are encoded as base64 data URLs in `images[].image_url` (~33% size overhead vs multipart, fine for the ≤16 image limit). `markup` and `mask` use the same `{file_id | image_url}` shape.
- **Local pre-flight checks** — markup overlays are verified to be PNG and (when both sides are local PNGs) dimension-matched against the first image, so a doomed edit fails before it is billed. Format/parameter combinations (`svg` on edits, GIF frame controls without `gif`, `outputCompression` on png, transparent background on jpeg, `n>1` with svg) are rejected the same way.
- **`input_fidelity` and `reasoning.summary` are never sent** — GPT Image 2.6 does not support them.
- **API errors are surfaced verbatim** including `code` (`moderation_blocked`, `image_generation_user_error`) and `moderation_details`, so LLM callers can self-correct.
- **10-minute HTTP timeout** — `max` quality with high complexity can take several minutes.
- Diagnostics go to stderr only; stdout is reserved for JSON-RPC.
