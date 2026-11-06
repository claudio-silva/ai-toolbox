# imagen — usage & prompting guide

MCP server for OpenAI **GPT Image 2.6** image generation and editing.

## Tools

- `generate_image` — create a NEW image from a text prompt. Not for modifying existing images.
- `edit_image` — modify EXISTING image(s) with a prompt, optional `mask` or `markup`.
- `upload_reference_image` — upload a local image once, get a reusable `file_id:` reference.
- `get_usage_guide` — returns this document.

## Choosing a model

Both models bill at the **same token rates**. Choose on quality vs latency, never on assumed cost.

| | `gpt-image-2.6-sunburst` | `gpt-image-2.6-flare` |
| --- | --- | --- |
| Role | Base model: detail and precise edits | Small model: speed first |
| Use for | Professional deliverables, production assets, book covers, print, precise edits, anything where existing artwork must be preserved | Brainstorming, rapid prototyping, disposable intermediates, frequent iteration |
| Also use for | Casual images when speed does not matter | — |

**Default to sunburst.** Pick flare only when the task clearly prioritises low latency or rapid iteration.

Rules that matter:

- Never silently downgrade to flare, or to a lower `quality`, when the caller asked for professional or production output.
- A small requested change does not mean a low-priority image. Judge by the artwork, not the size of the edit.
- Once an image has reached production quality, keep editing it with **sunburst**; do not drop back to flare.

## Quality and complexity are independent

- `quality` (`auto`, `low`, `medium`, `high`, `xhigh`, `max`) controls **rendering detail** — texture, small lettering.
- `complexity` (`low`, `medium`, `high`) controls **how much the model plans before rendering**. Both models use `high` when the field is omitted.

Guidance:

- **Final professional artwork:** sunburst, `quality=max`. Then test whether higher or lower complexity actually improves the result.
- **Precise localized edits:** sunburst, high rendering quality, but start at `complexity=low` so surrounding detail stays intact. Raise it only when the change needs real planning.
- **Open-ended prompts** (layout left to the model): `complexity=high` gives it room to compose.
- **Fully specified prompts** (layout, text and style already pinned): higher complexity may make little visible difference.
- **Small or dense text:** compare `medium` and `high` quality; `high` for dense labels, diagrams, legends, axes, footnotes.
- **Drafts:** `quality=low`.

Maximum is not automatically best. Tune one setting at a time — change quality *or* complexity, never both — and keep the other fixed while comparing. Weigh visual fidelity against latency and real token consumption.

Callers may override every setting explicitly; an explicit request always wins.

## Inputs (`edit_image`)

Each `images` entry may be an absolute local file path, an `https://` URL, a `data:` URI, or a `file_id:` reference. **1–16 images.**

- The first image is the primary subject. Assign each input a numbered role in the prompt ("image 1 = subject, image 2 = style reference, image 3 = clothing") and state how they combine.
- `mask` (same input forms): transparent regions mark where the model may change the image; must match the input's dimensions.
- `markup` (same input forms): see below. **`mask` and `markup` cannot be combined.**

### Reusable reference images

`upload_reference_image` uploads a local file to the OpenAI Files API (purpose `vision`) and returns a `file_id:…` string. Pass it in `images`, `mask` or `markup` on as many later calls as you like. Use it whenever the same subject, style or brand asset recurs across calls — it avoids re-encoding the bytes into every request.

### Markup-guided edits

For a precise, localized change, prefer markup over a mask: draw a shape (e.g. a red circle or an arrow) around the target region on a copy of the image, then pass that as a **transparent PNG overlay with exactly the same pixel dimensions as the first image**.

- The overlay applies to the **first image only**; any additional images act as references.
- Describe the change in the prompt and tell the model to remove the drawn shape, e.g.
  *"Recolor the striped vase inside the red circle to solid cobalt blue ceramic. Keep its shape, the dried stems, and the rest of the kitchen unchanged. Remove the red circle from the finished photo."*
- Start at `complexity=low` for this kind of edit.
- The server checks locally that the overlay is a PNG and (when both are local PNGs) that dimensions match, so an obviously bad request fails before it is billed.

## Outputs

- `outputPath` is required and must be **absolute**. Parent directories are created. A missing extension is filled from `outputFormat`.
- With `n` > 1, files are saved as `name-1.ext` … `name-N.ext`.
- `returnInlineImage` also embeds image bytes in the tool result — costs context; default false. Skipped for SVG (it is XML; read the file instead).

## Parameters

- `size`: `auto` | `1024x1024` | `1536x1024` | `1024x1536` | custom `WIDTHxHEIGHT`.
  Custom: both edges multiples of 16, aspect between 1:3 and 3:1, edges ≤ 3840, total pixels 655,360–8,294,400. Above `2560x1440` is experimental.
- `quality`: `auto` (default), `low`, `medium`, `high`, `xhigh`, `max`.
- `complexity`: `low`, `medium`, `high`. Omitted by default → the API uses `high`.
- `background`: `auto` | `opaque` | `transparent`. Transparent requires `outputFormat` png, webp or svg — verify alpha at hair, glass and edges; a drawn checkerboard is not transparency.
- `outputFormat`: `png` (default) | `jpeg` | `webp` | `gif` | `svg`.
- `outputCompression` (0–100): **jpeg/webp only**.
- `moderation`: `auto` | `low` (less restrictive filtering).
- `n`: 1–10. SVG requires `n=1`.

