# Concise Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user `concise_mode` setting that relaxes the Socratic interviewer — a correct answer with brief reasoning advances a stage — and recalibrates session evaluation so concise sessions score comparably.

**Architecture:** A boolean threads client → chat request → prompt builders, mirroring how `active_stages` flows. Seven layers, each its own compiling commit: chat request field, interviewer prompt variant, `Client.Evaluate` plumbing, evaluation rubric variant, `EvaluateSession`/dispatcher/Kafka plumbing, settings persistence, frontend. Spec: `docs/superpowers/specs/2026-07-05-concise-mode-design.md`.

**Tech Stack:** Go/Fiber v3/pgx (backend), TypeScript/React/Tailwind (frontend web)

## Global Constraints

- The pre-commit hook runs frontend lint+build and backend gofumpt+lint+build+test. **Every commit must pass all of them.** Tasks are ordered so each commit compiles; intermediate tasks pass a literal `false` at boundaries not yet wired.
- Backend uses Fiber **v3** idioms: `c fiber.Ctx` (not `*fiber.Ctx`), `c.Bind().Body(&req)`, `c.RequestCtx()`.
- `concise` defaults to `false` at every layer (JSON omission, DB default, localStorage absence). `concise == false` output of every prompt builder must be byte-identical to current output.
- Concise mode loosens the pass bar only. All "never reveal", one-question-per-response, short-response, and JSON-output rules stay in both variants.
- Settings toggle copy: label `Concise mode`, description `Less back-and-forth — brief correct answers advance the stage`.
- Run all backend commands from `/Users/aaronkim/projects/leetgame/.claude/worktrees/concise-mode/backend`, frontend from `.../frontend`.
- Mobile app is out of scope (lives on `feat/mobile-app`).

---

### Task 1: `Concise` field on ChatRequest

**Files:**
- Modify: `backend/internal/types/chat_request.go`
- Test: `backend/internal/types/chat_request_test.go`

**Interfaces:**
- Produces: `types.ChatRequest.Concise bool` with json tag `concise` — read by Task 3 (chat handler) and Task 5 (dispatch).

- [ ] **Step 1: Write the failing test**

