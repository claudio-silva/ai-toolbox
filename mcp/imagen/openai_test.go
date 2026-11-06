package main

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
)

var pngBytes = append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 32)...)

// pngWithSize builds the minimal PNG prefix checkMarkup inspects: the
// signature plus an IHDR chunk carrying the given dimensions.
func pngWithSize(w, h uint32) []byte {
	b := []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R'}
	b = binary.BigEndian.AppendUint32(b, w)
	b = binary.BigEndian.AppendUint32(b, h)
	return append(b, make([]byte, 8)...)
}

func reqWith(args map[string]any) mcp.CallToolRequest {
	return mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: args}}
}

func newTestServer(t *testing.T, handler http.HandlerFunc) (*client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &client{apiKey: "sk-test", baseURL: srv.URL, http: srv.Client()}, srv
}

func captureBody(t *testing.T, wantStatus int, response string) (http.HandlerFunc, *map[string]any, **http.Request) {
	t.Helper()
	var body map[string]any
	var lastReq *http.Request
	return func(w http.ResponseWriter, r *http.Request) {
		lastReq = r
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(wantStatus)
		w.Write([]byte(response))
	}, &body, &lastReq
}

func TestGenerateRequestShape(t *testing.T) {
	handler, body, lastReq := captureBody(t, 200, `{"created":1,"data":[{"b64_json":"aGk="}]}`)
	c, _ := newTestServer(t, handler)

	_, err := c.generate(context.Background(), genParams{
		Model: "gpt-image-2.6-sunburst", Prompt: "a cat", Size: "auto", Quality: "auto",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := (*lastReq).Header.Get("Authorization"); got != "Bearer sk-test" {
		t.Fatalf("auth header = %q", got)
	}
	if (*body)["model"] != "gpt-image-2.6-sunburst" || (*body)["prompt"] != "a cat" {
		t.Fatalf("body = %v", *body)
	}
	for _, absent := range []string{"output_compression", "moderation", "n", "images", "mask",
		"markup", "complexity", "frame_count", "frame_duration_ms", "svg", "input_fidelity"} {
		if _, ok := (*body)[absent]; ok {
			t.Fatalf("field %q should be omitted: %v", absent, *body)
		}
	}
}

func TestEditRequestShape(t *testing.T) {
	handler, body, _ := captureBody(t, 200, `{"created":1,"data":[{"b64_json":"aGk="}]}`)
	c, _ := newTestServer(t, handler)

	comp := 80
	_, err := c.edit(context.Background(), editParams{
		genParams: genParams{Model: "gpt-image-2.6-sunburst", Prompt: "swap bg",
			OutputCompression: &comp, Background: "transparent", OutputFormat: "png",
			Complexity: "low"},
		Images: []imageRef{{ImageURL: "https://example.com/a.png"}, {FileID: "file-abc"}},
		Mask:   &imageRef{ImageURL: "data:image/png;base64,aGk="},
	})
	if err != nil {
		t.Fatal(err)
	}
	imgs, ok := (*body)["images"].([]any)
	if !ok || len(imgs) != 2 {
		t.Fatalf("images = %v", (*body)["images"])
	}
	if imgs[1].(map[string]any)["file_id"] != "file-abc" {
		t.Fatalf("file_id ref lost: %v", imgs[1])
	}
	if (*body)["mask"].(map[string]any)["image_url"] == "" {
		t.Fatalf("mask = %v", (*body)["mask"])
	}
	if (*body)["output_compression"].(float64) != 80 {
		t.Fatalf("output_compression = %v", (*body)["output_compression"])
	}
	if (*body)["complexity"] != "low" {
		t.Fatalf("complexity = %v", (*body)["complexity"])
	}
}

// Markup is the 2.6 overlay parameter; it must serialize as a sibling of images.
func TestEditMarkupRequestShape(t *testing.T) {
	handler, body, _ := captureBody(t, 200, `{"created":1,"data":[{"b64_json":"aGk="}]}`)
	c, _ := newTestServer(t, handler)

	_, err := c.edit(context.Background(), editParams{
		genParams: genParams{Model: "gpt-image-2.6-sunburst", Prompt: "recolor the vase"},
		Images:    []imageRef{{ImageURL: "https://example.com/a.png"}},
		Markup:    &imageRef{FileID: "file-overlay"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if (*body)["markup"].(map[string]any)["file_id"] != "file-overlay" {
		t.Fatalf("markup = %v", (*body)["markup"])
	}
	if _, ok := (*body)["mask"]; ok {
		t.Fatalf("mask should be absent: %v", *body)
	}
}

// GIF and SVG knobs must reach the wire with the documented field names.
func TestGenerateGIFAndSVGRequestShape(t *testing.T) {
	handler, body, _ := captureBody(t, 200, `{"created":1,"data":[{"b64_json":"aGk="}]}`)
	c, _ := newTestServer(t, handler)

	fc, fd := 9, 200
	if _, err := c.generate(context.Background(), genParams{
		Model: "gpt-image-2.6-sunburst", Prompt: "a looping wave", OutputFormat: "gif",
		FrameCount: &fc, FrameDurationMS: &fd,
	}); err != nil {
		t.Fatal(err)
	}
	if (*body)["frame_count"].(float64) != 9 || (*body)["frame_duration_ms"].(float64) != 200 {
		t.Fatalf("gif params = %v", *body)
	}

	if _, err := c.generate(context.Background(), genParams{
		Model: "gpt-image-2.6-flare", Prompt: "a logo", OutputFormat: "svg", N: 1,
		SVG: &svgOptions{Model: "svg-author-model", Reasoning: &svgReasoning{Effort: "high"}},
	}); err != nil {
		t.Fatal(err)
	}
	svg, ok := (*body)["svg"].(map[string]any)
	if !ok {
		t.Fatalf("svg = %v", (*body)["svg"])
	}
	if svg["reasoning"].(map[string]any)["effort"] != "high" {
		t.Fatalf("svg.reasoning.effort = %v", svg["reasoning"])
	}
	if svg["model"] != "svg-author-model" {
		t.Fatalf("svg.model = %v", svg["model"])
	}
}

func TestUploadFile(t *testing.T) {
	var gotPurpose, gotFilename, gotContentType string
	handler := func(w http.ResponseWriter, r *http.Request) {
		gotContentType = r.Header.Get("Content-Type")
		r.ParseMultipartForm(1 << 20)
		gotPurpose = r.FormValue("purpose")
		if f, hdr, err := r.FormFile("file"); err == nil {
			gotFilename = hdr.Filename
			f.Close()
		}
		w.Write([]byte(`{"id":"file-abc","bytes":40}`))
	}
	c, _ := newTestServer(t, handler)

	id, err := c.uploadFile(context.Background(), "ref.png", pngBytes, "vision")
	if err != nil {
		t.Fatal(err)
	}
	if id != "file-abc" {
		t.Fatalf("id = %q", id)
	}
	if gotPurpose != "vision" || gotFilename != "ref.png" {
		t.Fatalf("purpose=%q filename=%q", gotPurpose, gotFilename)
	}
	if !strings.HasPrefix(gotContentType, "multipart/form-data") {
		t.Fatalf("content type = %q", gotContentType)
	}
}

func TestResolveImageRef(t *testing.T) {
	dir := t.TempDir()
	png := filepath.Join(dir, "in.png")
	os.WriteFile(png, pngBytes, 0o644)
	txt := filepath.Join(dir, "in.txt")
	os.WriteFile(txt, []byte("hello"), 0o644)

	if r, raw, _ := resolveImageRef("file_id:file-xyz"); r.FileID != "file-xyz" || raw != nil {
		t.Fatalf("file_id: %v %v", r, raw)
	}
	if r, raw, _ := resolveImageRef("https://x/y.png"); r.ImageURL != "https://x/y.png" || raw != nil {
		t.Fatalf("url: %v %v", r, raw)
	}
	if r, _, _ := resolveImageRef("data:image/png;base64,AA=="); !strings.HasPrefix(r.ImageURL, "data:") {
		t.Fatalf("data uri: %v", r)
	}
	r, raw, err := resolveImageRef(png)
	if err != nil || !strings.HasPrefix(r.ImageURL, "data:image/png;base64,") || raw == nil {
		t.Fatalf("local png: %v %v %v", r, raw, err)
	}
	if _, _, err := resolveImageRef(filepath.Join(dir, "missing.png")); err == nil {
		t.Fatal("expected error for missing file")
	}
	if _, _, err := resolveImageRef(txt); err == nil || !strings.Contains(err.Error(), "unsupported image type") {
		t.Fatalf("expected type error, got %v", err)
	}
}

func TestAPIErrorMapping(t *testing.T) {
	handler, _, _ := captureBody(t, 400, `{"error":{"message":"blocked","type":"image_generation_user_error","code":"moderation_blocked","moderation_details":{"moderation_stage":"input"}}}`)
	c, _ := newTestServer(t, handler)

	_, err := c.generate(context.Background(), genParams{Prompt: "x"})
	if err == nil {
		t.Fatal("expected error")
	}
	ae, ok := err.(*apiError)
	if !ok {
		t.Fatalf("got %T: %v", err, err)
	}
	if ae.Code != "moderation_blocked" || ae.Status != 400 || !strings.Contains(err.Error(), "moderation_details") {
		t.Fatalf("apiError = %+v", ae)
	}
}

func TestOutputPaths(t *testing.T) {
	dir := t.TempDir()
	base := filepath.Join(dir, "img.png")

	if got := outputPaths(base, "png", 1); len(got) != 1 || got[0] != base {
		t.Fatalf("n=1: %v", got)
	}
	got := outputPaths(base, "png", 3)
	want := []string{filepath.Join(dir, "img-1.png"), filepath.Join(dir, "img-2.png"), filepath.Join(dir, "img-3.png")}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("n=3: %v, want %v", got, want)
		}
	}
	if got := outputPaths(filepath.Join(dir, "img"), "jpeg", 1); got[0] != filepath.Join(dir, "img.jpg") {
		t.Fatalf("ext fill: %v", got)
	}
}

func TestCommonArgsValidation(t *testing.T) {
	h := &handlers{defaultModel: "gpt-image-2.6-sunburst"}
	abs := filepath.Join(t.TempDir(), "o.png")

	bad := []struct {
		name string
		args map[string]any
		edit bool
	}{
		{"relative outputPath", map[string]any{"outputPath": "rel/o.png"}, false},
		{"transparent+jpeg", map[string]any{"outputPath": abs, "background": "transparent", "outputFormat": "jpeg"}, false},
		{"compression+png", map[string]any{"outputPath": abs, "outputCompression": 50.0, "outputFormat": "png"}, false},
		{"compression+gif", map[string]any{"outputPath": abs, "outputCompression": 50.0, "outputFormat": "gif"}, false},
		{"unknown format", map[string]any{"outputPath": abs, "outputFormat": "tiff"}, false},
		{"svg on edits", map[string]any{"outputPath": abs, "outputFormat": "svg"}, true},
		{"svg with n>1", map[string]any{"outputPath": abs, "outputFormat": "svg", "n": 2.0}, false},
		{"svg effort without svg", map[string]any{"outputPath": abs, "svgReasoningEffort": "high"}, false},
		{"svgModel without svg", map[string]any{"outputPath": abs, "svgModel": "some-model"}, false},
		{"frameCount without gif", map[string]any{"outputPath": abs, "frameCount": 9.0}, false},
		{"frameDurationMs without gif", map[string]any{"outputPath": abs, "frameDurationMs": 200.0}, false},
		{"frameCount out of range", map[string]any{"outputPath": abs, "outputFormat": "gif", "frameCount": 17.0}, false},
		{"frameDurationMs out of range", map[string]any{"outputPath": abs, "outputFormat": "gif", "frameDurationMs": 10.0}, false},
	}
	for _, tc := range bad {
		if _, _, _, err := h.commonArgs(reqWith(tc.args), tc.edit); err == nil {
			t.Errorf("%s should fail", tc.name)
		}
	}

	p, out, inline, err := h.commonArgs(reqWith(map[string]any{
		"outputPath": abs, "outputCompression": 50.0, "outputFormat": "webp", "n": 2.0,
		"complexity": "low",
	}), false)
	if err != nil || *p.OutputCompression != 50 || p.N != 2 || out != abs || inline {
		t.Fatalf("valid args: %+v %v %v %v", p, out, inline, err)
	}
	if p.Model != "gpt-image-2.6-sunburst" || p.Complexity != "low" {
		t.Fatalf("model/complexity = %q %q", p.Model, p.Complexity)
	}

	// Complexity is omitted unless asked for, so the API default (high) applies.
	p, _, _, err = h.commonArgs(reqWith(map[string]any{"outputPath": abs}), false)
	if err != nil || p.Complexity != "" {
		t.Fatalf("complexity should default to empty: %q %v", p.Complexity, err)
	}

	// Transparent SVG and GIF frame controls are accepted.
	p, _, _, err = h.commonArgs(reqWith(map[string]any{
		"outputPath": abs, "outputFormat": "svg", "background": "transparent",
		"svgReasoningEffort": "high", "svgModel": "svg-author-model",
	}), false)
	if err != nil || p.SVG.Reasoning.Effort != "high" || p.SVG.Model != "svg-author-model" {
		t.Fatalf("svg args: %+v %v", p, err)
	}

	// Accounts with SVG model selection disabled must send no svg object at all.
	p, _, _, err = h.commonArgs(reqWith(map[string]any{
		"outputPath": abs, "outputFormat": "svg",
	}), false)
	if err != nil || p.SVG != nil {
		t.Fatalf("svg object should be omitted when unset: %+v %v", p.SVG, err)
	}
	p, _, _, err = h.commonArgs(reqWith(map[string]any{
		"outputPath": abs, "outputFormat": "gif", "frameCount": 16.0, "frameDurationMs": 2000.0,
	}), false)
	if err != nil || *p.FrameCount != 16 || *p.FrameDurationMS != 2000 {
		t.Fatalf("gif args: %+v %v", p, err)
	}
}

func TestCheckMarkup(t *testing.T) {
	png1200 := pngWithSize(1200, 900)
	png800 := pngWithSize(800, 600)

	if err := checkMarkup(png1200, png1200); err != nil {
		t.Fatalf("matching dimensions: %v", err)
	}
	if err := checkMarkup(png1200, png800); err == nil {
		t.Fatal("mismatched dimensions should fail")
	}
	if err := checkMarkup(nil, png1200); err != nil {
		t.Fatalf("remote markup should be allowed: %v", err)
	}
	if err := checkMarkup(png1200, nil); err != nil {
		t.Fatalf("remote first image should be allowed: %v", err)
	}
	if err := checkMarkup([]byte("\xff\xd8\xffnot a png"), png1200); err == nil {
		t.Fatal("non-png markup should fail")
	}
}

func TestOutputPathExtensions(t *testing.T) {
	dir := t.TempDir()
	for format, wantExt := range map[string]string{
		"png": ".png", "jpeg": ".jpg", "webp": ".webp", "gif": ".gif", "svg": ".svg",
	} {
		got := outputPaths(filepath.Join(dir, "o"), format, 1)[0]
		if filepath.Ext(got) != wantExt {
			t.Errorf("format %s -> %s, want extension %s", format, got, wantExt)
		}
	}
}

func TestSaveResults(t *testing.T) {
	dir := t.TempDir()
	raw := pngBytes
	resp := &imagesResponse{}
	json.Unmarshal([]byte(`{"created":1,"data":[{"b64_json":"`+base64.StdEncoding.EncodeToString(raw)+`","revised_prompt":"rp"}],"usage":{"input_tokens":10,"output_tokens":100,"total_tokens":110}}`), resp)

	res, err := saveResults(resp, filepath.Join(dir, "sub", "o.png"), "png", true)
	if err != nil || res.IsError {
		t.Fatalf("saveResults: %v %v", res, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "sub", "o.png")); err != nil {
		t.Fatalf("file not written: %v", err)
	}
	if len(res.Content) != 2 {
		t.Fatalf("want text+image content, got %d", len(res.Content))
	}
	if _, ok := res.Content[0].(mcp.ImageContent); !ok {
		t.Fatalf("first content should be ImageContent, got %T", res.Content[0])
	}
}

func TestUsageGuide(t *testing.T) {
	h := &handlers{}
	res, err := h.usageGuide(context.Background(), reqWith(nil))
	if err != nil || res.IsError || len(res.Content) == 0 {
		t.Fatalf("usageGuide: %v %v", res, err)
	}
	tc, ok := res.Content[0].(mcp.TextContent)
	if !ok || !strings.Contains(tc.Text, "gpt-image-2.6-sunburst") {
		t.Fatalf("guide content wrong: %v", res.Content[0])
	}
}

func TestParseTimeout(t *testing.T) {
	cases := []struct {
		in      string
		want    time.Duration
		wantErr bool
	}{
		{"", defaultTimeout, false},
		{"20m", 20 * time.Minute, false},
		{"900s", 900 * time.Second, false},
		{"soon", defaultTimeout, true},
		{"0s", defaultTimeout, true},
		{"-5m", defaultTimeout, true},
	}
	for _, c := range cases {
		got, err := parseTimeout(c.in)
		if got != c.want || (err != nil) != c.wantErr {
			t.Errorf("parseTimeout(%q) = %v, %v; want %v, err=%v", c.in, got, err, c.want, c.wantErr)
		}
	}
}
