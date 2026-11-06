package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
)

// apiError is a non-2xx response from the OpenAI Images API.
type apiError struct {
	Status  int
	Message string
	Type    string
	Code    string
	Details json.RawMessage // moderation_details, when present
}

func (e *apiError) Error() string {
	s := fmt.Sprintf("openai: status %d: %s", e.Status, e.Message)
	if e.Type != "" {
		s += fmt.Sprintf(" (type=%s", e.Type)
		if e.Code != "" {
			s += ", code=" + e.Code
		}
		s += ")"
	} else if e.Code != "" {
		s += " (code=" + e.Code + ")"
	}
	if len(e.Details) > 0 {
		s += " moderation_details=" + string(e.Details)
	}
	return s
}

// imageRef is an input image for the edits endpoint: either an uploaded
// File API ID or a URL (remote https URL or base64 data URL). The API
// requires exactly one of the two.
type imageRef struct {
	FileID   string `json:"file_id,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}

// svgReasoning is the reasoning sub-object of the generations `svg` parameter.
type svgReasoning struct {
	Effort string `json:"effort,omitempty"`
}

// svgOptions is the generations-only `svg` parameter (output_format=svg).
type svgOptions struct {
	Reasoning *svgReasoning `json:"reasoning,omitempty"`
}

// genParams mirrors POST /v1/images/generations (gpt-image-2.6 surface).
type genParams struct {
	Model             string      `json:"model,omitempty"`
	Prompt            string      `json:"prompt"`
	N                 int         `json:"n,omitempty"`
	Size              string      `json:"size,omitempty"`
	Quality           string      `json:"quality,omitempty"`
	Complexity        string      `json:"complexity,omitempty"`
	Background        string      `json:"background,omitempty"`
	OutputFormat      string      `json:"output_format,omitempty"`
	OutputCompression *int        `json:"output_compression,omitempty"`
	Moderation        string      `json:"moderation,omitempty"`
	FrameCount        *int        `json:"frame_count,omitempty"`
	FrameDurationMS   *int        `json:"frame_duration_ms,omitempty"`
	SVG               *svgOptions `json:"svg,omitempty"`
}

// editParams mirrors POST /v1/images/edits. `markup` is the GPT Image 2.5/2.6
// markup-guided edit overlay; the API rejects it combined with `mask`.
type editParams struct {
	genParams
	Images []imageRef `json:"images"`
	Mask   *imageRef  `json:"mask,omitempty"`
	Markup *imageRef  `json:"markup,omitempty"`
}

type tokenDetails struct {
	ImageTokens int `json:"image_tokens"`
	TextTokens  int `json:"text_tokens"`
}

type usage struct {
	InputTokens         int           `json:"input_tokens"`
	OutputTokens        int           `json:"output_tokens"`
	TotalTokens         int           `json:"total_tokens"`
	InputTokensDetails  *tokenDetails `json:"input_tokens_details"`
	OutputTokensDetails *tokenDetails `json:"output_tokens_details"`
}

// svgUsage is reported in addition to `usage` when output_format=svg.
type svgUsage struct {
	Model           string `json:"model"`
	InputTokens     int    `json:"input_tokens"`
	OutputTokens    int    `json:"output_tokens"`
	ReasoningTokens int    `json:"reasoning_tokens"`
	TotalTokens     int    `json:"total_tokens"`
}

type imagesResponse struct {
	Created      int64  `json:"created"`
	Background   string `json:"background"`
	OutputFormat string `json:"output_format"`
	Quality      string `json:"quality"`
	Size         string `json:"size"`
	Data         []struct {
		B64JSON       string `json:"b64_json"`
		RevisedPrompt string `json:"revised_prompt"`
		URL           string `json:"url"`
	} `json:"data"`
	Usage    *usage    `json:"usage"`
	SVGUsage *svgUsage `json:"svg_usage"`
}

type client struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

func (c *client) generate(ctx context.Context, p genParams) (*imagesResponse, error) {
	return c.post(ctx, "/images/generations", p)
}

func (c *client) edit(ctx context.Context, p editParams) (*imagesResponse, error) {
	return c.post(ctx, "/images/edits", p)
}

func (c *client) post(ctx context.Context, path string, payload any) (*imagesResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	data, err := c.do(req)
	if err != nil {
		return nil, err
	}
	var out imagesResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &out, nil
}

// uploadFile sends a file to POST /v1/files and returns its file ID. Reference
// images uploaded with purpose "vision" can be reused across many image calls
// by passing "file_id:<id>" instead of re-encoding the bytes every time.
func (c *client) uploadFile(ctx context.Context, name string, content []byte, purpose string) (string, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if err := mw.WriteField("purpose", purpose); err != nil {
		return "", err
	}
	part, err := mw.CreateFormFile("file", name)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(content); err != nil {
		return "", err
	}
	if err := mw.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/files", &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", mw.FormDataContentType())

	data, err := c.do(req)
	if err != nil {
		return "", err
	}
	var out struct {
		ID    string `json:"id"`
		Bytes int64  `json:"bytes"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if out.ID == "" {
		return "", fmt.Errorf("openai: upload returned no file id")
	}
	return out.ID, nil
}

// do authenticates and performs req, returning the raw body or an *apiError.
func (c *client) do(req *http.Request) ([]byte, error) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 512<<20))
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var e struct {
			Error struct {
				Message           string          `json:"message"`
				Type              string          `json:"type"`
				Code              string          `json:"code"`
				ModerationDetails json.RawMessage `json:"moderation_details"`
			} `json:"error"`
		}
		if json.Unmarshal(data, &e) == nil && e.Error.Message != "" {
			return nil, &apiError{
				Status:  resp.StatusCode,
				Message: e.Error.Message,
				Type:    e.Error.Type,
				Code:    e.Error.Code,
				Details: e.Error.ModerationDetails,
			}
		}
		return nil, &apiError{Status: resp.StatusCode, Message: string(bytes.TrimSpace(data))}
	}
	return data, nil
}
