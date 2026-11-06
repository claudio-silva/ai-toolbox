package main

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

// modelIDs are the image models this server accepts. GPT Image 2.6 publishes
// no dated snapshots yet; the 2.5 IDs remain callable and are kept so pinned
// workflows keep working.
var modelIDs = []string{
	"gpt-image-2.6-sunburst",
	"gpt-image-2.6-flare",
	"gpt-image-2.5-sunburst",
	"gpt-image-2.5-flare",
	"gpt-image-2.5-sunburst-2026-09-08",
	"gpt-image-2.5-flare-2026-09-08",
}

// formatInfo maps an output_format to the file extension and MIME type used
// when writing results to disk and embedding them in the tool result.
type formatInfo struct{ ext, mime string }

var formats = map[string]formatInfo{
	"png":  {"png", "image/png"},
	"jpeg": {"jpg", "image/jpeg"},
	"webp": {"webp", "image/webp"},
	"gif":  {"gif", "image/gif"},
	"svg":  {"svg", "image/svg+xml"},
}

const modelGuidance = "Model choice: both models cost the same per token, so choose on quality vs latency. " +
	"gpt-image-2.6-sunburst (default) for anything where detail, text accuracy, edit fidelity or preservation of existing artwork matters - " +
	"production assets, print, book covers, precise edits - and for casual images when speed does not matter. " +
	"gpt-image-2.6-flare only when latency is the priority: brainstorming, rapid iteration, throwaway drafts. " +
	"Never downgrade to flare or lower quality for work the caller asked to be professional, and do not treat a small edit as low-priority."

type handlers struct {
	client       *client
	defaultModel string
}

// imageOptions are the generation parameters shared by generate_image and edit_image.
func imageOptions(defaultModel string, isEdit bool) []mcp.ToolOption {
	outputFormats := []string{"png", "jpeg", "webp", "gif", "svg"}
	formatDesc := "png (default), jpeg, webp, gif (animated; see frameCount), svg (vector XML; generations only, n=1)"
	if isEdit {
		outputFormats = []string{"png", "jpeg", "webp", "gif"}
		formatDesc = "png (default), jpeg, webp, gif (animated; see frameCount). svg is not supported on edits"
	}

	opts := []mcp.ToolOption{
		mcp.WithString("model",
			mcp.Description("image model ID. "+modelGuidance),
			mcp.Enum(modelIDs...),
			mcp.DefaultString(defaultModel),
		),
		mcp.WithString("size",
			mcp.Description(`"auto" or WIDTHxHEIGHT (e.g. 1024x1024, 1536x1024, 1024x1536). Custom: both edges multiples of 16, ratio between 1:3 and 3:1, edges <=3840`),
			mcp.DefaultString("auto"),
		),
		mcp.WithString("quality",
			mcp.Enum("auto", "low", "medium", "high", "xhigh", "max"),
			mcp.DefaultString("auto"),
			mcp.Description("rendering detail: texture, small lettering. Independent of complexity. Use max for final professional artwork, high for dense text/diagrams, low for drafts"),
		),
		mcp.WithString("complexity",
			mcp.Enum("low", "medium", "high"),
			mcp.Description("how much the model plans before rendering. API default is high when omitted. Use high when the prompt leaves design decisions open; start low for targeted edits so surrounding detail stays intact. Tune separately from quality"),
		),
		mcp.WithString("background",
			mcp.Enum("auto", "opaque", "transparent"),
			mcp.DefaultString("auto"),
			mcp.Description("transparent requires outputFormat png, webp or svg"),
		),
		mcp.WithString("outputFormat",
			mcp.Enum(outputFormats...),
			mcp.DefaultString("png"),
			mcp.Description(formatDesc),
		),
		mcp.WithNumber("outputCompression",
			mcp.Min(0), mcp.Max(100),
			mcp.Description("0-100, jpeg/webp only"),
		),
		mcp.WithNumber("frameCount",
			mcp.Min(2), mcp.Max(16),
			mcp.Description("animated GIF frames (2-16, API default 9). outputFormat must be gif"),
		),
		mcp.WithNumber("frameDurationMs",
			mcp.Min(20), mcp.Max(2000),
			mcp.Description("animated GIF per-frame duration in ms (20-2000, API default 200, rounded to 10ms). outputFormat must be gif"),
		),
		mcp.WithString("moderation",
			mcp.Enum("auto", "low"),
			mcp.DefaultString("auto"),
		),
		mcp.WithNumber("n",
			mcp.Min(1), mcp.Max(10),
			mcp.DefaultNumber(1),
			mcp.Description("number of images; n>1 saves name-1.ext .. name-N.ext. svg requires n=1"),
		),
		mcp.WithBoolean("returnInlineImage",
			mcp.DefaultBool(false),
			mcp.Description("also embed image bytes in the result (uses context window)"),
		),
	}
	if !isEdit {
		opts = append(opts,
			mcp.WithString("svgModel",
				mcp.Description("model that authors the SVG, separate from the image model (which only renders the reference image). Required with outputFormat=svg on accounts with SVG model selection enabled; omit it where it is disabled. Only valid with outputFormat=svg"),
			),
			mcp.WithString("svgReasoningEffort",
				mcp.Enum("none", "minimal", "low", "medium", "high", "xhigh", "max"),
				mcp.Description("reasoning effort for the SVG author model; supported levels depend on that model. Only valid with outputFormat=svg"),
			))
	}
	return opts
}

