package ollama

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

type OllamaClient struct {
	baseURL    string
	model      string
	apiKey     string
	httpClient *http.Client
}

func New(baseURL, model, apiKey string) *OllamaClient {
	return &OllamaClient{
		baseURL:    baseURL,
		model:      model,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Minute},
	}
}

func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (llm.EvaluateResponse, error) {
	systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages, hintRequested, answerRequested)

	messages := make([]map[string]string, 0, len(history)+2)
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})
	for _, h := range history {
		messages = append(messages, map[string]string{"role": h.Role, "content": h.Content})
	}
	messages = append(messages, map[string]string{"role": "user", "content": userMessage})

	body := map[string]any{
		"model":    c.model,
		"messages": messages,
		"stream":   true,
		"think":    false,
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/chat", bytes.NewReader(bodyBytes))
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("content-type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("ollama request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return llm.EvaluateResponse{}, fmt.Errorf("ollama API returned status %d: %s", resp.StatusCode, string(b))
	}

	var fullText strings.Builder
	ex := llm.NewExtractor(onToken)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1*1024*1024)
	for scanner.Scan() {
		if ctx.Err() != nil {
			return llm.EvaluateResponse{}, ctx.Err()
		}
		var chunk struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Done bool `json:"done"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &chunk); err != nil {
			continue
		}
		if chunk.Done {
			break
		}
		tok := chunk.Message.Content
		if tok == "" {
			continue
		}
		fullText.WriteString(tok)
		ex.Add(tok)
	}

	ex.Flush(ctx)

	if err := scanner.Err(); err != nil {
		return llm.EvaluateResponse{}, fmt.Errorf("error reading ollama stream: %w", err)
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
