# Prompt Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Anthropic prompt caching to both the streaming chat and batch session-evaluation Claude API calls, reducing costs ~90% on cached tokens per session.

**Architecture:** The system prompt in `Evaluate` (streaming) is rebuilt on every turn but is largely identical across turns — only the current stage and optional hint/answer flag change. We split it into a stable cacheable block and a tiny volatile suffix. For `EvaluateSession` (batch), the entire scoring rubric is fixed; only the problem + conversation history changes. We extract the rubric into a cached system prompt and move the dynamic content to the user message. Ollama (which doesn't support caching) is unaffected because it calls `BuildSystemPrompt` / `BuildEvaluationPrompt`, which become thin wrappers.

**Tech Stack:** Go, Anthropic API (`anthropic-version: 2023-06-01`), `cache_control: {"type": "ephemeral"}` on system text blocks

---

## File Map

| File | Change |
|---|---|
| `backend/internal/llm/llm.go` | Add `BuildStableSystemPrompt`, `BuildVolatileSystemSuffix`; keep `BuildSystemPrompt` as a wrapper |
| `backend/internal/llm/evaluation.go` | Add `BuildEvaluationSystemPrompt`, `BuildEvaluationUserPrompt`; keep `BuildEvaluationPrompt` as a wrapper |
| `backend/internal/claude/claude.go` | Change `"system": string` → `"system": []map[string]any` with `cache_control` on stable block |
| `backend/internal/claude/evaluate.go` | Add `"system"` with `cache_control`; change user message to dynamic-only content |
| `backend/internal/llm/llm_test.go` | Add tests for `BuildStableSystemPrompt` and `BuildVolatileSystemSuffix` |
| `backend/internal/llm/evaluation_test.go` | Add tests for `BuildEvaluationSystemPrompt` and `BuildEvaluationUserPrompt` |

---

### Task 1: Split `BuildSystemPrompt` into stable + volatile parts

**Files:**
- Modify: `backend/internal/llm/llm.go`
- Modify: `backend/internal/llm/llm_test.go`

- [ ] **Step 1: Write failing tests for `BuildStableSystemPrompt`**

Add to `backend/internal/llm/llm_test.go` (file is `package llm_test`):

```go
func TestBuildStableSystemPrompt_contains_problem_title(t *testing.T) {
	stable := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern", "algorithm"})
	if !strings.Contains(stable, "Two Sum") {
		t.Error("expected stable prompt to contain problem title")
	}
}

func TestBuildStableSystemPrompt_contains_stage_guide(t *testing.T) {
	stable := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern", "tc_sc"})
	if !strings.Contains(stable, "Optimal Pattern") {
		t.Error("expected stable prompt to contain active stage label")
	}
	if strings.Contains(stable, "Brute Force") {
		t.Error("expected stable prompt to NOT contain inactive stage")
	}
}

func TestBuildStableSystemPrompt_does_not_contain_current_stage_line(t *testing.T) {
	stable := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern"})
	if strings.Contains(stable, "The current stage is:") {
		t.Error("expected stable prompt to NOT contain current stage line")
	}
}

func TestBuildStableSystemPrompt_does_not_contain_hint_or_answer_instruction(t *testing.T) {
	stable := llm.BuildStableSystemPrompt("Two Sum", "Given an array...", []string{"pattern"})
	if strings.Contains(stable, "Give a targeted hint") {
		t.Error("expected stable prompt to NOT contain hint instruction")
	}
	if strings.Contains(stable, "Reveal the correct answer") {
		t.Error("expected stable prompt to NOT contain answer instruction")
	}
}

func TestBuildVolatileSystemSuffix_contains_current_stage(t *testing.T) {
	volatile := llm.BuildVolatileSystemSuffix("pattern", false, false)
	if !strings.Contains(volatile, `"pattern"`) {
		t.Error("expected volatile suffix to contain current stage")
	}
}

func TestBuildVolatileSystemSuffix_hint_requested(t *testing.T) {
	volatile := llm.BuildVolatileSystemSuffix("pattern", true, false)
	if !strings.Contains(volatile, "Give a targeted hint") {
		t.Error("expected volatile suffix to contain hint instruction when hintRequested=true")
	}
}

func TestBuildVolatileSystemSuffix_answer_requested(t *testing.T) {
	volatile := llm.BuildVolatileSystemSuffix("pattern", false, true)
	if !strings.Contains(volatile, "Reveal the correct answer") {
		t.Error("expected volatile suffix to contain answer instruction when answerRequested=true")
	}
}

func TestBuildVolatileSystemSuffix_no_flags(t *testing.T) {
	volatile := llm.BuildVolatileSystemSuffix("algorithm", false, false)
	if strings.Contains(volatile, "hint") || strings.Contains(volatile, "answer") {
		t.Error("expected volatile suffix to NOT contain hint/answer instruction when neither flag set")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go test ./internal/llm/... -run "TestBuildStableSystemPrompt|TestBuildVolatileSystemSuffix" -v
```

Expected: `FAIL — undefined: llm.BuildStableSystemPrompt`

- [ ] **Step 3: Add `BuildStableSystemPrompt` and `BuildVolatileSystemSuffix` to `llm.go`, and update `BuildSystemPrompt` to be a wrapper**

In `backend/internal/llm/llm.go`, replace the `BuildSystemPrompt` function with:

```go
// BuildStableSystemPrompt returns the cacheable portion of the system prompt —
// everything that is constant for a given problem + active stages combination.
func BuildStableSystemPrompt(title, description string, activeStages []string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "You are a technical interviewer helping a candidate practice LeetCode-style algorithm problems.\n\nProblem Title: %s\nProblem Description:\n%s\n\n", title, description)

	sb.WriteString("INTERVIEWER RULES — follow these at all times:\n")
	sb.WriteString("1. NEVER explain the answer or describe the approach yourself. Your job is to ask questions, not teach.\n")
	sb.WriteString("2. When the candidate gives a correct but brief answer (e.g. \"hash map\"), do NOT confirm it and then explain how it works. Instead, ask them to explain it: \"Good — how would you use that?\"\n")
	sb.WriteString("3. Only advance the stage when the candidate has articulated the answer themselves, in their own words. A one-word or one-phrase answer is never sufficient.\n")
	sb.WriteString("4. Ask ONE question per response. Never ask multiple questions or provide follow-up hints unprompted.\n")
	sb.WriteString("5. Keep responses short. One or two sentences maximum.\n\n")

	sb.WriteString("Guide the candidate through the following stages in order:\n\n")
	for i, s := range activeStages {
		d, ok := stageDescriptions[s]
		if !ok {
			continue
		}
		successStage := "complete"
		if i < len(activeStages)-1 {
			successStage = activeStages[i+1]
		}
		fmt.Fprintf(&sb, "Stage %d — %s (stage = %q):\n%s\n%s\nOn success: set stage to %q.\n\n",
			i, d.label, s, d.criteria, d.guidance, successStage)
	}

	sb.WriteString("CRITICAL: Your entire response must be ONLY the following JSON object — no explanation, no text before or after, no code fences wrapping the JSON:\n")
	sb.WriteString(`{"message": "<your response to the candidate>", "stage": "<stage_id>"}`)
	sb.WriteString("\n\nThe \"message\" value is displayed in a markdown renderer, so you MAY use markdown formatting (bold, bullet lists, inline code, code blocks) inside the message string when it aids clarity. Any response that is not pure JSON will be rejected. Do not write anything except the JSON object.")

	return sb.String()
}

// BuildVolatileSystemSuffix returns the per-turn portion of the system prompt —
// the current stage and any hint/answer instruction.
func BuildVolatileSystemSuffix(stage string, hintRequested, answerRequested bool) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "The current stage is: %q", stage)

	if hintRequested {
		sb.WriteString("\n\nThe user has clicked 'Give me a hint'. Give a targeted hint that moves them toward the answer without fully revealing it. One sentence maximum.")
	} else if answerRequested {
		sb.WriteString("\n\nThe user has clicked 'Give me the answer'. Reveal the correct answer for the current stage clearly and completely. Use markdown formatting — bullet points, bold, and inline code — to make the answer easy to read.")
	}

	return sb.String()
}

// BuildSystemPrompt concatenates the stable and volatile parts.
// Used by Ollama (which does not support caching) and existing tests.
func BuildSystemPrompt(title, description, stage string, activeStages []string, hintRequested, answerRequested bool) string {
	return BuildStableSystemPrompt(title, description, activeStages) + "\n\n" + BuildVolatileSystemSuffix(stage, hintRequested, answerRequested)
}
```

- [ ] **Step 4: Run all llm tests to verify new tests pass and existing tests still pass**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go test ./internal/llm/... -v
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/llm/llm.go internal/llm/llm_test.go
git commit -m "feat: split BuildSystemPrompt into stable and volatile parts for prompt caching"
```

---

### Task 2: Use cached system blocks in `claude.go` `Evaluate`

**Files:**
- Modify: `backend/internal/claude/claude.go`

- [ ] **Step 1: Update `Evaluate` in `claude.go` to pass system as array with `cache_control`**

Replace the `body` construction in `Evaluate` (lines 41–47 in `claude.go`):

```go
// Before:
body := map[string]any{
    "model":      c.model,
    "max_tokens": 1024,
    "stream":     true,
    "system":     systemPrompt,
    "messages":   messages,
}
```

With:

```go
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
```

Also remove the `systemPrompt` variable line that is no longer used (was `systemPrompt := llm.BuildSystemPrompt(...)`).

The updated `Evaluate` function opening becomes:

```go
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
	// ... rest of function unchanged
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go build ./...
```

Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/claude/claude.go
git commit -m "feat: add prompt caching to Evaluate streaming call via system block array"
```

---

### Task 3: Split `BuildEvaluationPrompt` into system + user parts

**Files:**
- Modify: `backend/internal/llm/evaluation.go`
- Modify: `backend/internal/llm/evaluation_test.go`

- [ ] **Step 1: Write failing tests for `BuildEvaluationSystemPrompt` and `BuildEvaluationUserPrompt`**

Add to `backend/internal/llm/evaluation_test.go` (file is `package llm`):

```go
func TestBuildEvaluationSystemPrompt_contains_rubric_anchors(t *testing.T) {
	system := BuildEvaluationSystemPrompt()

	checks := []struct {
		name    string
		contain string
	}{
		{"contains pattern rubric anchor 0.2", "Vague or surface answer with no real substance"},
		{"contains pattern rubric anchor 1.0", "Thorough and accurate with clear reasoning"},
		{"contains edge_cases rubric anchor 0.0", "Identified no relevant edge cases"},
		{"contains edge_cases rubric anchor 0.4", "missed the most important one"},
		{"contains tc_sc rubric anchor 0.5", "One correct, one wrong"},
		{"contains tc_sc rubric anchor 0.7", "Both correct, explanation vague"},
		{"contains reveal cap instruction", "cap that stage's score at 0.2 regardless"},
		{"contains hint cap instruction", "nearest valid anchor"},
		{"contains answer cap instruction", "USER REQUESTED ANSWER"},
		{"contains calibration note", "most sessions should score in the 0.2"},
		{"contains JSON instruction", `"scores"`},
	}
	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if !strings.Contains(system, c.contain) {
				t.Errorf("system prompt missing %q", c.contain)
			}
		})
	}
}

func TestBuildEvaluationSystemPrompt_does_not_contain_problem_specific_content(t *testing.T) {
	system := BuildEvaluationSystemPrompt()
	if strings.Contains(system, "Two Sum") {
		t.Error("system prompt should not contain problem-specific content")
	}
	if strings.Contains(system, "Array") {
		t.Error("system prompt should not contain topic tags")
	}
}

func TestBuildEvaluationUserPrompt_contains_problem_and_history(t *testing.T) {
	problem := models.Problem{
		Id:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:       "Two Sum",
		Description: "Given an array...",
		TopicTags:   []string{"Array", "Hash Table"},
	}
	history := []ChatMessage{
		{Role: "user", Content: "I think we use a hash map"},
		{Role: "assistant", Content: "Good, can you explain why?"},
	}

	user := BuildEvaluationUserPrompt(problem, []string{"pattern", "tc_sc"}, history)

	checks := []struct {
		name    string
		contain string
	}{
		{"contains problem title", "Two Sum"},
		{"contains topic tags", "Array"},
		{"contains active stages", "pattern"},
		{"contains user message", "I think we use a hash map"},
		{"contains assistant message", "Good, can you explain why?"},
	}
	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if !strings.Contains(user, c.contain) {
				t.Errorf("user prompt missing %q", c.contain)
			}
		})
	}
}

func TestBuildEvaluationUserPrompt_does_not_contain_rubric(t *testing.T) {
	problem := models.Problem{
		Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:     "Two Sum",
		TopicTags: []string{"Array"},
	}
	user := BuildEvaluationUserPrompt(problem, []string{"pattern"}, nil)
	if strings.Contains(user, "Vague or surface answer") {
		t.Error("user prompt should not contain rubric content")
	}
	if strings.Contains(user, `"scores"`) {
		t.Error("user prompt should not contain JSON instruction")
	}
}

func TestBuildEvaluationUserPrompt_marker_injection(t *testing.T) {
	problem := models.Problem{
		Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:     "Two Sum",
		TopicTags: []string{"Array"},
	}
	history := []ChatMessage{
		{Role: "user", Content: "I think hash map", Marker: "hint"},
		{Role: "user", Content: "OK reveal it", Marker: "answer"},
	}
	user := BuildEvaluationUserPrompt(problem, []string{"pattern"}, history)
	if !strings.Contains(user, "[USER REQUESTED HINT]\nI think hash map") {
		t.Error("expected hint marker injected before hint message content")
	}
	if !strings.Contains(user, "[USER REQUESTED ANSWER]\nOK reveal it") {
		t.Error("expected answer marker injected before answer message content")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go test ./internal/llm/... -run "TestBuildEvaluationSystemPrompt|TestBuildEvaluationUserPrompt" -v
```

Expected: `FAIL — undefined: BuildEvaluationSystemPrompt`

- [ ] **Step 3: Add `BuildEvaluationSystemPrompt` and `BuildEvaluationUserPrompt` to `evaluation.go`, and update `BuildEvaluationPrompt` to be a wrapper**

In `backend/internal/llm/evaluation.go`, replace the `BuildEvaluationPrompt` function with:

```go
// BuildEvaluationSystemPrompt returns the static scoring rubric used as a
// cacheable system prompt for session evaluation. It never changes across calls.
func BuildEvaluationSystemPrompt() string {
	var sb strings.Builder

	sb.WriteString("You are evaluating a candidate's performance on a LeetCode practice session.\n\n")
	sb.WriteString("Score the candidate's demonstrated understanding for each (topic, stage) pair that was actually tested.")
	sb.WriteString(" Only include pairs from the problem's tags × active stages.\n\n")
	sb.WriteString("Use the stage-specific anchors below. Pick the anchor that best fits — do not average or interpolate.\n\n")
	sb.WriteString("**pattern, brute_force, algorithm** — correctness and depth of explanation:\n")
	sb.WriteString("  0.0 — Nothing correct, completely wrong, or did not engage with this stage\n")
	sb.WriteString("  0.2 — Vague or surface answer with no real substance (e.g. named a concept without explaining it)\n")
	sb.WriteString("  0.4 — Partial understanding: some correct ideas but significant gaps or wrong reasoning\n")
	sb.WriteString("  0.6 — Correct on the core idea but missed a key detail or nuance\n")
	sb.WriteString("  0.8 — Correct and well-reasoned, covered the key points\n")
	sb.WriteString("  1.0 — Thorough and accurate with clear reasoning and no meaningful gaps\n\n")
	sb.WriteString("**edge_cases** — coverage and specificity:\n")
	sb.WriteString("  First determine the key edge cases for this specific problem.\n")
	sb.WriteString("  0.0 — Identified no relevant edge cases\n")
	sb.WriteString("  0.2 — Only named generic cases not specific to this problem (e.g. 'null input' where irrelevant)\n")
	sb.WriteString("  0.4 — Identified some cases but missed the most important one(s) for this problem\n")
	sb.WriteString("  0.6 — Identified the key cases but described them imprecisely or missed a minor one\n")
	sb.WriteString("  0.8 — Identified all key cases correctly, minor wording imprecision\n")
	sb.WriteString("  1.0 — Identified all key cases clearly and correctly\n\n")
	sb.WriteString("**tc_sc** — both time and space complexity with explanation:\n")
	sb.WriteString("  0.0 — Both wrong\n")
	sb.WriteString("  0.5 — One correct, one wrong\n")
	sb.WriteString("  0.7 — Both correct, explanation vague or incomplete\n")
	sb.WriteString("  1.0 — Both correct with clear reasoning (e.g. 'O(n) because we iterate once, O(1) because no extra space')\n\n")
	sb.WriteString("**Reveal cap:** If the interviewer stated an answer directly (not a Socratic question, but an outright explanation or reveal) without the user requesting it, cap that stage's score at 0.2 regardless of the user's response.\n\n")
	sb.WriteString("**Hint cap:** If you see '[USER REQUESTED HINT]' in the user's message for a stage, the score for that stage cannot exceed 0.6. For tc_sc, use 0.5 as the effective cap (the nearest valid anchor).\n\n")
	sb.WriteString("**Answer cap:** If you see '[USER REQUESTED ANSWER]' in the user's message for a stage, the score for that stage cannot exceed 0.2.\n\n")
	sb.WriteString("Calibration: most sessions should score in the 0.2–0.6 range. Reserve 0.8–1.0 for genuinely strong, unprompted answers.\n\n")
	sb.WriteString("CRITICAL: Return ONLY this JSON — no explanation, no markdown, no text before or after:\n")
	sb.WriteString(`{"scores": [{"topic": "Dynamic Programming", "stage": "pattern", "score": 0.8}]}`)
	sb.WriteString("\n\nOnly use topics from the problem's tags list. Only use stages from the active stages list.")

	return sb.String()
}

// BuildEvaluationUserPrompt returns the per-session dynamic content: problem
// metadata and the full conversation history. Passed as the user message.
func BuildEvaluationUserPrompt(problem models.Problem, activeStages []string, history []ChatMessage) string {
	var sb strings.Builder

	fmt.Fprintf(&sb, "Problem: %s\n", problem.Title)
	fmt.Fprintf(&sb, "Problem tags: %s\n", strings.Join(problem.TopicTags, ", "))
	fmt.Fprintf(&sb, "Active stages practiced: %s\n\n", strings.Join(activeStages, ", "))

	sb.WriteString("Full conversation (note: 'assistant' turns are interviewer coaching prompts, not candidate answers — only score the candidate's own words in 'user' turns):\n")
	for _, msg := range history {
		content := msg.Content
		switch msg.Marker {
		case "hint":
			content = "[USER REQUESTED HINT]\n" + content
		case "answer":
			content = "[USER REQUESTED ANSWER]\n" + content
		}
		fmt.Fprintf(&sb, "%s: %s\n", msg.Role, content)
	}

	return sb.String()
}

// BuildEvaluationPrompt concatenates system + user content into a single string.
// Used by Ollama (no caching support) and existing tests.
func BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage) string {
	return BuildEvaluationSystemPrompt() + "\n\n" + BuildEvaluationUserPrompt(problem, activeStages, history)
}
```

- [ ] **Step 4: Run all llm tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go test ./internal/llm/... -v
```

Expected: all tests PASS (new + existing)

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/llm/evaluation.go internal/llm/evaluation_test.go
git commit -m "feat: split BuildEvaluationPrompt into system and user parts for prompt caching"
```

---

### Task 4: Use cached system in `claude/evaluate.go` `EvaluateSession`

**Files:**
- Modify: `backend/internal/claude/evaluate.go`

- [ ] **Step 1: Update `EvaluateSession` to use a cached system block**

Replace the `body` construction in `EvaluateSession` (the entire `body` map and the `prompt` variable line that precedes it):

```go
// Before:
prompt := llm.BuildEvaluationPrompt(problem, activeStages, history)

body := map[string]any{
    "model":      c.model,
    "max_tokens": 1024,
    "stream":     false,
    "messages": []map[string]string{
        {"role": "user", "content": prompt},
    },
}
```

With:

```go
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
```

- [ ] **Step 2: Build to verify no compile errors**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go build ./...
```

Expected: no output (success)

- [ ] **Step 3: Run all tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend
go test ./... 
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/claude/evaluate.go
git commit -m "feat: add prompt caching to EvaluateSession via system block"
```
