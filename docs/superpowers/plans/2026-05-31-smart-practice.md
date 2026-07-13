# Smart Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Smart Practice" mode that tracks per-user, per-topic, per-stage proficiency scores (0.0–1.0) and serves problems targeting the user's weakest areas, using async LLM evaluation of completed sessions to update scores; expose scores on a Stats page.

**Architecture:** Six layers. (1) `topic_proficiency(user_id, topic, stage, score)` table with atomic SQL EMA updates + unit test for the formula. (2) `llm.Evaluator` interface + Claude `EvaluateSession` (non-streaming). (3) `Chat` handler spawns goroutine on `complete` — calls `EvaluateSession`, upserts scores, logs success and invalid data. (4) `GET /api/problems/smart` with inverse-weighted topic sampling (extracted pure function + unit test) + `GET /api/proficiency` to expose scores. (5) "Smart Practice" button in ChatView at session complete. (6) Stats tab showing scored topics sorted by weakest average.

**Tech Stack:** Go/Fiber/pgx backend, React 19/TypeScript/Tailwind frontend, Claude API (non-streaming for evaluation)

---

## File Map

| File | Change |
|---|---|
| `backend/db/schema.sql` | Add `topic_proficiency` table |
| `backend/internal/models/topic_proficiency.go` | **Create** — `TopicProficiency` model |
| `backend/internal/storage/postgres/proficiency.go` | **Create** — `UpsertTopicProficiency`, `GetTopicProficiencies` |
| `backend/internal/storage/postgres/proficiency_test.go` | **Create** — EMA formula unit test |
| `backend/internal/storage/storage.go` | Add proficiency methods to interface |
| `backend/internal/llm/evaluation.go` | **Create** — `Evaluator` interface, `SessionEvaluation`, `TopicScore`, `BuildEvaluationPrompt` |
| `backend/internal/claude/evaluate.go` | **Create** — `EvaluateSession` Claude implementation |
| `backend/internal/handlers/handler_service.go` | Add `evaluator llm.Evaluator` field |
| `backend/internal/handlers/chat.go` | Async goroutine on complete with full logging |
| `backend/internal/handlers/smart_practice.go` | **Create** — sampling algorithm (extracted pure fn) + `GetSmartPracticeProblem` + `GetProficiency` handlers |
| `backend/internal/handlers/smart_practice_test.go` | **Create** — sampling algorithm unit tests |
| `backend/internal/handlers/routes.go` | Register smart + proficiency routes |
| `backend/internal/constants/routes.go` | Add route constants |
| `backend/internal/server/server.go` | Add `Evaluator` to `Config` |
| `backend/cmd/server/main.go` | Wire `AnthropicClient` as `Evaluator` |
| `frontend/src/api.ts` | Add `getSmartPracticeProblem`, `getProficiency` |
| `frontend/src/types.ts` | Add `TopicProficiency` type |
| `frontend/src/App.tsx` | Add Stats view, smart practice handler |
| `frontend/src/components/ChatView.tsx` | Add "Smart Practice" button at complete |
| `frontend/src/components/StatsPage.tsx` | **Create** — topic proficiency display |

---

### Task 1: DB schema + proficiency storage + EMA unit test

**Files:**
- Modify: `backend/db/schema.sql`
- Create: `backend/internal/models/topic_proficiency.go`
- Create: `backend/internal/storage/postgres/proficiency.go`
- Create: `backend/internal/storage/postgres/proficiency_test.go`
- Modify: `backend/internal/storage/storage.go`

**Supabase migration to run manually after this task:**
```sql
CREATE TABLE IF NOT EXISTS topic_proficiency (
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT   NOT NULL,
  stage      TEXT   NOT NULL,
  score      FLOAT  NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic, stage)
);
```

- [ ] **Step 1: Add table to `backend/db/schema.sql`**

Append after the `saved_problems` table:

```sql
CREATE TABLE IF NOT EXISTS topic_proficiency (
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT   NOT NULL,
  stage      TEXT   NOT NULL,
  score      FLOAT  NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic, stage)
);
```

- [ ] **Step 2: Create `backend/internal/models/topic_proficiency.go`**

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