Add to `backend/internal/types/chat_request_test.go` (match the file's existing package clause and import style; add `"encoding/json"` to imports if absent):

```go
func TestConcise_DefaultsFalseWhenOmitted(t *testing.T) {
	var req ChatRequest
	if err := json.Unmarshal([]byte(`{"message":"hi"}`), &req); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if req.Concise {
		t.Error("Concise must default to false when omitted from JSON")
	}
}

func TestValidate_ConciseTrueIsValid(t *testing.T) {
	req := ChatRequest{
		ProblemID:    uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Stage:        "pattern",
		ActiveStages: []string{"pattern", "algorithm", "tc_sc"},
		Message:      "hello",
		Concise:      true,
	}
	if errs := req.Validate(); len(errs) != 0 {
		t.Errorf("expected no validation errors, got %v", errs)
	}
}
```

If the test file's package is `types_test`, qualify as `types.ChatRequest` / `types.ChatRequest{...}` to match neighboring tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/types/... -run 'Concise' -v`
Expected: compile error — `req.Concise undefined`.

- [ ] **Step 3: Add the field**

In `backend/internal/types/chat_request.go`, replace the `ChatRequest` struct with:

```go
type ChatRequest struct {
	ProblemID       uuid.UUID        `json:"problem_id"`
	Stage           string           `json:"stage"`
	ActiveStages    []string         `json:"active_stages"`
	History         []HistoryMessage `json:"history"`
	Message         string           `json:"message"`
	HintRequested   bool             `json:"hint_requested"`
	AnswerRequested bool             `json:"answer_requested"`
	Concise         bool             `json:"concise"`
}
```

`Validate()` is untouched — a bool needs no validation.

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/types/... -run 'Concise' -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add internal/types/chat_request.go internal/types/chat_request_test.go
git commit -m "feat(backend): add concise field to chat request"
```

---

### Task 2: Interviewer prompt concise variant

**Files:**
- Modify: `backend/internal/llm/llm.go`
- Modify: `backend/internal/claude/claude.go:39` (caller — passes `false` until Task 3)
- Modify: `backend/internal/ollama/ollama.go:35` (caller — passes `false` until Task 3)
- Test: `backend/internal/llm/llm_test.go`

**Interfaces:**
- Produces: `llm.BuildStableSystemPrompt(title, description string, activeStages []string, concise bool) string` and `llm.BuildSystemPrompt(title, description, stage string, activeStages []string, hintRequested, answerRequested, concise bool) string`. `BuildVolatileSystemSuffix` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `backend/internal/llm/llm_test.go`:

```go
func TestBuildStableSystemPrompt_strict_has_no_concise_rules(t *testing.T) {
	prompt := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern", "algorithm", "tc_sc"}, false)
	if !strings.Contains(prompt, "A one-word or one-phrase answer is never sufficient.") {
		t.Error("strict prompt must keep the strict advancement rule")
	}
	if strings.Contains(prompt, `one sentence of "why" is enough`) {
		t.Error("strict prompt must not contain the concise leniency rule")
	}
}

func TestBuildStableSystemPrompt_concise_rules(t *testing.T) {
	prompt := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern", "algorithm", "tc_sc"}, true)
	if !strings.Contains(prompt, `one sentence of "why" is enough`) {
		t.Error("concise prompt must contain the lenient advancement rule")
	}
	if !strings.Contains(prompt, "accept the answer and move on") {
		t.Error("concise prompt must contain the no-drill-down rule")
	}
	if strings.Contains(prompt, "A one-word or one-phrase answer is never sufficient.") {
		t.Error("concise prompt must not contain the strict advancement rule")
	}
}

func TestBuildStableSystemPrompt_concise_keeps_guardrails(t *testing.T) {
	prompt := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern", "algorithm", "tc_sc"}, true)
	for _, guard := range []string{
		"NEVER explain the answer",
		"Never reveal the pattern",
		"Ask ONE question per response",
		`{"message": "<your response to the candidate>", "stage": "<stage_id>"}`,
	} {
		if !strings.Contains(prompt, guard) {
			t.Errorf("concise prompt missing guardrail %q", guard)
		}
	}
}

func TestBuildStableSystemPrompt_concise_stage_guidance(t *testing.T) {
	prompt := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern"}, true)
	if !strings.Contains(prompt, "name the correct pattern with a brief reason") {
		t.Error("concise prompt must use the concise pattern guidance")
	}
	if strings.Contains(prompt, "ask them to explain the reasoning") {
		t.Error("concise prompt must not use the strict pattern guidance")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/llm/... -run 'BuildStableSystemPrompt' -v`
Expected: compile error — too many arguments to `BuildStableSystemPrompt`.

- [ ] **Step 3: Implement the concise variant**

In `backend/internal/llm/llm.go`:

3a. Add a `conciseGuidance` field to `stageDesc` and a concise string per stage — replace the `stageDesc` type and `stageDescriptions` map with:

```go
type stageDesc struct {
	label           string
	criteria        string
	guidance        string
	conciseGuidance string
}

var stageDescriptions = map[string]stageDesc{
	"edge_cases": {
		label:           "Edge Cases",
		criteria:        "The candidate identifies key edge cases and boundary conditions for this problem (e.g. empty input, single element, duplicates, overflow).",
		guidance:        "If incomplete: ask ONE Socratic question about a specific edge case they missed. Never enumerate all edge cases.",
		conciseGuidance: "If they name the key edge cases, advance — brief phrasing is fine. Only ask a follow-up if they missed the most important case for this problem. Never enumerate all edge cases.",
	},
	"brute_force": {
		label:           "Brute Force",
		criteria:        "The candidate describes a working naive solution, even if inefficient.",
		guidance:        "If incorrect or too vague: ask ONE focused question to guide them toward a valid brute force approach.",
		conciseGuidance: "If they describe a valid naive approach, even briefly, advance. Only ask a follow-up if the approach is wrong or gives no reasoning at all.",
	},
	"pattern": {
		label:           "Optimal Pattern",
		criteria:        "The candidate names the correct algorithm pattern (e.g. backtracking, sliding window, dynamic programming) AND explains in their own words why that pattern fits this specific problem. Knowing the name alone is not enough — they must articulate the reasoning.",
		guidance:        "If they name the pattern but do not explain why it fits: ask them to explain the reasoning. Do not confirm correctness and then explain it yourself. If incorrect or too vague: ask ONE Socratic question. Never reveal the pattern. IMPORTANT: Do NOT ask about implementation details, code structure, or iteration — that is the algorithm stage's job, not this one.",
		conciseGuidance: "If they name the correct pattern with a brief reason it fits, advance. Only ask a follow-up if the pattern is wrong or stated with no reasoning at all. Never reveal the pattern. IMPORTANT: Do NOT ask about implementation details, code structure, or iteration — that is the algorithm stage's job, not this one.",
	},
	"algorithm": {
		label:           "Optimal Algorithm",
		criteria:        "The candidate describes a correct and efficient algorithm that solves the problem optimally, including key implementation steps.",
		guidance:        "If correct but high-level: ask them to walk through the steps in detail. Do not summarize or elaborate on their answer. If incorrect or incomplete: ask ONE focused Socratic question. Never reveal the answer.",
		conciseGuidance: "If they describe the correct approach and its core idea, advance — do not require every implementation step. Only ask a follow-up if the algorithm is wrong or missing its core idea. Never reveal the answer.",
	},
	"tc_sc": {
		label:           "Time & Space Complexity",
		criteria:        "The candidate correctly states both time complexity and space complexity.",
		guidance:        "If incorrect: ask ONE focused guiding question about the complexity.",
		conciseGuidance: "If both are correct, advance immediately — no explanation required. If incorrect: ask ONE focused guiding question about the complexity.",
	},
}
```

3b. Replace `BuildStableSystemPrompt` with:

```go
// BuildStableSystemPrompt returns the cacheable portion of the system prompt —
// everything that is constant for a given problem + active stages + concise combination.
func BuildStableSystemPrompt(title, description string, activeStages []string, concise bool) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.\n\nProblem Title: %s\nProblem Description:\n%s\n\n", title, description)

	sb.WriteString("INTERVIEWER RULES — follow these at all times:\n")
	sb.WriteString("1. NEVER explain the answer or describe the approach yourself. Your job is to ask questions, not teach.\n")
	if concise {
		sb.WriteString("2. If the candidate gives a correct answer with no reasoning at all (e.g. just \"hash map\"), ask for one sentence of why. Do not confirm it and then explain how it works yourself.\n")
		sb.WriteString("3. Advance the stage when the candidate gives a correct answer with brief reasoning — one sentence of \"why\" is enough. Do not require an exhaustive explanation.\n")
		sb.WriteString("4. If the candidate is on the right track, accept the answer and move on. Only ask a follow-up question when the answer is wrong or gives no reasoning at all.\n")
		sb.WriteString("5. Ask ONE question per response. Never ask multiple questions or provide follow-up hints unprompted.\n")
		sb.WriteString("6. Keep responses short. One or two sentences maximum.\n\n")
	} else {
		sb.WriteString("2. When the candidate gives a correct but brief answer (e.g. \"hash map\"), do NOT confirm it and then explain how it works. Instead, ask them to explain it: \"Good — how would you use that?\"\n")
		sb.WriteString("3. Only advance the stage when the candidate has articulated the answer themselves, in their own words. A one-word or one-phrase answer is never sufficient.\n")
		sb.WriteString("4. Ask ONE question per response. Never ask multiple questions or provide follow-up hints unprompted.\n")
		sb.WriteString("5. Keep responses short. One or two sentences maximum.\n\n")
	}

	sb.WriteString("Guide the candidate through the following stages in order:\n\n")
	for i, s := range activeStages {
		d, ok := stageDescriptions[s]
		if !ok {
			continue
		}
		guidance := d.guidance
		if concise {
			guidance = d.conciseGuidance
		}
		successStage := "complete"
		if i < len(activeStages)-1 {
			successStage = activeStages[i+1]
		}
		fmt.Fprintf(&sb, "Stage %d — %s (stage = %q):\n%s\n%s\nOn success: set stage to %q.\n\n",
			i, d.label, s, d.criteria, guidance, successStage)
	}

	sb.WriteString("CRITICAL: Your entire response must be ONLY the following JSON object — no explanation, no text before or after, no code fences wrapping the JSON:\n")
	sb.WriteString(`{"message": "<your response to the candidate>", "stage": "<stage_id>"}`)
	sb.WriteString("\n\nThe \"message\" value is displayed in a markdown renderer, so you MAY use markdown formatting (bold, bullet lists, inline code, code blocks) inside the message string when it aids clarity. Any response that is not pure JSON will be rejected. Do not write anything except the JSON object.")

	return sb.String()
}
```

3c. Replace `BuildSystemPrompt` with:

```go
// BuildSystemPrompt concatenates the stable and volatile parts.
// Used by Ollama (which does not support caching) and existing tests.
func BuildSystemPrompt(title, description, stage string, activeStages []string, hintRequested, answerRequested, concise bool) string {
	return BuildStableSystemPrompt(title, description, activeStages, concise) + "\n\n" + BuildVolatileSystemSuffix(stage, hintRequested, answerRequested)
}
```

3d. Fix the two callers (temporary `false`, threaded for real in Task 3):

`backend/internal/claude/claude.go:39`:
```go
	stablePrompt := llm.BuildStableSystemPrompt(problem.Title, problem.Description, activeStages, false)
```

`backend/internal/ollama/ollama.go:35`:
```go
	systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages, hintRequested, answerRequested, false)
```

3e. Update every existing `llm.BuildSystemPrompt(` call in `backend/internal/llm/llm_test.go` by appending `, false` as the new final argument. Example — before:
```go
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false)
```
after:
```go
prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false, false)
```
Apply the same mechanical append to all `BuildSystemPrompt` calls in the file (there are ~10). If any other file fails to compile in Step 4, append `, false` there too.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go build ./... && go test ./internal/llm/... -v`
Expected: build OK; all llm tests PASS including the four new ones.