func generateTool(defaultModel string) mcp.Tool {
	opts := []mcp.ToolOption{
		mcp.WithDescription("Generate a NEW image from a text prompt using OpenAI GPT Image 2.6. Use only for creating images from scratch, not for modifying existing ones. Supports PNG/JPEG/WebP, animated GIF and SVG output. " +
			modelGuidance + " Call get_usage_guide for parameter rules, quality/complexity tuning and prompting techniques."),
		mcp.WithString("prompt", mcp.Required(), mcp.Description("text describing the image to create")),
		mcp.WithString("outputPath", mcp.Required(), mcp.Description("absolute file path to write the image to, e.g. /Users/me/out/logo.png")),
	}
	opts = append(opts, imageOptions(defaultModel, false)...)
	return mcp.NewTool("generate_image", opts...)
}

func editTool(defaultModel string) mcp.Tool {
	opts := []mcp.ToolOption{
		mcp.WithDescription("Edit EXISTING image(s) with a prompt using OpenAI GPT Image 2.6. The first image is the primary subject; give each input a numbered role (subject, style, clothing, background). " +
			"For a precise localized change, pass a markup overlay (a transparent PNG with a drawn circle/arrow around the target) instead of a mask. " +
			"Once an image is production quality, keep editing it with sunburst rather than reverting to flare. " +
			modelGuidance + " Call get_usage_guide for parameter rules and prompting techniques."),
		mcp.WithArray("images",
			mcp.Required(),
			mcp.WithStringItems(),
			mcp.Description("1-16 input images: absolute file paths, https:// URLs, data: URIs, or file_id: refs from upload_reference_image. First image = primary subject"),
		),
		mcp.WithString("mask",
			mcp.Description("optional mask (same forms as images); transparent regions mark editable areas; must match input dimensions. Cannot be combined with markup"),
		),
		mcp.WithString("markup",
			mcp.Description("optional markup overlay (same forms as images): a TRANSPARENT PNG, same pixel dimensions as the first image, with a shape drawn around the region to change. Applies to the first image only; other images act as references. Cannot be combined with mask. Ask in the prompt for the drawn shape to be removed from the final image"),
		),
		mcp.WithString("prompt", mcp.Required(), mcp.Description("what to change; state 'change only X' plus what to preserve")),
		mcp.WithString("outputPath", mcp.Required(), mcp.Description("absolute file path to write the image to, e.g. /Users/me/out/logo.png")),
	}
	opts = append(opts, imageOptions(defaultModel, true)...)
	return mcp.NewTool("edit_image", opts...)
}

func uploadReferenceTool() mcp.Tool {
	return mcp.NewTool("upload_reference_image",
		mcp.WithDescription("Upload a local image to the OpenAI Files API once and get a reusable file_id reference for it. "+
			"Use this when the same subject, style or brand reference is needed across several generate_image/edit_image calls: "+
			"it avoids re-encoding the bytes on every request. Returns a 'file_id:...' string to pass in images, mask or markup."),
		mcp.WithString("path", mcp.Required(), mcp.Description("absolute path to a local png/jpeg/webp/gif image")),
	)
}

