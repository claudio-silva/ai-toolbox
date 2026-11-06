package main

import (
	_ "embed"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/server"
)

//go:embed guide.md
var guideMD string

// version is overridden at build time via -ldflags; the fallback tracks the
// major version of the supported API surface (2.x = GPT Image 2.6).
var version = "2.0.0"

const defaultModel = "gpt-image-2.6-sunburst"

const description = "Image generation and editing via OpenAI GPT Image 2.6 (sunburst/flare), with markup edits, animated GIF and SVG output"

const instructions = "Image generation and editing via OpenAI GPT Image 2.6. " +
	"Default to gpt-image-2.6-sunburst for quality, detail, edit fidelity and any production artwork; " +
	"use gpt-image-2.6-flare only when latency matters more than quality (brainstorming, rapid iteration). " +
	"Both cost the same per token. Tune quality and complexity independently. " +
	"Call get_usage_guide for parameter rules, workflows and GPT Image 2.6 prompting techniques."

func main() {
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "-h", "--help", "help":
			fmt.Printf("imagen %s\n%s.\n\nMCP server over stdio; usually spawned by an MCP client, not run by hand.\n\nEnvironment:\n  OPENAI_API_KEY   required for tool calls\n  OPENAI_BASE_URL  API base (default https://api.openai.com/v1)\n  IMAGEN_MODEL     default model (default %s)\n", version, description, defaultModel)
			return
		case "-V", "--version", "version":
			fmt.Println(version)
			return
		}
	}
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		fmt.Fprintln(os.Stderr, "imagen: warning: OPENAI_API_KEY not set; tool calls will fail until configured")
	}
	baseURL := strings.TrimSuffix(os.Getenv("OPENAI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	model := os.Getenv("IMAGEN_MODEL")
	if model == "" {
		model = defaultModel
	}

	h := &handlers{
		client: &client{
			apiKey:  apiKey,
			baseURL: baseURL,
			http:    &http.Client{Timeout: 10 * time.Minute},
		},
		defaultModel: model,
	}

	s := server.NewMCPServer("imagen", version,
		server.WithDescription(description),
		server.WithToolCapabilities(false),
		server.WithRecovery(),
		server.WithInstructions(instructions),
	)
	s.AddTool(generateTool(model), h.generateImage)
	s.AddTool(editTool(model), h.editImage)
	s.AddTool(uploadReferenceTool(), h.uploadReference)
	s.AddTool(usageGuideTool(), h.usageGuide)

	if err := server.ServeStdio(s); err != nil {
		fmt.Fprintf(os.Stderr, "imagen: %v\n", err)
		os.Exit(1)
	}
}
