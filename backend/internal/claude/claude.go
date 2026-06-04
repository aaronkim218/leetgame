package claude

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"leetgame/internal/llm"
	"leetgame/internal/models"
)

type AnthropicClient struct {
	apiKey     string
	model      string
	httpClient *http.Client
}

func New(apiKey, model string) *AnthropicClient {
	return &AnthropicClient{
		apiKey:     apiKey,
		model:      model,
		httpClient: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (llm.EvaluateResponse, error) {
	messages := make([]map[string]string, 0, len(history)+1)
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userMessage})

	stablePrompt := llm.BuildStableSystemPrompt(problem.Title, problem.Description, activeStages)
	volatileSuffix := llm.BuildVolatileSystemSuffix(stage, hintRequested, answerRequested)

	body := map[string]any{
		"model":      c.model,
		"max_tokens": 1024,
		"stream":     true,
		"system": []map[string]any{
			{
				"type":          "text",
				"text":          stablePrompt,
				"cache_control": map[string]string{"type": "ephemeral"},
			},
			{
				"type": "text",
				"text": volatileSuffix,
			},
		},
		"messages": messages,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.EvaluateResponse{}, fmt.Errorf("claude API returned status %d: %s", resp.StatusCode, string(b))
	}

	var fullText strings.Builder
	ex := llm.NewExtractor(onToken)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1*1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return llm.EvaluateResponse{}, ctx.Err()
		}
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := line[6:]
		var event struct {
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}
		if event.Type == "message_stop" {
			break
		}
		if event.Type == "content_block_delta" && event.Delta.Type == "text_delta" {
			tok := event.Delta.Text
			if tok == "" {
				continue
			}
			fullText.WriteString(tok)
			ex.Add(tok)
		}
	}

	ex.Flush(ctx)

	if err := scanner.Err(); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("error reading claude stream: %w", err)
	}

	text := strings.TrimSpace(fullText.String())
	text = llm.StripCodeFence(text)

	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(text), &evalResp); err != nil {
		return llm.EvaluateResponse{Message: text, Stage: stage}, nil
	}

	validStages := map[string]bool{"complete": true}
	for _, s := range activeStages {
		validStages[s] = true
	}
	if !validStages[evalResp.Stage] {
		return llm.EvaluateResponse{Message: text, Stage: stage}, nil
	}

	return evalResp, nil
}