func usageGuideTool() mcp.Tool {
	return mcp.NewTool("get_usage_guide",
		mcp.WithDescription("Return the imagen usage and GPT Image 2.6 prompting guide: model selection (sunburst vs flare), quality and complexity tuning, markup edits, GIF and SVG output, edit-preserve patterns, text rendering, workflows and error codes."),
	)
}

// commonArgs extracts the shared generation params and validates them.
func (h *handlers) commonArgs(req mcp.CallToolRequest, isEdit bool) (genParams, string, bool, error) {
	fail := func(format string, a ...any) (genParams, string, bool, error) {
		return genParams{}, "", false, fmt.Errorf(format, a...)
	}

	out, err := req.RequireString("outputPath")
	if err != nil {
		return genParams{}, "", false, err
	}
	if !filepath.IsAbs(out) {
		return fail("outputPath must be an absolute path, got %q", out)
	}

	p := genParams{
		Model:        req.GetString("model", h.defaultModel),
		Size:         req.GetString("size", "auto"),
		Quality:      req.GetString("quality", "auto"),
		Complexity:   req.GetString("complexity", ""),
		Background:   req.GetString("background", "auto"),
		OutputFormat: req.GetString("outputFormat", "png"),
		Moderation:   req.GetString("moderation", "auto"),
		N:            req.GetInt("n", 1),
	}
	if _, ok := formats[p.OutputFormat]; !ok {
		return fail("unsupported outputFormat %q (want png, jpeg, webp, gif or svg)", p.OutputFormat)
	}
	if p.OutputFormat == "svg" && isEdit {
		return fail("outputFormat svg is not supported on edits; generate SVG with generate_image")
	}
	if p.Background == "transparent" && p.OutputFormat != "png" && p.OutputFormat != "webp" && p.OutputFormat != "svg" {
		return fail("background=transparent requires outputFormat png, webp or svg, got %q", p.OutputFormat)
	}

	if c := req.GetFloat("outputCompression", -1); c >= 0 {
		if p.OutputFormat != "jpeg" && p.OutputFormat != "webp" {
			return fail("outputCompression applies to jpeg/webp only, not %s", p.OutputFormat)
		}
		v := int(c)
		p.OutputCompression = &v
	}

	// Animated GIF controls.
	if f := req.GetFloat("frameCount", -1); f >= 0 {
		if p.OutputFormat != "gif" {
			return fail("frameCount requires outputFormat=gif, got %q", p.OutputFormat)
		}
		v := int(f)
		if v < 2 || v > 16 {
			return fail("frameCount must be between 2 and 16, got %d", v)
		}
		p.FrameCount = &v
	}
	if d := req.GetFloat("frameDurationMs", -1); d >= 0 {
		if p.OutputFormat != "gif" {
			return fail("frameDurationMs requires outputFormat=gif, got %q", p.OutputFormat)
		}
		v := int(d)
		if v < 20 || v > 2000 {
			return fail("frameDurationMs must be between 20 and 2000, got %d", v)
		}
		p.FrameDurationMS = &v
	}

	// SVG generation constraints.
	effort := req.GetString("svgReasoningEffort", "")
	svgModel := req.GetString("svgModel", "")
	if p.OutputFormat == "svg" {
		if p.N != 1 {
			return fail("outputFormat=svg requires n=1, got %d", p.N)
		}
		// The svg object is only sent when something is set: accounts with SVG
		// model selection disabled must omit it entirely.
		if svgModel != "" || effort != "" {
			p.SVG = &svgOptions{Model: svgModel}
			if effort != "" {
				p.SVG.Reasoning = &svgReasoning{Effort: effort}
			}
		}
	} else {
		if effort != "" {
			return fail("svgReasoningEffort requires outputFormat=svg, got %q", p.OutputFormat)
		}
		if svgModel != "" {
			return fail("svgModel requires outputFormat=svg, got %q", p.OutputFormat)
		}
	}

	return p, out, req.GetBool("returnInlineImage", false), nil
}

func (h *handlers) checkKey() error {
	if h.client.apiKey == "" {
		return fmt.Errorf("OPENAI_API_KEY is not set; configure it in the MCP server env")
	}
	return nil
}