- [ ] **Step 5: Commit**

```bash
git add internal/llm/llm.go internal/llm/llm_test.go internal/claude/claude.go internal/ollama/ollama.go
git commit -m "feat(backend): add concise variant to interviewer system prompt"
```

---

### Task 3: Thread concise through `Client.Evaluate`

**Files:**
- Modify: `backend/internal/llm/llm.go:112` (Client interface)
- Modify: `backend/internal/claude/claude.go:32,39`
- Modify: `backend/internal/ollama/ollama.go:34,35`
- Modify: `backend/internal/handlers/chat.go:79`
- Modify: `backend/internal/ollama/ollama_test.go` (5 `client.Evaluate` calls)
- Modify: `backend/internal/evaluation/evaluation_test.go:43` (stubLLM)

**Interfaces:**
- Consumes: `types.ChatRequest.Concise` (Task 1), `BuildStableSystemPrompt`/`BuildSystemPrompt` concise param (Task 2).
- Produces: `llm.Client.Evaluate(ctx, problem, stage, activeStages, history, userMessage, hintRequested, answerRequested, concise bool, onToken)` — the `concise` param sits immediately before `onToken`.

No new test — this is pure plumbing; the compiler is the test, and Task 2's tests already pin the prompt behavior. Existing tests must stay green.

- [ ] **Step 1: Change the interface**

In `backend/internal/llm/llm.go`, replace the `Evaluate` line of the `Client` interface with:

```go
	Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, hintRequested, answerRequested, concise bool, onToken func(string)) (EvaluateResponse, error)
```

- [ ] **Step 2: Update both implementations**

`backend/internal/claude/claude.go` — method signature (line 32) becomes:
```go
func (c *AnthropicClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested, concise bool, onToken func(string)) (llm.EvaluateResponse, error) {
```
and the Task 2 placeholder (line 39) becomes:
```go
	stablePrompt := llm.BuildStableSystemPrompt(problem.Title, problem.Description, activeStages, concise)
```

`backend/internal/ollama/ollama.go` — same two edits:
```go
func (c *OllamaClient) Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []llm.ChatMessage, userMessage string, hintRequested, answerRequested, concise bool, onToken func(string)) (llm.EvaluateResponse, error) {
	systemPrompt := llm.BuildSystemPrompt(problem.Title, problem.Description, stage, activeStages, hintRequested, answerRequested, concise)
```

- [ ] **Step 3: Update callers and mocks**

`backend/internal/handlers/chat.go:79`:
```go
		result, err := hs.llmClient.Evaluate(streamCtx, problem, req.Stage, req.ActiveStages, history, req.Message, req.HintRequested, req.AnswerRequested, req.Concise, onToken)
```