type TopicProficiency struct {
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	Topic     string    `json:"topic" db:"topic"`
	Stage     string    `json:"stage" db:"stage"`
	Score     float64   `json:"score" db:"score"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}
```

- [ ] **Step 3: Create `backend/internal/storage/postgres/proficiency.go`**

The upsert computes the EMA atomically in SQL, avoiding read-modify-write races:
`new_score = current + learning_rate * (session_score - current)`

```go
package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, topic, stage string, sessionScore, learningRate float64) error {
	const q = `
		INSERT INTO topic_proficiency (user_id, topic, stage, score, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id, topic, stage) DO UPDATE
		SET score      = topic_proficiency.score + $5 * ($4 - topic_proficiency.score),
		    updated_at = NOW()`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, topic, stage, sessionScore, learningRate)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	const q = `
		SELECT user_id, topic, stage, score, updated_at
		FROM topic_proficiency
		WHERE user_id = $1`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.TopicProficiency, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.TopicProficiency])
	})
}
```

- [ ] **Step 4: Write the EMA unit test**

The SQL mirrors this pure Go formula — test the formula directly to verify the math:
`new_score = current + lr * (session - current)`

Create `backend/internal/storage/postgres/proficiency_test.go`:

```go
package postgres

import "testing"

func computeEMA(current, sessionScore, learningRate float64) float64 {
	return current + learningRate*(sessionScore-current)
}

func TestComputeEMA(t *testing.T) {
	tests := []struct {
		name         string
		current      float64
		session      float64
		lr           float64
		wantApprox   float64
	}{
		{"cold start good session easy", 0.0, 0.8, 0.1, 0.08},
		{"cold start good session hard", 0.0, 0.8, 0.3, 0.24},
		{"mid score improve medium", 0.5, 0.8, 0.2, 0.56},
		{"mid score decline medium", 0.5, 0.2, 0.2, 0.44},
		{"high score perfect session", 0.9, 1.0, 0.2, 0.92},
		{"high score bad session", 0.9, 0.0, 0.2, 0.72},
		{"score does not exceed 1.0 direction", 1.0, 1.0, 0.2, 1.0},
		{"score does not go below 0.0 direction", 0.0, 0.0, 0.2, 0.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := computeEMA(tt.current, tt.session, tt.lr)
			diff := got - tt.wantApprox
			if diff < -0.001 || diff > 0.001 {
				t.Errorf("computeEMA(%v, %v, %v) = %v, want ~%v", tt.current, tt.session, tt.lr, got, tt.wantApprox)
			}
		})
	}
}
```

- [ ] **Step 5: Run the test**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/storage/postgres/ -run TestComputeEMA -v
```

Expected:
```
=== RUN   TestComputeEMA
--- PASS: TestComputeEMA (0.00s)
ok  	leetgame/internal/storage/postgres
```

- [ ] **Step 6: Add methods to `backend/internal/storage/storage.go`**

After the `// saved problems` block add:

```go
	// topic proficiency
	UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, topic, stage string, sessionScore, learningRate float64) error
	GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error)
```

- [ ] **Step 7: Build**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/db/schema.sql backend/internal/models/topic_proficiency.go backend/internal/storage/postgres/proficiency.go backend/internal/storage/postgres/proficiency_test.go backend/internal/storage/storage.go
git commit -m "feat: add topic_proficiency table, storage methods, and EMA unit test"
```

---

### Task 2: LLM evaluation interface + Claude implementation

**Files:**
- Create: `backend/internal/llm/evaluation.go`
- Create: `backend/internal/claude/evaluate.go`

- [ ] **Step 1: Create `backend/internal/llm/evaluation.go`**

```go
package llm

import (
	"context"
	"fmt"
	"strings"

	"leetgame/internal/models"
)

type TopicScore struct {
	Topic string  `json:"topic"`
	Stage string  `json:"stage"`
	Score float64 `json:"score"`
}

type SessionEvaluation struct {
	Scores []TopicScore `json:"scores"`
}

type Evaluator interface {
	EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []ChatMessage) (SessionEvaluation, error)
}

func BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage) string {
	var sb strings.Builder

	sb.WriteString("You are evaluating a candidate's performance on a LeetCode practice session.\n\n")
	fmt.Fprintf(&sb, "Problem: %s\n", problem.Title)
	fmt.Fprintf(&sb, "Problem tags: %s\n", strings.Join(problem.TopicTags, ", "))
	fmt.Fprintf(&sb, "Active stages practiced: %s\n\n", strings.Join(activeStages, ", "))

	sb.WriteString("Full conversation:\n")
	for _, msg := range history {
		fmt.Fprintf(&sb, "%s: %s\n", msg.Role, msg.Content)
	}

	sb.WriteString("\nScore the candidate's demonstrated understanding for each (topic, stage) pair that was actually tested.")
	sb.WriteString(" Only include pairs from the problem's tags × active stages.")
	sb.WriteString(" Score 0.0 = no understanding or completely wrong, 1.0 = correct and clearly articulated without hints.\n\n")
	sb.WriteString("CRITICAL: Return ONLY this JSON — no explanation, no markdown, no text before or after:\n")
	sb.WriteString(`{"scores": [{"topic": "Dynamic Programming", "stage": "pattern", "score": 0.8}]}`)
	sb.WriteString("\n\nOnly use topics from the problem's tags list. Only use stages from the active stages list.")

	return sb.String()
}
```

- [ ] **Step 2: Create `backend/internal/claude/evaluate.go`**

Non-streaming Claude call. `AnthropicClient` is defined in `claude.go` — this file adds `EvaluateSession` to it. `stripCodeFence` is already defined in `claude.go`.

```go
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
	prompt := llm.BuildEvaluationPrompt(problem, activeStages, history)

	body := map[string]any{
		"model":      c.model,
		"max_tokens": 1024,
		"stream":     false,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
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
	defer resp.Body.Close()

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

	if len(apiResp.Content) == 0 {
		return llm.SessionEvaluation{}, fmt.Errorf("empty response from claude")
	}

	text := stripCodeFence(apiResp.Content[0].Text)

	var eval llm.SessionEvaluation
	if err := json.Unmarshal([]byte(text), &eval); err != nil {
		return llm.SessionEvaluation{}, fmt.Errorf("failed to parse evaluation JSON %q: %w", text, err)
	}

	return eval, nil
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/llm/evaluation.go backend/internal/claude/evaluate.go
git commit -m "feat: add LLM session evaluation interface and Claude implementation"
```

---

### Task 3: Wire Evaluator into HandlerService + async trigger with logging

**Files:**
- Modify: `backend/internal/handlers/handler_service.go`
- Modify: `backend/internal/handlers/chat.go`
- Modify: `backend/internal/server/server.go`
- Modify: `backend/cmd/server/main.go`

Learning rate by difficulty: Easy → 0.1, Medium → 0.2, Hard → 0.3.

- [ ] **Step 1: Update `backend/internal/handlers/handler_service.go`**

```go
package handlers

import (
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

type HandlerService struct {
	storage   storage.Storage
	logger    *slog.Logger
	llmClient llm.Client
	evaluator llm.Evaluator
	keyfunc   jwt.Keyfunc
}

type HandlerServiceConfig struct {
	Storage   storage.Storage
	Logger    *slog.Logger
	LLMClient llm.Client
	Evaluator llm.Evaluator
	Keyfunc   jwt.Keyfunc
}

func NewService(cfg *HandlerServiceConfig) *HandlerService {
	return &HandlerService{
		storage:   cfg.Storage,
		logger:    cfg.Logger,
		llmClient: cfg.LLMClient,
		evaluator: cfg.Evaluator,
		keyfunc:   cfg.Keyfunc,
	}
}
```

- [ ] **Step 2: Update `backend/internal/server/server.go`**

Add `Evaluator llm.Evaluator` to `Config` and pass to `HandlerServiceConfig`:

```go
type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	Evaluator      llm.Evaluator
	AllowedOrigins string
	Keyfunc        jwt.Keyfunc
}
```

In `New`, update `handlers.NewService` call:
```go
	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:   cfg.Storage,
		Logger:    cfg.Logger,
		LLMClient: cfg.LLMClient,
		Evaluator: cfg.Evaluator,
		Keyfunc:   cfg.Keyfunc,
	})
```

- [ ] **Step 3: Wire `AnthropicClient` as `Evaluator` in `backend/cmd/server/main.go`**

After creating `llmClient`, add:

```go
	var evaluator llm.Evaluator
	if ac, ok := llmClient.(*claude.AnthropicClient); ok {
		evaluator = ac
	}