### Animated GIF

Set `outputFormat=gif` on either tool, then optionally:

- `frameCount`: 2–16 (API default 9).
- `frameDurationMs`: 20–2000, rounded to 10 ms (API default 200).

`frameCount=9` at `frameDurationMs=200` is a 1.8 s loop. Prompt for motion that loops: give the subject a starting pose to return to, say whether the camera moves, and ask for the motion to loop smoothly. GIF does not support `outputCompression`.

### SVG

- `generate_image` only — **SVG edits are not supported** by the API, and an SVG is not accepted as a raster input to an edit. Produce the vector once, or edit a raster and re-generate.
- Requires `outputFormat=svg` and `n=1`; `outputCompression` is not supported. `background=transparent` is.
- **`svgModel` is required on accounts with SVG model selection enabled.** It names the model that *authors* the SVG, which is separate from `model` (the image model only renders a reference image that the author model traces). Without it the API returns `missing_required_parameter: SVG generation requires 'svg.model'`. On accounts where model selection is disabled, omit it — the server then sends no `svg` object at all.
- `svgModel` takes a **GPT text model with vision**, not an image model: GPT-5.x, GPT-6.x, GPT-4.1, GPT-4o and o3 families are reported to work. Start with `gpt-6.1-terra` (verified). An image model or unknown ID returns `model_not_found`; an unsupported text model returns `unsupported_svg_model`. Availability depends on your account's model access.
- `svgReasoningEffort` (`none` ... `max`) tunes the author model's reasoning; supported levels depend on that model. Higher effort multiplies author tokens; the default is enough for icons.
- **Known launch-period limitation: prompts with lettering usually fail.** SVG requests whose image contains words (wordmarks, logos with a company name, badges, charts, diagrams) return a bare `502` after 10 to 200 seconds, regardless of image model, quality or author effort. Text-free icons and simple illustrations succeed reliably. Workaround: generate the text-free mark as SVG, then add the lettering yourself as an SVG `<text>` element or in a vector editor. Retry 502s with backoff; do not retry them in a tight loop.
- `quality` and `complexity` apply to the **reference image**, not to the vector itself.
- Billing is split: the image model's rate for the reference image, plus the author model's rate for the SVG tokens (reported separately as `svg_usage`).
- Best for flat, vector-friendly work: logos, icons, marks, simple illustrations. The returned document is static vector content — no scripts, external resources or embedded rasters.

### Not supported on GPT Image 2.6

`input_fidelity` and `reasoning.summary` are not sent — GPT Image 2.6 does not support them. Streaming and partial images are not exposed by this server (it writes finished files).

## Workflows

**Exploration → production (latency matters):** iterate with `gpt-image-2.6-flare` at `quality=low`/`medium` until the composition is right, then re-render the chosen direction with `gpt-image-2.6-sunburst` at `quality=max`. Keep editing with sunburst from then on.

**Exploration → production (latency does not matter):** use sunburst throughout; vary `quality` instead of the model.

**Precise edit of finished artwork:** sunburst, high quality, `complexity=low`, markup overlay around the region, prompt naming exactly what to change and everything to preserve.

**Protect your sources.** Keep the original and each approved render on disk and edit from the best available source rather than from the last output in a long chain — repeated round-trips accumulate degradation. If a region must stay pixel-identical, composite the approved edit back into the original; prompting cannot guarantee pixel-exact preservation.

## Prompting GPT Image 2.6

- **Edits:** say "change only X" and enumerate what must be preserved — identity, face, product geometry, layout, lighting, labels. Restate the preserve list on EVERY edit; fidelity drifts across turns. A strong pattern: *"Do not change her face, facial features, skin tone, body shape, pose, or identity in any way."*
- **Exact text:** put required wording in quotes with position and typography, and say how many times it appears ("Render the tagline exactly once"). Spell unusual names letter by letter; add "no other text". Check spelling and legibility in the output.
- **Transparent cutouts:** request the isolated subject in the prompt AND `background=transparent`; say "do not add a solid backdrop, checkerboard, scenery, or shadow"; repeat the requirement on later edits; verify the alpha channel.
- **Roles for references:** identify each input by number and purpose — subject, style, clothing, background.
- **Consistency:** "same style as before" can carry context, but restate critical constraints when results drift (e.g. "Same green hooded tunic").
- **Sketch → render:** treat the prompt as a spec — preserve layout and perspective, and add "do not add new elements or text".
- Camera/lens terms are appearance cues, not physical-simulation guarantees; specify scale, atmosphere and colour for mood.
- **Iterate deliberately:** feed the previous output back as the next edit input, one change per turn, repeating the details to preserve.
- Any numbers the model writes into an image are invented — verify them before using the image.

## Errors

- `moderation_blocked` — prompt or input hit the filter; revise before retrying (`moderation_details` may indicate the stage).
- `image_generation_user_error` — correctable request issue (size, format, prompt); fix inputs, don't blindly retry.
- Rate-limit / quota / 5xx — retry with backoff; don't retry quota errors without changing the request.