func (h *handlers) generateImage(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := h.checkKey(); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	prompt, err := req.RequireString("prompt")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	p, out, inline, err := h.commonArgs(req, false)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	p.Prompt = prompt

	resp, err := h.client.generate(ctx, p)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return saveResults(resp, out, p.OutputFormat, inline)
}

func (h *handlers) editImage(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := h.checkKey(); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	prompt, err := req.RequireString("prompt")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	inputs, err := req.RequireStringSlice("images")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if len(inputs) == 0 || len(inputs) > 16 {
		return mcp.NewToolResultError(fmt.Sprintf("images must contain 1-16 entries, got %d", len(inputs))), nil
	}
	p, out, inline, err := h.commonArgs(req, true)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	p.Prompt = prompt

	ep := editParams{genParams: p, Images: make([]imageRef, 0, len(inputs))}
	var firstRaw []byte
	for i, in := range inputs {
		ref, raw, err := resolveImageRef(in)
		if err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if i == 0 {
			firstRaw = raw
		}
		ep.Images = append(ep.Images, ref)
	}

	maskArg, markupArg := req.GetString("mask", ""), req.GetString("markup", "")
	if maskArg != "" && markupArg != "" {
		return mcp.NewToolResultError("mask and markup cannot be combined; use markup to point at a region with a drawn shape, or mask to mark editable pixels"), nil
	}
	if maskArg != "" {
		ref, _, err := resolveImageRef(maskArg)
		if err != nil {
			return mcp.NewToolResultError(fmt.Errorf("mask: %w", err).Error()), nil
		}
		ep.Mask = &ref
	}
	if markupArg != "" {
		ref, raw, err := resolveImageRef(markupArg)
		if err != nil {
			return mcp.NewToolResultError(fmt.Errorf("markup: %w", err).Error()), nil
		}
		if err := checkMarkup(raw, firstRaw); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		ep.Markup = &ref
	}

	resp, err := h.client.edit(ctx, ep)
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return saveResults(resp, out, p.OutputFormat, inline)
}

func (h *handlers) uploadReference(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	if err := h.checkKey(); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	path, err := req.RequireString("path")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	if !filepath.IsAbs(path) {
		return mcp.NewToolResultError(fmt.Sprintf("path must be an absolute path, got %q", path)), nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("read image %q: %v", path, err)), nil
	}
	if err := checkImageType(raw, path); err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	id, err := h.client.uploadFile(ctx, filepath.Base(path), raw, "vision")
	if err != nil {
		return mcp.NewToolResultError(err.Error()), nil
	}
	return mcp.NewToolResultText(fmt.Sprintf(
		"uploaded %s\nreference: file_id:%s\nPass that string in images, mask or markup to reuse this image without re-uploading it.",
		path, id)), nil
}

func (h *handlers) usageGuide(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultText(guideMD), nil
}

// checkImageType rejects files the Images API will not accept as input.
func checkImageType(raw []byte, name string) error {
	switch http.DetectContentType(raw) {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		return nil
	default:
		return fmt.Errorf("unsupported image type %q in %s (want png/jpeg/webp/gif)", http.DetectContentType(raw), name)
	}
}