```

Then pass `Evaluator: evaluator` to `server.New(...)`.

Add import `"leetgame/internal/claude"` to main.go.

**Note:** When `LLM.Provider == "ollama"`, the type assertion fails and `evaluator` is `nil`, so `evalEnabled` is `false` — proficiency recording is silently skipped for Ollama sessions. This is intentional: `OllamaClient` does not implement `EvaluateSession`. If Ollama support is needed in future, add `EvaluateSession` to `OllamaClient` and move `EvaluateSession` onto the `llm.Client` interface to avoid the type assertion.

- [ ] **Step 4: Add async goroutine to `backend/internal/handlers/chat.go`**

The existing code already has this comment: *"fasthttp forbids accessing RequestCtx from inside SetBodyStreamWriter. Extract everything from `c` before registering the callback."* Follow that rule strictly.

**Before** `c.Context().SetBodyStreamWriter(...)`, extract everything needed for evaluation:

```go
	// Extract evaluation inputs before the stream writer — fasthttp recycles c after handler returns
	evalUID, _ := xcontext.GetUserID(c)
	evalEnabled := hs.evaluator != nil && evalUID != uuid.Nil
	evalProblem := problem
	evalActiveStages := req.ActiveStages
	// baseHistory = prior turns + user's current message; assistant reply appended after streaming
	baseHistory := make([]llm.ChatMessage, 0, len(history)+1)
	baseHistory = append(baseHistory, history...)
	baseHistory = append(baseHistory, llm.ChatMessage{Role: "user", Content: req.Message})
```

Then **inside** `SetBodyStreamWriter`, after writing the `done` event, add:

```go
		if evalEnabled && result.Stage == "complete" {
			fullHistory := append(baseHistory, llm.ChatMessage{Role: "assistant", Content: result.Message})
			go hs.runSessionEvaluation(evalUID, evalProblem, evalActiveStages, fullHistory)
		}
```

Add `runSessionEvaluation` as a method on `HandlerService` at the bottom of `chat.go`:

```go
func (hs *HandlerService) runSessionEvaluation(userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
	if userID == uuid.Nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	hs.logger.Info("starting session evaluation",
		"user_id", userID,
		"problem_id", problem.Id,
		"problem_title", problem.Title,
		"active_stages", activeStages,
	)

	eval, err := hs.evaluator.EvaluateSession(ctx, problem, activeStages, history)
	if err != nil {
		hs.logger.Error("session evaluation failed",
			"error", err,
			"user_id", userID,
			"problem_id", problem.Id,
			"problem_title", problem.Title,
		)
		return
	}

	learningRates := map[string]float64{
		"Easy": 0.1, "Medium": 0.2, "Hard": 0.3,
	}
	lr, ok := learningRates[problem.Difficulty]
	if !ok {
		lr = 0.2
	}

	var updated int
	for _, score := range eval.Scores {
		if score.Score < 0 || score.Score > 1 {
			hs.logger.Warn("skipping out-of-range score from LLM",
				"topic", score.Topic,
				"stage", score.Stage,
				"score", score.Score,
			)
			continue
		}
		if err := hs.storage.UpsertTopicProficiency(ctx, userID, score.Topic, score.Stage, score.Score, lr); err != nil {
			hs.logger.Error("failed to upsert topic proficiency",
				"error", err,
				"topic", score.Topic,
				"stage", score.Stage,
			)
			continue
		}
		updated++
	}

	hs.logger.Info("session evaluation complete",
		"user_id", userID,
		"problem_title", problem.Title,
		"topics_updated", updated,
		"scores", eval.Scores,
	)
}
```

Add imports to `chat.go`: `"context"`, `"time"`, `"github.com/google/uuid"`, `"leetgame/internal/llm"`, `"leetgame/internal/models"`, `"leetgame/internal/xcontext"`.

- [ ] **Step 5: Build**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handlers/handler_service.go backend/internal/handlers/chat.go backend/internal/server/server.go backend/cmd/server/main.go
git commit -m "feat: wire Evaluator into HandlerService and trigger async session evaluation with logging"
```

---

### Task 4: Smart practice handler + sampling algorithm + proficiency endpoint + unit tests