`backend/internal/ollama/ollama_test.go` — in each of the 5 `client.Evaluate(...)` calls, insert `false` between `answerRequested` and the final `onToken` argument. Example — before:
```go
	result, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", false, false, func(tok string) {
```
after:
```go
	result, err := client.Evaluate(context.Background(), problem, "algorithm", []string{"pattern", "algorithm", "tc_sc"}, nil, "use a hash map", false, false, false, func(tok string) {
```

`backend/internal/evaluation/evaluation_test.go:43` — stubLLM gains the extra bool:
```go
func (s *stubLLM) Evaluate(_ context.Context, _ models.Problem, _ string, _ []string, _ []llm.ChatMessage, _ string, _, _, _ bool, _ func(string)) (llm.EvaluateResponse, error) {
	return llm.EvaluateResponse{}, nil
}
```

- [ ] **Step 4: Build and test**

Run: `go build ./... && go test ./...`
Expected: all PASS. If any file still fails to compile, it is another `Evaluate` call site — apply the same mechanical insertion there.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(backend): thread concise flag through llm client Evaluate"
```

---

### Task 4: Evaluation rubric concise variant

**Files:**
- Modify: `backend/internal/llm/evaluation.go`
- Modify: `backend/internal/claude/evaluate.go:23` (caller — passes `false` until Task 5)
- Modify: `backend/internal/ollama/evaluate.go:17` (caller — passes `false` until Task 5)
- Test: `backend/internal/llm/evaluation_test.go`

**Interfaces:**
- Produces: `llm.BuildEvaluationSystemPrompt(concise bool) string` and `llm.BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage, concise bool) string`. `BuildEvaluationUserPrompt` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `backend/internal/llm/evaluation_test.go` (this file is in package `llm`, so no `llm.` qualifier):

```go
func TestBuildEvaluationSystemPrompt_concise_adds_calibration(t *testing.T) {
	prompt := BuildEvaluationSystemPrompt(true)
	if !strings.Contains(prompt, "concise mode") {
		t.Error("concise rubric must mention concise mode")
	}
	if !strings.Contains(prompt, "Do not penalize brevity") {
		t.Error("concise rubric must contain the brevity calibration")
	}
}

func TestBuildEvaluationSystemPrompt_strict_has_no_calibration(t *testing.T) {
	prompt := BuildEvaluationSystemPrompt(false)
	if strings.Contains(prompt, "concise mode") {
		t.Error("strict rubric must not mention concise mode")
	}
}

