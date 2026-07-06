package ollama

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"leetgame/internal/llm"
	"leetgame/internal/models"
)

func (c *OllamaClient) EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) (llm.SessionEvaluation, error) {
	prompt := llm.BuildEvaluationPrompt(problem, activeStages, history, concise)

	body := map[string]any{
		"model":  c.model,
		"stream": false,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to marshal evaluation request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/chat", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to create evaluation request: %w", err)
	}
	req.Header.Set("content-type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("ollama evaluation request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.SessionEvaluation{}, fmt.Errorf("ollama API returned status %d: %s", resp.StatusCode, string(b))
	}

	var apiResp struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to decode evaluation response: %w", err)
	}

	text := strings.TrimSpace(apiResp.Message.Content)
	text = llm.StripCodeFence(text)

	if text == "" {
		return llm.SessionEvaluation{}, fmt.Errorf("empty content in ollama evaluation response")
	}

	var eval llm.SessionEvaluation
	if err := json.Unmarshal([]byte(text), &eval); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to parse evaluation JSON %q: %w", text, err)
	}

	return eval, nil
}