**Files:**
- Create: `backend/internal/handlers/smart_practice.go`
- Create: `backend/internal/handlers/smart_practice_test.go`
- Modify: `backend/internal/handlers/routes.go`
- Modify: `backend/internal/constants/routes.go`

**Sampling algorithm (extracted as a pure function for testability):**

1. Build a `(topic, stage) → score` map from stored proficiencies
2. For each available topic, average scores across active stages (missing = 0.0 cold start)
3. `weight = 1.0 - avg_score`
4. If all weights are 0: use uniform weights
5. Normalize; weighted random sample

- [ ] **Step 1: Add route constants**

The file `backend/internal/constants/routes.go` already has `RandomProblem`, `Chat`, and `Saved`. **Append** only the two new constants to the existing `const (...)` block — do not replace the whole file:

```go
	SmartPractice = "/api/problems/smart"
	Proficiency   = "/api/proficiency"
```

- [ ] **Step 2: Create `backend/internal/handlers/smart_practice.go`**

```go
package handlers

import (
	"math/rand"
	"net/http"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

type topicWeight struct {
	Topic  string
	Weight float64
}

// computeTopicWeights returns an inverse-proficiency weight for each available topic.
// Topics with no proficiency data default to score 0.0 (cold start → maximum weight).
// If all weights are zero (perfect scores everywhere), returns uniform weights.
func computeTopicWeights(proficiencies []models.TopicProficiency, tags []types.ProblemTag, activeStages []string) []topicWeight {
	scoreMap := make(map[string]float64)
	for _, p := range proficiencies {
		scoreMap[p.Topic+"|"+p.Stage] = p.Score
	}

	weights := make([]topicWeight, 0, len(tags))
	for _, tag := range tags {
		var total float64
		for _, stage := range activeStages {
			total += scoreMap[tag.Name+"|"+stage] // missing = 0.0
		}
		avg := total / float64(len(activeStages))
		weights = append(weights, topicWeight{Topic: tag.Name, Weight: 1.0 - avg})
	}

	// If all weights are zero, use uniform
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	if sum == 0 {
		for i := range weights {
			weights[i].Weight = 1.0
		}
	}

	return weights
}

// sampleTopic picks one topic from weights using weighted random sampling.
func sampleTopic(weights []topicWeight) string {
	if len(weights) == 0 {
		return ""
	}
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	r := rand.Float64() * sum
	for _, w := range weights {
		r -= w.Weight
		if r <= 0 {
			return w.Topic
		}
	}
	return weights[len(weights)-1].Topic
}

func (hs *HandlerService) GetSmartPracticeProblem(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	stagesParam := strings.TrimSpace(c.Query("active_stages"))
	if stagesParam == "" {
		return xerrors.BadRequestError("active_stages is required")
	}
	activeStages := strings.Split(stagesParam, ",")
	for i, s := range activeStages {
		activeStages[i] = strings.TrimSpace(s)
	}

	allTags, err := hs.storage.GetProblemTags(c.Context())
	if err != nil {
		return err
	}

	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}

	weights := computeTopicWeights(proficiencies, allTags, activeStages)
	sampledTopic := sampleTopic(weights)

	problem, err := hs.storage.GetRandomProblemFiltered(c.Context(), "", "", []string{sampledTopic}, "or", "")
	if err != nil {
		problem, err = hs.storage.GetRandomProblem(c.Context())
		if err != nil {
			return err
		}
	}

	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProficiency(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(proficiencies)
}
```

- [ ] **Step 3: Write the sampling unit tests**

Create `backend/internal/handlers/smart_practice_test.go`:

