package llm

import (
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

// BuildEvaluationSystemPrompt returns the static scoring rubric used as a
// cacheable system prompt for session evaluation. There are exactly two
// variants — strict and concise — each constant across calls.
func BuildEvaluationSystemPrompt(concise bool) string {
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
	if concise {
		sb.WriteString("This session used concise mode: the candidate was asked for brief answers. Score brief-but-correct reasoning as well-reasoned (0.8). Do not penalize brevity — only penalize incorrectness or absence of reasoning.\n\n")
	}
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
func BuildEvaluationPrompt(problem models.Problem, activeStages []string, history []ChatMessage, concise bool) string {
	return BuildEvaluationSystemPrompt(concise) + "\n\n" + BuildEvaluationUserPrompt(problem, activeStages, history)
}
