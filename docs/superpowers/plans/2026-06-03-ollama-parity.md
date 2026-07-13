# Ollama Client Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Ollama LLM client to full parity with the Anthropic client: fix two robustness gaps in streaming, add `EvaluateSession()`, and fix `main.go` to wire any client that implements `llm.Evaluator` instead of hard-coding a concrete type check.

**Architecture:** Three changes across four files. Task 1 fixes defensive gaps in `ollama.go` (code fence stripping in the extractor and final JSON parse). Task 2 adds `ollama/evaluate.go` implementing `llm.Evaluator`. Task 3 changes the `main.go` evaluator wiring from a concrete type assertion (`*claude.AnthropicClient`) to an interface assertion (`llm.Evaluator`) so any future client that implements `EvaluateSession` is automatically wired.

**Tech Stack:** Go, `net/http`, `leetgame/internal/llm` interfaces, `testify/assert` + `testify/require` for tests.

---

### Context for all tasks

**`llm.Client` interface** (`backend/internal/llm/llm.go:96`):
```go
type Client interface {
    Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (EvaluateResponse, error)
}
```

**`llm.Evaluator` interface** (`backend/internal/llm/evaluation.go:21`):
```go
type Evaluator interface {
    EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []ChatMessage) (SessionEvaluation, error)
}
```

**`llm.SessionEvaluation`** (`backend/internal/llm/evaluation.go:17`):
```go
type SessionEvaluation struct {
    Scores []TopicScore `json:"scores"`
}
type TopicScore struct {
    Topic string  `json:"topic"`
    Stage string  `json:"stage"`
    Score float64 `json:"score"`
}
```

**Ollama `/api/chat` non-streaming response shape:**
```json
{
  "message": {"role": "assistant", "content": "..."},
  "done": true
}
```

---

### Task 1: Fix robustness gaps in ollama.go

**Files:**
- Modify: `backend/internal/ollama/ollama.go`
- Modify: `backend/internal/ollama/ollama_test.go`

**Background:** Two gaps vs. the Anthropic client:
1. `extractor.add()` doesn't strip a leading code fence before looking for the JSON prefix — local models often wrap responses in ` ```json `. The Claude extractor does strip it.
2. The final JSON parse calls `json.Unmarshal([]byte(fullText.String()), ...)` without `strings.TrimSpace` or code fence stripping. Claude does both.

- [ ] **Step 1: Write a failing test for code-fence-wrapped streaming response**

Add to `backend/internal/ollama/ollama_test.go` (after the existing tests):

```go
func TestEvaluate_code_fence_wrapped_response(t *testing.T) {
	// Local models often wrap their JSON in a code fence — extractor must handle it
	tokens := []string{"```json\n", `{"message": "Hello world", "stage": "algorithm"}`, "\n```"}
	srv := makeOllamaServer(tokens)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers"}

	var received []string
	result, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", false, false, func(tok string) {
		received = append(received, tok)
	})

	require.NoError(t, err)
	assert.Equal(t, "Hello world", strings.Join(received, ""), "streamed tokens must be clean message content, not raw JSON")
	assert.Equal(t, "Hello world", result.Message)
	assert.Equal(t, "algorithm", result.Stage)
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd backend && go test ./internal/ollama/... -run TestEvaluate_code_fence_wrapped_response -v
```

Expected: FAIL — the extractor won't find the JSON prefix inside the code fence, so `result.Message` will be wrong.

- [ ] **Step 3: Add `stripCodeFence` helper to ollama.go**

Add this function at the bottom of `backend/internal/ollama/ollama.go` (after `forward`):