```go
package handlers

import (
	"testing"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

var testUID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

func makeProficiency(topic, stage string, score float64) models.TopicProficiency {
	return models.TopicProficiency{UserID: testUID, Topic: topic, Stage: stage, Score: score}
}

func makeTag(name string) types.ProblemTag {
	return types.ProblemTag{Name: name, Count: 10}
}

func TestComputeTopicWeights_ColdStart(t *testing.T) {
	// No proficiency data — all weights should be 1.0 (cold start)
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(nil, tags, []string{"pattern"})

	if len(weights) != 2 {
		t.Fatalf("expected 2 weights, got %d", len(weights))
	}
	for _, w := range weights {
		if w.Weight != 1.0 {
			t.Errorf("cold start: expected weight 1.0 for %s, got %f", w.Topic, w.Weight)
		}
	}
}

func TestComputeTopicWeights_InverseScore(t *testing.T) {
	// DP pattern = 0.8 → weight = 0.2; Sliding Window pattern = 0.2 → weight = 0.8
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 0.8),
		makeProficiency("Sliding Window", "pattern", 0.2),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})

	wantDP := 0.2
	wantSW := 0.8
	for _, w := range weights {
		switch w.Topic {
		case "Dynamic Programming":
			if diff := w.Weight - wantDP; diff < -0.001 || diff > 0.001 {
				t.Errorf("DP weight: got %f, want %f", w.Weight, wantDP)
			}
		case "Sliding Window":
			if diff := w.Weight - wantSW; diff < -0.001 || diff > 0.001 {
				t.Errorf("SW weight: got %f, want %f", w.Weight, wantSW)
			}
		}
	}
}

func TestComputeTopicWeights_MultiStageAverage(t *testing.T) {
	// DP: pattern=0.9, tc_sc=0.1 → avg=0.5 → weight=0.5
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 0.9),
		makeProficiency("Dynamic Programming", "tc_sc", 0.1),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern", "tc_sc"})

	if len(weights) != 1 {
		t.Fatalf("expected 1 weight, got %d", len(weights))
	}
	want := 0.5
	if diff := weights[0].Weight - want; diff < -0.001 || diff > 0.001 {
		t.Errorf("multi-stage avg: got weight %f, want %f", weights[0].Weight, want)
	}
}

func TestComputeTopicWeights_AllPerfect_UsesUniform(t *testing.T) {
	// All scores 1.0 → all weights 0 → should fall back to uniform (1.0 each)
	proficiencies := []models.TopicProficiency{
		makeProficiency("Dynamic Programming", "pattern", 1.0),
		makeProficiency("Sliding Window", "pattern", 1.0),
	}
	tags := []types.ProblemTag{makeTag("Dynamic Programming"), makeTag("Sliding Window")}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})

	for _, w := range weights {
		if w.Weight != 1.0 {
			t.Errorf("all-perfect fallback: expected weight 1.0 for %s, got %f", w.Topic, w.Weight)
		}
	}
}

func TestSampleTopic_ReturnsValue(t *testing.T) {
	weights := []topicWeight{
		{Topic: "Dynamic Programming", Weight: 0.1},
		{Topic: "Sliding Window", Weight: 0.9},
	}
	// Run 100 samples — must always return one of the two topics
	for i := 0; i < 100; i++ {
		got := sampleTopic(weights)
		if got != "Dynamic Programming" && got != "Sliding Window" {
			t.Errorf("unexpected topic: %s", got)
		}
	}
}

func TestSampleTopic_Empty(t *testing.T) {
	got := sampleTopic(nil)
	if got != "" {
		t.Errorf("empty weights: expected empty string, got %q", got)
	}
}
```

- [ ] **Step 4: Run the tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/handlers/ -run TestCompute -v && go test ./internal/handlers/ -run TestSample -v
```

Expected: all tests PASS.

- [ ] **Step 5: Register routes in `backend/internal/handlers/routes.go`**

Read the file first. The `/api/problems/smart` route must be registered at the `api` group level (not inside the `/problems` sub-router) so that `RequireAuth` applies correctly. Register it as a single route with per-route middleware **before** the `/problems` sub-router to prevent prefix ambiguity:

```go
		// Smart practice — RequireAuth per-route (Chat uses OptionalAuth on the parent group)
		api.Get("/problems/smart", middleware.RequireAuth(hs.keyfunc), hs.GetSmartPracticeProblem)

		api.Route("/problems", func(problems fiber.Router) {
			problems.Get("/random", hs.GetRandomProblem)
			problems.Get("/tags", hs.GetProblemTags)
			problems.Get("/", hs.GetProblems)
		})
```

Add after the `/saved` route block:

```go
		api.Route("/proficiency", func(proficiency fiber.Router) {
			proficiency.Use(middleware.RequireAuth(hs.keyfunc))
			proficiency.Get("/", hs.GetProficiency)
		})
```

- [ ] **Step 6: Build + run all tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./... && go test ./...
```