// resolveImageRef classifies an input image string into an API image reference:
// file_id: refs pass through as file IDs; data: URIs and http(s) URLs pass
// through as image_url; anything else is read from disk and sent as a data URL.
// The raw bytes are returned for local files so callers can validate them, and
// are nil when the image is only referenced remotely.
func resolveImageRef(s string) (imageRef, []byte, error) {
	switch {
	case strings.HasPrefix(s, "file_id:"):
		return imageRef{FileID: strings.TrimPrefix(s, "file_id:")}, nil, nil
	case strings.HasPrefix(s, "data:"), strings.HasPrefix(s, "http://"), strings.HasPrefix(s, "https://"):
		return imageRef{ImageURL: s}, nil, nil
	}
	raw, err := os.ReadFile(s)
	if err != nil {
		return imageRef{}, nil, fmt.Errorf("read image %q: %w", s, err)
	}
	if err := checkImageType(raw, s); err != nil {
		return imageRef{}, nil, err
	}
	mime := http.DetectContentType(raw)
	return imageRef{ImageURL: "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw)}, raw, nil
}

// checkMarkup validates a markup overlay locally so an obviously bad request
// fails before it is billed: the overlay must be a PNG, and when the first
// input image is also a local PNG the two must share pixel dimensions.
// Either argument may be nil when the image is referenced remotely.
func checkMarkup(markup, first []byte) error {
	if markup == nil {
		return nil
	}
	if http.DetectContentType(markup) != "image/png" {
		return fmt.Errorf("markup overlay must be a transparent PNG, got %q", http.DetectContentType(markup))
	}
	mw, mh, ok := pngSize(markup)
	if !ok || first == nil {
		return nil
	}
	fw, fh, ok := pngSize(first)
	if !ok {
		return nil // first image is not PNG; let the API check dimensions
	}
	if mw != fw || mh != fh {
		return fmt.Errorf("markup overlay is %dx%d but the first image is %dx%d; they must match exactly", mw, mh, fw, fh)
	}
	return nil
}

// pngSize reads width and height from a PNG IHDR chunk.
func pngSize(raw []byte) (w, h int, ok bool) {
	const sigIHDR = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
	if len(raw) < 24 || !strings.HasPrefix(string(raw[:16]), sigIHDR) {
		return 0, 0, false
	}
	return int(binary.BigEndian.Uint32(raw[16:20])), int(binary.BigEndian.Uint32(raw[20:24])), true
}

// saveResults decodes b64 payloads, writes files, and builds the tool result.
func saveResults(resp *imagesResponse, out, format string, inline bool) (*mcp.CallToolResult, error) {
	if len(resp.Data) == 0 {
		return mcp.NewToolResultError("openai: response contained no images"), nil
	}
	info := formats[format]
	paths := outputPaths(out, format, len(resp.Data))
	content := []mcp.Content{}
	var saved []string

	for i, d := range resp.Data {
		if d.B64JSON == "" {
			return mcp.NewToolResultError("openai: image returned without b64_json data"), nil
		}
		raw, err := base64.StdEncoding.DecodeString(d.B64JSON)
		if err != nil {
			return mcp.NewToolResultError(fmt.Sprintf("decode image %d: %v", i+1, err)), nil
		}
		if err := os.MkdirAll(filepath.Dir(paths[i]), 0o755); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		if err := os.WriteFile(paths[i], raw, 0o644); err != nil {
			return mcp.NewToolResultError(err.Error()), nil
		}
		saved = append(saved, paths[i])
		// SVG is XML, not a bitmap: MCP image content would not render it.
		if inline && format != "svg" {
			content = append(content, mcp.NewImageContent(d.B64JSON, info.mime))
		}
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%d image(s) saved:\n", len(saved))
	for _, p := range saved {
		fmt.Fprintf(&b, "- %s\n", p)
	}
	if inline && format == "svg" {
		fmt.Fprintf(&b, "(returnInlineImage skipped: SVG is XML, read the file if you need its source)\n")
	}
	if rp := resp.Data[0].RevisedPrompt; rp != "" {
		fmt.Fprintf(&b, "revised prompt: %s\n", rp)
	}
	if u := resp.Usage; u != nil {
		fmt.Fprintf(&b, "tokens: %d input, %d output", u.InputTokens, u.OutputTokens)
		if d := u.InputTokensDetails; d != nil {
			fmt.Fprintf(&b, " (input: %d text, %d image)", d.TextTokens, d.ImageTokens)
		}
		b.WriteString("\n")
	}
	if s := resp.SVGUsage; s != nil {
		fmt.Fprintf(&b, "svg tokens: %d input, %d output, %d reasoning\n", s.InputTokens, s.OutputTokens, s.ReasoningTokens)
	}
	content = append(content, mcp.NewTextContent(strings.TrimRight(b.String(), "\n")))

	return &mcp.CallToolResult{Content: content}, nil
}

// outputPaths expands outputPath for n images: n==1 uses the path as given
// (extension filled from format if missing); n>1 produces name-1.ext .. name-N.ext.
func outputPaths(out, format string, n int) []string {
	ext := formats[format].ext
	if ext == "" {
		ext = format
	}
	if filepath.Ext(out) == "" {
		out += "." + ext
	}
	if n <= 1 {
		return []string{out}
	}
	e := filepath.Ext(out)
	base := strings.TrimSuffix(out, e)
	paths := make([]string, n)
	for i := range paths {
		paths[i] = fmt.Sprintf("%s-%d%s", base, i+1, e)
	}
	return paths
}