```go
func stripCodeFence(s string) string {
	if !strings.HasPrefix(s, "```") {
		return s
	}
	if idx := strings.Index(s, "\n"); idx >= 0 {
		s = s[idx+1:]
	}
	if idx := strings.LastIndex(s, "```"); idx >= 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return s
}
```

- [ ] **Step 4: Fix `extractor.add()` to strip code fences**

Replace the `stateBefore` branch in `add()` in `backend/internal/ollama/ollama.go`:

Old:
```go
	if e.state == stateBefore {
		if strings.HasPrefix(e.accumulated, msgPrefix) {
			e.state = stateMessage
			after := e.accumulated[len(msgPrefix):]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
```

New:
```go
	if e.state == stateBefore {
		// skip leading code fence (```json\n or ```\n) before looking for JSON prefix
		content := e.accumulated
		if strings.HasPrefix(content, "```") {
			if idx := strings.Index(content, "\n"); idx >= 0 {
				content = content[idx+1:]
			}
		}
		if strings.HasPrefix(content, msgPrefix) {
			e.state = stateMessage
			after := content[len(msgPrefix):]
			if after != "" {
				e.forward(after)
			}
		}
		return
	}
```

- [ ] **Step 5: Fix the final JSON parse in `Evaluate()` to use TrimSpace + stripCodeFence**

In `backend/internal/ollama/ollama.go`, replace lines 118–128 (the final parse block):

Old:
```go
	var evalResp llm.EvaluateResponse
	if err := json.Unmarshal([]byte(fullText.String()), &evalResp); err != nil {
		return llm.EvaluateResponse{Message: fullText.String(), Stage: stage}, nil
	}
	validStages := map[string]bool{"complete": true}
	for _, s := range activeStages {
		validStages[s] = true
	}
	if !validStages[evalResp.Stage] {
		return llm.EvaluateResponse{Message: fullText.String(), Stage: stage}, nil
	}

	return evalResp, nil
```

New:
```go
	text := strings.TrimSpace(fullText.String())
	text = stripCodeFence(text)

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
```

- [ ] **Step 6: Run all ollama tests**

```bash
cd backend && go test ./internal/ollama/... -v
```

Expected: all tests PASS including `TestEvaluate_code_fence_wrapped_response`.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/ollama/ollama.go backend/internal/ollama/ollama_test.go
git commit -m "fix: ollama extractor and final parse handle code-fence-wrapped responses"
```

---

### Task 2: Add EvaluateSession to Ollama

**Files:**
- Create: `backend/internal/ollama/evaluate.go`
- Modify: `backend/internal/ollama/ollama_test.go`

**Background:** The `claude` package has `evaluate.go` implementing `llm.Evaluator` via `EvaluateSession()`. The `ollama` package has no equivalent — when the server runs with `LLM_PROVIDER=ollama`, end-of-session scoring is silently disabled (evaluator = nil in main.go). This task adds the missing method.

`EvaluateSession` sends the evaluation prompt as a single user message to `/api/chat` with `stream: false`, then parses the non-streaming response.

- [ ] **Step 1: Write failing tests**

Add to `backend/internal/ollama/ollama_test.go`:

```go
func makeOllamaEvalServer(content string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": content},
			"done":    true,
		})
		w.Header().Set("Content-Type", "application/json")
		w.Write(resp)
	}))
}

func TestEvaluateSession_returns_scores(t *testing.T) {
	content := `{"scores": [{"topic": "Dynamic Programming", "stage": "pattern", "score": 0.8}]}`
	srv := makeOllamaEvalServer(content)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers", TopicTags: []string{"Dynamic Programming"}}
	history := []llm.ChatMessage{{Role: "user", Content: "I'd use DP here"}}

	eval, err := client.EvaluateSession(context.Background(), problem, []string{"pattern"}, history)
	require.NoError(t, err)
	require.Len(t, eval.Scores, 1)
	assert.Equal(t, "Dynamic Programming", eval.Scores[0].Topic)
	assert.Equal(t, "pattern", eval.Scores[0].Stage)
	assert.Equal(t, 0.8, eval.Scores[0].Score)
}

func TestEvaluateSession_strips_code_fence(t *testing.T) {
	content := "```json\n{\"scores\": [{\"topic\": \"Arrays\", \"stage\": \"algorithm\", \"score\": 0.6}]}\n```"
	srv := makeOllamaEvalServer(content)
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers", TopicTags: []string{"Arrays"}}

	eval, err := client.EvaluateSession(context.Background(), problem, []string{"algorithm"}, nil)
	require.NoError(t, err)
	require.Len(t, eval.Scores, 1)
	assert.Equal(t, 0.6, eval.Scores[0].Score)
}

func TestEvaluateSession_api_error(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("internal server error"))
	}))
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find"}

	_, err := client.EvaluateSession(context.Background(), problem, []string{"pattern"}, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "500")
}