Expected: build succeeds, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handlers/smart_practice.go backend/internal/handlers/smart_practice_test.go backend/internal/handlers/routes.go backend/internal/constants/routes.go
git commit -m "feat: smart practice handler, proficiency endpoint, and sampling unit tests"
```

---

### Task 5: Frontend — Smart Practice button

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Add `getSmartPracticeProblem` to `frontend/src/api.ts`**

Add after the existing problem functions:

```ts
export async function getSmartPracticeProblem(activeStages: ActiveStage[]): Promise<Problem> {
  const params = new URLSearchParams()
  params.set('active_stages', activeStages.join(','))
  const res = await fetch(`${API_URL}/api/problems/smart?${params.toString()}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch smart practice problem: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Add `loadSmartPracticeProblem` to `App.tsx`**

Update the import line to include `getSmartPracticeProblem`:

```tsx
import { getRandomProblem, getRandomProblemFiltered, searchProblems, streamChat, getSmartPracticeProblem } from './api'
```

Add the function alongside the other load functions:

```tsx
  const loadSmartPracticeProblem = async () => {
    try {
      pushSnapshot()
      setError(null)
      setPlaylistExhausted(false)
      const p = await getSmartPracticeProblem(activeStages)
      setProblem(p)
      setProblemSource('random')
      setSearchPlaylist(null)
      resetPracticeState()
    } catch (e) {
      setError('Failed to load smart practice problem. Is the backend running?')
    }
  }
```

Inside `practiceView()`, add `onSmartPractice` to the `ChatView` render:

```tsx
        <ChatView
          history={history}
          stage={stage}
          sessionActiveStages={sessionActiveStages}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
          streamingMessage={streamingMessage}
          onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
          onRandom={stage === 'complete' && problemSource === 'search' ? () => void loadRandomNextProblem() : undefined}
          onBack={stage === 'complete' && canGoBack ? goBack : undefined}
          onSmartPractice={stage === 'complete' && !!session ? () => void loadSmartPracticeProblem() : undefined}
        />
```

- [ ] **Step 3: Add `onSmartPractice` prop to `ChatView`**

In `frontend/src/components/ChatView.tsx`, add to Props interface:

```tsx
  onSmartPractice?: () => void
```

Add to function signature destructuring. In the `stage === 'complete'` button row:

```tsx
      {stage === 'complete' ? (
        <div className="p-4 border-t border-border flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" onClick={onBack}>← Back</Button>
          )}
          {onNext && (
            <Button onClick={onNext} className="ml-auto">Next Problem</Button>
          )}
          {onSmartPractice && (
            <Button variant="outline" onClick={onSmartPractice}>Smart Practice</Button>
          )}
          {onRandom && (
            <Button variant="outline" onClick={onRandom}>Random</Button>
          )}
        </div>
      ) : (
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/App.tsx frontend/src/components/ChatView.tsx
git commit -m "feat: add Smart Practice button at session complete"
```

---

### Task 6: Frontend — Stats page

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/components/StatsPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/NavBar.tsx`

The Stats tab shows only topics the user has been scored on (no placeholder rows for unscored topics). Topics are sorted by weakest average score across all their stages, ascending. Each topic shows one row per stage with a simple progress bar and score. Only visible when logged in.

**Key design decisions baked in:**
- `View` type is exported from `types.ts` — single source of truth for both `App.tsx` and `NavBar.tsx`
- A `useEffect([session])` in `App.tsx` resets view to `'practice'` if the user signs out while on the Stats tab
- `StatsPage` uses `AbortController` so navigating away mid-fetch doesn't set state on an unmounted component

- [ ] **Step 1: Add `View`, `TopicProficiency` types to `frontend/src/types.ts`**

Add these exports:

```ts
export type View = 'practice' | 'search' | 'stats'

export interface TopicProficiency {
  user_id: string
  topic: string
  stage: string
  score: number
  updated_at: string
}
```

- [ ] **Step 2: Update `App.tsx` — remove local `View` definition, import from types**

In `App.tsx`:
- Remove `type View = 'practice' | 'search'` (local definition)
- Add `View` to the existing types import from `'./types'`

Also add a `useEffect` to guard against sign-out while on stats:

```tsx
  useEffect(() => {
    if (!session && view === 'stats') setView('practice')
  }, [session, view])
```

Place this after the existing auth-related effects. Both `session` and `view` must be in the dep array — without `view`, the effect won't fire if the user is already signed out and navigates to stats programmatically.

- [ ] **Step 3: Add `getProficiency` to `frontend/src/api.ts`**

```ts
export async function getProficiency(signal?: AbortSignal): Promise<TopicProficiency[]> {
  const res = await fetch(`${API_URL}/api/proficiency`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok) throw new Error(`Failed to fetch proficiency: ${res.status}`)
  return res.json()
}
```

Add `TopicProficiency` to the import from `'./types'`.

- [ ] **Step 4: Create `frontend/src/components/StatsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { TopicProficiency } from '../types'
import { getProficiency } from '../api'
import { cn } from '../lib/utils'

const stageLabel: Record<string, string> = {
  edge_cases:  'Edge Cases',
  brute_force: 'Brute Force',
  pattern:     'Pattern',
  algorithm:   'Algorithm',
  tc_sc:       'Time & Space',
}

export function StatsPage() {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getProficiency(controller.signal)
      .then(data => { if (!controller.signal.aborted) { setProficiencies(data); setFetchError(false) } })
      .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Failed to load stats. Please sign in and try again.</p>
        </div>
      </div>
    )
  }

  if (proficiencies.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <h2 className="text-xl font-semibold mb-2">Topic Proficiency</h2>
          <p className="text-sm text-muted-foreground">Complete a practice session to see your scores.</p>
        </div>
      </div>
    )
  }

  // Group by topic, compute avg per topic for sorting
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of proficiencies) {
    const existing = topicMap.get(p.topic) ?? []
    topicMap.set(p.topic, [...existing, p])
  }

  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg) // weakest first

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h2 className="text-xl font-semibold mb-6">Topic Proficiency</h2>
        <div className="flex flex-col gap-4">
          {topics.map(({ topic, rows }) => (
            <div key={topic} className="rounded-md border border-border bg-muted p-4">
              <p className="text-sm font-semibold mb-3">{topic}</p>
              <div className="flex flex-col gap-2">
                {rows.map(row => (
                  <div key={row.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {stageLabel[row.stage] ?? row.stage}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          row.score >= 0.7 ? "bg-green-500" :
                          row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${Math.round(row.score * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                      {Math.round(row.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add Stats import and view render to `App.tsx`**

Import `StatsPage`:

```tsx
import { StatsPage } from './components/StatsPage'
```

Replace the current two-way view ternary (which only handles `'search'` vs practice) with a three-way check that preserves all three views. Read the file to find the exact current render and replace it with:

```tsx
      {view === 'search'
        ? <SearchPage
            onSelectProblem={selectProblem}
            searchState={searchState}
            onSearchStateChange={setSearchState}
            loading={searchLoading}
            error={searchError}
            availableTags={availableTags}
            tagsLoading={tagsLoading}
            tagsError={tagsError}
            savedIds={savedIds}
            savedProblems={savedProblems}
            onToggleSave={(p) => isSaved(p.id) ? void unsave(p.id) : void save(p)}
            showSave={!!session}
          />
        : view === 'stats'
        ? <StatsPage />
        : practiceView()
      }
```

- [ ] **Step 6: Update `NavBar.tsx` — use shared `View` type, add Stats tab**

In `NavBar.tsx`:
- Remove `type View = 'practice' | 'search'` (local definition)
- Add `View` to import from `'../types'`
- Update `onNavigate` prop type to `(v: View) => void` (already matches — just ensure the Props interface uses the imported `View`)
- Replace the nav buttons section:

```tsx
      {(['practice', 'search'] as View[]).map(v => (
        <Button
          key={v}
          variant={view === v ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate(v)}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </Button>
      ))}
      {session && (
        <Button
          variant={view === 'stats' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onNavigate('stats')}
        >
          Stats
        </Button>
      )}
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/components/StatsPage.tsx frontend/src/App.tsx frontend/src/components/NavBar.tsx
git commit -m "feat: add Stats page showing topic proficiency scores"
```

---

## Manual steps required

After Task 1, run in Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS topic_proficiency (
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic      TEXT   NOT NULL,
  stage      TEXT   NOT NULL,
  score      FLOAT  NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, topic, stage)
);
```
