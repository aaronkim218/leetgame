package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"leetgame/internal/llm"
	"leetgame/internal/models"
)

func (c *AnthropicClient) EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []llm.ChatMessage) (llm.SessionEvaluation, error) {
	body := map[string]any{
		"model":      c.model,
		"max_tokens": 1024,
		"stream":     false,
		"system": []map[string]any{
			{
				"type":          "text",
				"text":          llm.BuildEvaluationSystemPrompt(),
				"cache_control": map[string]string{"type": "ephemeral"},
			},
		},
		"messages": []map[string]string{
			{"role": "user", "content": llm.BuildEvaluationUserPrompt(problem, activeStages, history)},
		},
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to marshal evaluation request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to create evaluation request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")
	req.Header.Set("content-type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("claude evaluation request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.SessionEvaluation{}, fmt.Errorf("claude API returned status %d: %s", resp.StatusCode, string(b))
	}

	var apiResp struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to decode evaluation response: %w", err)
	}

	var text string
	for _, block := range apiResp.Content {
		if block.Type == "text" {
			text = block.Text
			break
		}
	}
	if text == "" {
		return llm.SessionEvaluation{}, fmt.Errorf("no text content block in claude evaluation response")
	}
	text = llm.StripCodeFence(text)

	var eval llm.SessionEvaluation
	if err := json.Unmarshal([]byte(text), &eval); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to parse evaluation JSON %q: %w", text, err)
	}

	return eval, nil
}