func TestEvaluateSession_sends_prompt_to_api(t *testing.T) {
	var capturedBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedBody, _ = io.ReadAll(r.Body)
		content := `{"scores": [{"topic": "Arrays", "stage": "pattern", "score": 0.4}]}`
		resp, _ := json.Marshal(map[string]any{
			"message": map[string]string{"role": "assistant", "content": content},
			"done":    true,
		})
		w.Header().Set("Content-Type", "application/json")
		w.Write(resp)
	}))
	defer srv.Close()

	client := ollama.New(srv.URL, "test-model", "")
	problem := models.Problem{Id: uuid.New(), Title: "Two Sum", Description: "find two numbers", TopicTags: []string{"Arrays"}}
	history := []llm.ChatMessage{{Role: "user", Content: "two pointers"}}

	_, err := client.EvaluateSession(context.Background(), problem, []string{"pattern"}, history)
	require.NoError(t, err)

	body := string(capturedBody)
	assert.Contains(t, body, "Two Sum", "request must include problem title")
	assert.Contains(t, body, "two pointers", "request must include conversation history")
	assert.Contains(t, body, `"stream":false`, "request must be non-streaming")
}
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd backend && go test ./internal/ollama/... -run "TestEvaluateSession" -v
```

Expected: compile error — `client.EvaluateSession` undefined.

- [ ] **Step 3: Create `backend/internal/ollama/evaluate.go`**

```go
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

func (c *OllamaClient) EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []llm.ChatMessage) (llm.SessionEvaluation, error) {
	prompt := llm.BuildEvaluationPrompt(problem, activeStages, history)

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
	defer resp.Body.Close()

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
	text = stripCodeFence(text)

	var eval llm.SessionEvaluation
	if err := json.Unmarshal([]byte(text), &eval); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to parse evaluation JSON %q: %w", text, err)
	}

	return eval, nil
}
```

Note: `stripCodeFence` is defined in `ollama.go` (same package) — no need to redefine it.

- [ ] **Step 4: Run all EvaluateSession tests**

```bash
cd backend && go test ./internal/ollama/... -run "TestEvaluateSession" -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Run the full ollama test suite**

```bash
cd backend && go test ./internal/ollama/... -v
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/ollama/evaluate.go backend/internal/ollama/ollama_test.go
git commit -m "feat: add EvaluateSession to OllamaClient"
```

---

### Task 3: Fix main.go evaluator wiring

**Files:**
- Modify: `backend/cmd/server/main.go`

**Background:** `main.go` currently type-asserts `llmClient` to the concrete type `*claude.AnthropicClient` to get the `llm.Evaluator`. This means even after Task 2 adds `EvaluateSession` to `OllamaClient`, the evaluator will still be nil when running with Ollama. The fix is a single-line change: assert to the `llm.Evaluator` interface instead of the concrete type. Any client implementing `EvaluateSession` will then be wired automatically.

- [ ] **Step 1: Change the evaluator wiring in main.go**

In `backend/cmd/server/main.go`, replace lines 56–59:

Old:
```go
	var evaluator llm.Evaluator
	if ac, ok := llmClient.(*claude.AnthropicClient); ok {
		evaluator = ac
	}
```

New:
```go
	var evaluator llm.Evaluator
	if ev, ok := llmClient.(llm.Evaluator); ok {
		evaluator = ev
	}
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd backend && go build ./...
```

Expected: no errors. (The `claude` import stays — it's still used for `claude.New()`.)

- [ ] **Step 3: Run the full backend test suite**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "fix: wire evaluator via llm.Evaluator interface, not concrete type"
```