func TestBuildEvaluationSystemPrompt_concise_keeps_caps(t *testing.T) {
	prompt := BuildEvaluationSystemPrompt(true)
	for _, keep := range []string{"Reveal cap", "Hint cap", "Answer cap", `"scores"`} {
		if !strings.Contains(prompt, keep) {
			t.Errorf("concise rubric missing %q", keep)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/llm/... -run 'BuildEvaluationSystemPrompt' -v`
Expected: compile error — too many arguments to `BuildEvaluationSystemPrompt`.

- [ ] **Step 3: Implement**

In `backend/internal/llm/evaluation.go`:

3a. Change the signature and insert the calibration block between the "Calibration:" line and the "CRITICAL:" line:

```go
// BuildEvaluationSystemPrompt returns the static scoring rubric used as a
// cacheable system prompt for session evaluation. There are exactly two
// variants — strict and concise — each constant across calls.
func BuildEvaluationSystemPrompt(concise bool) string {
```

and after the existing line
```go
	sb.WriteString("Calibration: most sessions should score in the 0.2–0.6 range. Reserve 0.8–1.0 for genuinely strong, unprompted answers.\n\n")
```
add:
```go
	if concise {
		sb.WriteString("This session used concise mode: the candidate was asked for brief answers. Score brief-but-correct reasoning as well-reasoned (0.8). Do not penalize brevity — only penalize incorrectness or absence of reasoning.\n\n")
	}
```

3b. Replace `BuildEvaluationPrompt` with:

```go
// BuildEvaluationPrompt concatenates system + user content into a single string.
// Used by Ollama (no caching support) and existing tests.
func BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage, concise bool) string {
	return BuildEvaluationSystemPrompt(concise) + "\n\n" + BuildEvaluationUserPrompt(problem, activeStages, history)
}
```

3c. Fix the two callers (temporary `false`, threaded in Task 5):

`backend/internal/claude/evaluate.go:23`:
```go
				"text":          llm.BuildEvaluationSystemPrompt(false),
```

`backend/internal/ollama/evaluate.go:17`:
```go
	prompt := llm.BuildEvaluationPrompt(problem, activeStages, history, false)
```

3d. In `backend/internal/llm/evaluation_test.go`, append `, false` to the existing `BuildEvaluationPrompt(problem, activeStages, history)` call(s):
```go
	prompt := BuildEvaluationPrompt(problem, activeStages, history, false)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go build ./... && go test ./internal/llm/... -v`
Expected: build OK, all PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/llm/evaluation.go internal/llm/evaluation_test.go internal/claude/evaluate.go internal/ollama/evaluate.go
git commit -m "feat(backend): add concise calibration to session evaluation rubric"
```

---

### Task 5: Thread concise through `EvaluateSession`, dispatchers, and Kafka

**Files:**
- Modify: `backend/internal/llm/llm.go:113` (Client interface)
- Modify: `backend/internal/claude/evaluate.go:15,23`
- Modify: `backend/internal/ollama/evaluate.go:16,17`
- Modify: `backend/internal/evaluation/evaluation.go` (interface, `RunSession`, `RunSessionWithError`)
- Modify: `backend/internal/evaluation/goroutine_dispatcher.go:24`
- Modify: `backend/internal/evaluation/kafka_dispatcher.go` (fallback type, `Dispatch`)
- Modify: `backend/internal/kafka/events.go`
- Modify: `backend/internal/handlers/chat.go:97`
- Modify: `backend/cmd/server/main.go:92-94`
- Modify: `backend/cmd/evaluator/main.go:56`
- Modify: `backend/internal/evaluation/evaluation_test.go` (stubLLM + `RunSessionWithError` calls)
- Modify: `backend/internal/evaluation/kafka_dispatcher_test.go` (`Dispatch` calls + fallback closures)
- Test: `backend/internal/evaluation/kafka_dispatcher_test.go` (new assertion)

**Interfaces:**
- Consumes: `BuildEvaluationSystemPrompt`/`BuildEvaluationPrompt` concise param (Task 4), `req.Concise` (Task 1).
- Produces:
  - `llm.Client.EvaluateSession(ctx, problem, activeStages []string, history []ChatMessage, concise bool)`
  - `evaluation.EvaluationDispatcher.Dispatch(ctx, userID, problem, activeStages, history, concise bool)`
  - `evaluation.RunSession(ctx, store, llmClient, logger, userID, problem, activeStages, history, concise bool)` and `RunSessionWithError(... same ...) error`
  - `kafka.SessionCompletedEvent.Concise bool` with json tag `concise`
  - KafkaDispatcher fallback type: `func(context.Context, uuid.UUID, models.Problem, []string, []llm.ChatMessage, bool)`

- [ ] **Step 1: Write the failing test**

In `backend/internal/evaluation/kafka_dispatcher_test.go`, first extend `mockPublisher` to record the last published event — replace the type and its method with:

```go
// mockPublisher satisfies evaluation.SessionPublisher.
type mockPublisher struct {
	err       error
	lastEvent kafka.SessionCompletedEvent
}

func (m *mockPublisher) PublishSessionCompleted(_ context.Context, event kafka.SessionCompletedEvent) error {
	m.lastEvent = event
	return m.err
}
```

Then add the new test:

```go
func TestKafkaDispatcher_ConciseFlagOnEvent(t *testing.T) {
	pub := &mockPublisher{err: nil}
	d := evaluation.NewKafkaDispatcher(
		pub,
		func(_ context.Context, _ uuid.UUID, _ models.Problem, _ []string, _ []llm.ChatMessage, _ bool) {},
		testLogger,
	)
	d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory, true)
	assert.True(t, pub.lastEvent.Concise)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/evaluation/... -run 'ConciseFlagOnEvent' -v`
Expected: compile error — `Concise` undefined on `kafka.SessionCompletedEvent` / wrong arity.

- [ ] **Step 3: Implement the thread-through**

3a. `backend/internal/kafka/events.go`:
```go
type SessionCompletedEvent struct {
	UserID       uuid.UUID         `json:"user_id"`
	Problem      models.Problem    `json:"problem"`
	ActiveStages []string          `json:"active_stages"`
	History      []llm.ChatMessage `json:"history"`
	Concise      bool              `json:"concise"`
}
```

3b. `backend/internal/llm/llm.go` — `EvaluateSession` line of the `Client` interface:
```go
	EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []ChatMessage, concise bool) (SessionEvaluation, error)
```

3c. `backend/internal/claude/evaluate.go` — signature (line 15) and the Task 4 placeholder (line 23):
```go
func (c *AnthropicClient) EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) (llm.SessionEvaluation, error) {
```
```go
				"text":          llm.BuildEvaluationSystemPrompt(concise),
```

3d. `backend/internal/ollama/evaluate.go` — same two edits:
```go
func (c *OllamaClient) EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) (llm.SessionEvaluation, error) {
	prompt := llm.BuildEvaluationPrompt(problem, activeStages, history, concise)
```

3e. `backend/internal/evaluation/evaluation.go` — interface, `RunSession`, `RunSessionWithError`:
```go
type EvaluationDispatcher interface {
	Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool)
}
```
```go
func RunSession(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	if err := RunSessionWithError(ctx, store, llmClient, logger, userID, problem, activeStages, history, concise); err != nil {
```
```go
func RunSessionWithError(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) error {
```
and inside `RunSessionWithError`:
```go
	eval, err := llmClient.EvaluateSession(ctx, problem, activeStages, history, concise)
```

3f. `backend/internal/evaluation/goroutine_dispatcher.go:24`:
```go
func (d *GoroutineDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	RunSession(ctx, d.store, d.llmClient, d.logger, userID, problem, activeStages, history, concise)
}
```

3g. `backend/internal/evaluation/kafka_dispatcher.go` — fallback field, constructor, `Dispatch`:
```go
type KafkaDispatcher struct {
	publisher SessionPublisher
	fallback  func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool)
	logger    *slog.Logger
}

func NewKafkaDispatcher(publisher SessionPublisher, fallback func(context.Context, uuid.UUID, models.Problem, []string, []llm.ChatMessage, bool), logger *slog.Logger) *KafkaDispatcher {
	return &KafkaDispatcher{publisher: publisher, fallback: fallback, logger: logger}
}

func (d *KafkaDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	event := kafka.SessionCompletedEvent{
		UserID:       userID,
		Problem:      problem,
		ActiveStages: activeStages,
		History:      history,
		Concise:      concise,
	}
	if err := d.publisher.PublishSessionCompleted(ctx, event); err != nil {
		d.logger.Error("kafka publish failed, falling back to inline evaluation", "error", err)
		d.fallback(ctx, userID, problem, activeStages, history, concise)
	}
}
```

3h. `backend/internal/handlers/chat.go:97`:
```go
			go hs.dispatcher.Dispatch(context.Background(), evalUID, evalProblem, evalActiveStages, fullHistory, req.Concise)
```

3i. `backend/cmd/server/main.go:92-94` — fallback closure:
```go
		fallback := func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
			evaluation.RunSession(ctx, store, llmClient, slog.Default(), userID, problem, activeStages, history, concise)
		}
```

3j. `backend/cmd/evaluator/main.go:56`:
```go
		return evaluation.RunSessionWithError(ctx, pg, llmClient, logger, event.UserID, event.Problem, event.ActiveStages, event.History, event.Concise)
```

3k. Test updates:
- `backend/internal/evaluation/evaluation_test.go`: stubLLM `EvaluateSession` becomes
  ```go
  func (s *stubLLM) EvaluateSession(_ context.Context, _ models.Problem, _ []string, _ []llm.ChatMessage, _ bool) (llm.SessionEvaluation, error) {
  ```
  and every `evaluation.RunSessionWithError(...)` call (4 of them) gains `, false` as the final argument.
- `backend/internal/evaluation/kafka_dispatcher_test.go`: both existing `d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory)` calls become `d.Dispatch(context.Background(), testUserID, testProblem, testStages, testHistory, false)`, and both existing fallback closures gain a trailing `_ bool` parameter — e.g. line 30 becomes:
  ```go
  		func(_ context.Context, _ uuid.UUID, _ models.Problem, _ []string, _ []llm.ChatMessage, _ bool) {
  ```
  and line 45 becomes:
  ```go
  		func(_ context.Context, uid uuid.UUID, p models.Problem, _ []string, _ []llm.ChatMessage, _ bool) {
  ```

- [ ] **Step 4: Build and test**

Run: `go build ./... && go test ./...`
Expected: all PASS including `TestKafkaDispatcher_ConciseFlagOnEvent`. Any remaining compile error is another `EvaluateSession`/`Dispatch`/`RunSession` call site — apply the same mechanical addition.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(backend): thread concise flag through session evaluation pipeline"
```

---

### Task 6: Backend settings persistence

**Files:**
- Modify: `backend/db/schema.sql:22-29`
- Modify: `backend/internal/models/user_settings.go`
- Modify: `backend/internal/storage/storage.go:29`
- Modify: `backend/internal/storage/postgres/user_settings.go`
- Modify: `backend/internal/storage/processcache/process_cache.go:277-278`
- Modify: `backend/internal/storage/processcache/process_cache_test.go:61` (stubStorage)
- Modify: `backend/internal/handlers/settings.go`
- Test: `backend/internal/storage/postgres/user_settings_test.go`

**Interfaces:**
- Produces: `models.UserSettings.ConciseMode bool` (json/db tag `concise_mode`); `UpsertUserSettings(ctx, userID, activeStages []string, hideTitle, hideDifficulty, conciseMode bool, activeTopics []string, tourDone bool) error`; settings GET/PUT JSON gains `concise_mode` — consumed by Task 7's frontend.

- [ ] **Step 1: Write the failing test**

Add to `backend/internal/storage/postgres/user_settings_test.go` (add `"encoding/json"` and `"strings"` to imports if absent; `models` is already imported there if the file tests settings — match its import list):

```go
func TestUserSettings_ConciseModeJSONTag(t *testing.T) {
	b, err := json.Marshal(models.UserSettings{ConciseMode: true})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"concise_mode":true`) {
		t.Errorf("expected concise_mode json tag, got %s", b)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/storage/postgres/... -run 'ConciseModeJSONTag' -v`
Expected: compile error — `ConciseMode` undefined.

- [ ] **Step 3: Implement**

3a. `backend/db/schema.sql` — user_settings becomes:
```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages   TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title      BOOLEAN NOT NULL DEFAULT TRUE,
  hide_difficulty BOOLEAN NOT NULL DEFAULT TRUE,
  concise_mode    BOOLEAN NOT NULL DEFAULT FALSE,
  active_topics   TEXT[]  NOT NULL DEFAULT '{}',
  tour_done       BOOLEAN NOT NULL DEFAULT FALSE
);
```

3b. `backend/internal/models/user_settings.go`:
```go
package models

import "github.com/google/uuid"

type UserSettings struct {
	UserID         uuid.UUID `json:"user_id"          db:"user_id"`
	ActiveStages   []string  `json:"active_stages"    db:"active_stages"`
	HideTitle      bool      `json:"hide_title"       db:"hide_title"`
	HideDifficulty bool      `json:"hide_difficulty"  db:"hide_difficulty"`
	ConciseMode    bool      `json:"concise_mode"     db:"concise_mode"`
	ActiveTopics   []string  `json:"active_topics"    db:"active_topics"`
	TourDone       bool      `json:"tour_done"        db:"tour_done"`
}
```

3c. `backend/internal/storage/storage.go:29`:
```go
	UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, conciseMode bool, activeTopics []string, tourDone bool) error
```

3d. `backend/internal/storage/postgres/user_settings.go` — replace both functions:
```go
func (p *Postgres) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	const sql = `SELECT user_id, active_stages, hide_title, hide_difficulty, concise_mode, active_topics, tour_done FROM user_settings WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (models.UserSettings, error) {
		row, err := p.Pool.Query(ctx, sql, userID)
		if err != nil {
			return models.UserSettings{}, err
		}
		s, err := pgx.CollectOneRow(row, pgx.RowToStructByName[models.UserSettings])
		if errors.Is(err, pgx.ErrNoRows) {
			return models.UserSettings{
				UserID:         userID,
				ActiveStages:   defaultActiveStages,
				HideTitle:      true,
				HideDifficulty: true,
				ConciseMode:    false,
				ActiveTopics:   defaultActiveTopics,
				TourDone:       false,
			}, nil
		}
		if err != nil {
			return models.UserSettings{}, err
		}
		s.ActiveTopics = resolveActiveTopics(s.ActiveTopics)
		return s, nil
	})
}

func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, conciseMode bool, activeTopics []string, tourDone bool) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages, hide_title, hide_difficulty, concise_mode, active_topics, tour_done)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE
		SET active_stages   = EXCLUDED.active_stages,
		    hide_title      = EXCLUDED.hide_title,
		    hide_difficulty = EXCLUDED.hide_difficulty,
		    concise_mode    = EXCLUDED.concise_mode,
		    active_topics   = EXCLUDED.active_topics,
		    tour_done       = EXCLUDED.tour_done
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages, hideTitle, hideDifficulty, conciseMode, activeTopics, tourDone)
		return struct{}{}, err
	})
	return err
}
```

3e. `backend/internal/storage/processcache/process_cache.go:277-278`:
```go
func (c *CachedStorage) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, conciseMode bool, activeTopics []string, tourDone bool) error {
	return c.inner.UpsertUserSettings(ctx, userID, activeStages, hideTitle, hideDifficulty, conciseMode, activeTopics, tourDone)
}
```

3f. `backend/internal/storage/processcache/process_cache_test.go:61` — stubStorage:
```go
func (s *stubStorage) UpsertUserSettings(_ context.Context, _ uuid.UUID, _ []string, _ bool, _ bool, _ bool, _ []string, _ bool) error {
```
(keep the existing body).

3g. `backend/internal/handlers/settings.go` — add `ConciseMode` to both inline structs and both call chains. `GetSettings` response struct and return become:
```go
	type response struct {
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ConciseMode    bool     `json:"concise_mode"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
	}
	return c.JSON(response{
		ActiveStages:   settings.ActiveStages,
		HideTitle:      settings.HideTitle,
		HideDifficulty: settings.HideDifficulty,
		ConciseMode:    settings.ConciseMode,
		ActiveTopics:   settings.ActiveTopics,
		TourDone:       settings.TourDone,
	})
```
`UpdateSettings` request struct gains the same field:
```go
	type request struct {
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ConciseMode    bool     `json:"concise_mode"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
	}
```
and the upsert call becomes:
```go
	if err := hs.storage.UpsertUserSettings(c.RequestCtx(), uid, req.ActiveStages, req.HideTitle, req.HideDifficulty, req.ConciseMode, req.ActiveTopics, req.TourDone); err != nil {
```

- [ ] **Step 4: Build and test**

Run: `go build ./... && go test ./...`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(backend): persist concise_mode user setting"
```

**Deploy note (not a code step):** the live database needs a one-time migration when this ships — `ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS concise_mode BOOLEAN NOT NULL DEFAULT FALSE;` — since `schema.sql` uses `CREATE TABLE IF NOT EXISTS` and will not alter the existing table. Same procedure as `hide_difficulty`.

---

### Task 7: Frontend — settings toggle and chat wiring

**Files:**
- Modify: `frontend/src/api.ts` (streamChat, getSettings, updateSettings)
- Modify: `frontend/src/hooks/useAuth.ts`
- Modify: `frontend/src/components/StagesSettings.tsx`
- Modify: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: settings API `concise_mode` and chat API `concise` (Tasks 1, 6).
- Produces: `useAuth()` returns `conciseMode: boolean` and `persistConciseMode(value: boolean): void`; `streamChat(problemId, stage, activeStages, history, message, hintRequested, answerRequested, concise, signal?)`.

The frontend has no test coverage of api.ts/useAuth (the one vitest file covers other code) — verification here is typecheck + build + the manual test in Task 8. Frontend files use kebab-case except React components (PascalCase) — all touched files already comply.

- [ ] **Step 1: api.ts**

1a. `streamChat` — add a `concise` parameter and body field:
```ts
export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  concise: boolean,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'done'; stage: Stage; message: string }
> {
```
and in the fetch body:
```ts
    body: JSON.stringify({
      problem_id: problemId,
      stage,
      active_stages: activeStages,
      history,
      message,
      hint_requested: hintRequested,
      answer_requested: answerRequested,
      concise,
    }),
```

1b. `getSettings` return type gains the field:
```ts
export async function getSettings(): Promise<{
  active_stages: ActiveStage[]
  hide_title: boolean
  hide_difficulty: boolean
  concise_mode: boolean
  active_topics: string[]
  tour_done: boolean
}> {
```

1c. `updateSettings` gains a param (after `hideDifficulty`) and body field:
```ts
export async function updateSettings(
  activeStages: ActiveStage[],
  hideTitle: boolean,
  hideDifficulty: boolean,
  conciseMode: boolean,
  activeTopics: string[],
  tourDone: boolean,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      active_stages: activeStages,
      hide_title: hideTitle,
      hide_difficulty: hideDifficulty,
      concise_mode: conciseMode,
      active_topics: activeTopics,
      tour_done: tourDone,
    }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
```

- [ ] **Step 2: useAuth.ts**

2a. State, next to the other setting states (after line 39):
```ts
  const [conciseMode, setConciseMode] = useState(false)
```

2b. In `applyLocalSettings`, read localStorage (after the `storedHideDifficulty` block, extending the existing sets):
```ts
    const storedConciseMode = localStorage.getItem('leetgame_concise_mode')
```
and after the `setHideDifficulty(...)` call:
```ts
    setConciseMode(storedConciseMode === 'true')
```

2c. In the `getSettings().then(...)` destructuring and body:
```ts
            .then(
              ({
                active_stages,
                hide_title,
                hide_difficulty,
                concise_mode,
                active_topics,
                tour_done,
              }) => {
                setActiveStages(active_stages)
                setHideTitle(hide_title)
                setHideDifficulty(hide_difficulty)
                setConciseMode(concise_mode)
                setActiveTopics(active_topics ?? NEETCODE_TOPICS)
                setTourDone(tour_done)
              },
            )
```

2d. Every existing `updateSettings(...)` call in the file (in `persistStages`, `persistHideTitle`, `persistHideDifficulty`, `persistTopics`, `persistTourDone`) gains `conciseMode` as the new 4th argument, e.g. `persistStages` becomes:
```ts
      updateSettings(
        stages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        tourDone,
      ).catch(() => {})
```

2e. New persist function, after `persistHideDifficulty`:
```ts
  const persistConciseMode = (value: boolean) => {
    setConciseMode(value)
    if (session) {
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        value,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_concise_mode', String(value))
      } catch {
        /* ignore */
      }
    }
  }
```

2f. Return object gains `conciseMode,` (after `hideDifficulty,`) and `persistConciseMode,` (after `persistHideDifficulty,`).

- [ ] **Step 3: StagesSettings.tsx**

Props interface gains (after `onHideDifficultyChange`):
```ts
  conciseMode: boolean
  onConciseModeChange: (value: boolean) => void
```
Destructure `conciseMode, onConciseModeChange` in the component parameters at the same position. Then add the toggle button directly after the hide-difficulty `</button>` (before the `Practice Stages` divider):
```tsx
      <button
        onClick={() => onConciseModeChange(!conciseMode)}
        className="hover:bg-muted flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors"
      >
        <Checkbox
          checked={conciseMode}
          onCheckedChange={(v) => onConciseModeChange(v === true)}
        />
        <div>
          <p className="text-sm font-medium">Concise mode</p>
          <p className="text-muted-foreground text-xs">
            Less back-and-forth — brief correct answers advance the stage
          </p>
        </div>
      </button>
```

- [ ] **Step 4: NavBar.tsx**

Props interface gains (after `onHideDifficultyChange`):
```ts
  conciseMode: boolean
  onConciseModeChange: (value: boolean) => void
```
Destructure both in the component parameters at the same position, and pass them to `<StagesSettings>`:
```tsx
                hideDifficulty={hideDifficulty}
                onHideDifficultyChange={onHideDifficultyChange}
                conciseMode={conciseMode}
                onConciseModeChange={onConciseModeChange}
```

- [ ] **Step 5: App.tsx**

5a. Destructure from `useAuth()` (after `hideDifficulty,`): `conciseMode,` and (after `persistHideDifficulty,`): `persistConciseMode,`.

5b. Handler, next to `handleHideDifficultyChange` (~line 193):
```ts
  const handleConciseModeChange = (value: boolean) => {
    persistConciseMode(value)
  }
```

5c. `<NavBar>` call gains, after `onHideDifficultyChange={handleHideDifficultyChange}`:
```tsx
        conciseMode={conciseMode}
        onConciseModeChange={handleConciseModeChange}
```

5d. The `streamChat(...)` call (~line 475) gains `conciseMode` between `answerRequested` and `controller.signal`:
```ts
      for await (const event of streamChat(
        problem.id,
        stage,
        sessionActiveStages,
        history,
        message,
        hintRequested,
        answerRequested,
        conciseMode,
        controller.signal,
      )) {
```

- [ ] **Step 6: Typecheck, lint, test, build**

Run from `frontend/`: `npx tsc -b && npm run lint && npm test && npm run build`
Expected: no type errors (a missed `updateSettings`/`streamChat` call site fails here — fix by the same mechanical rule), lint passes with only the 3 pre-existing App.tsx warnings, 10 vitest tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/hooks/useAuth.ts src/components/StagesSettings.tsx src/components/NavBar.tsx src/App.tsx
git commit -m "feat(frontend): add concise mode settings toggle and chat wiring"
```

---

### Task 8: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full suites**

```bash
cd /Users/aaronkim/projects/leetgame/.claude/worktrees/concise-mode/backend && go build ./... && go test ./...
cd /Users/aaronkim/projects/leetgame/.claude/worktrees/concise-mode/frontend && npx tsc -b && npm test && npm run build
```
Expected: everything green.

- [ ] **Step 2: Manual prompt inspection**

Write a throwaway Go test or use the existing ones to print both prompt variants and eyeball them:
```bash
cd backend && go test ./internal/llm/... -v -run 'Concise|BuildStableSystemPrompt|BuildEvaluationSystemPrompt'
```
Confirm: strict output unchanged, concise output contains lenient rules + calibration, both end with the JSON contract.

- [ ] **Step 3: Manual app verification (requires local stack)**

If the local backend + frontend + DB run in this environment: apply the schema/ALTER to the local DB, start both, then in the browser:
1. Open settings (⚙) — "Concise mode" toggle appears, off by default.
2. Toggle it on; reload — it persists (signed in: via API; signed out: via localStorage).
3. Start a practice chat and confirm the request body of `POST /api/chat` includes `"concise":true` (browser devtools network tab).
4. Answer a stage with a correct one-liner + brief reason — the interviewer should advance rather than drill down.

If the local stack is not runnable here, report that steps 1-4 need a manual pass by the user before merge.

- [ ] **Step 4: Finish the branch**

Use superpowers:finishing-a-development-branch to choose merge/PR/cleanup.
