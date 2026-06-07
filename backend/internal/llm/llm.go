package llm

import (
	"context"
	"fmt"
	"strings"

	"leetgame/internal/models"
)

type stageDesc struct {
	label    string
	criteria string
	guidance string
}

var stageDescriptions = map[string]stageDesc{
	"edge_cases": {
		label:    "Edge Cases",
		criteria: "The candidate identifies key edge cases and boundary conditions for this problem (e.g. empty input, single element, duplicates, overflow).",
		guidance: "If incomplete: ask ONE Socratic question about a specific edge case they missed. Never enumerate all edge cases.",
	},
	"brute_force": {
		label:    "Brute Force",
		criteria: "The candidate describes a working naive solution, even if inefficient.",
		guidance: "If incorrect or too vague: ask ONE focused question to guide them toward a valid brute force approach.",
	},
	"pattern": {
		label:    "Optimal Pattern",
		criteria: "The candidate names the correct algorithm pattern (e.g. backtracking, sliding window, dynamic programming) AND explains in their own words why that pattern fits this specific problem. Knowing the name alone is not enough — they must articulate the reasoning.",
		guidance: "If they name the pattern but do not explain why it fits: ask them to explain the reasoning. Do not confirm correctness and then explain it yourself. If incorrect or too vague: ask ONE Socratic question. Never reveal the pattern. IMPORTANT: Do NOT ask about implementation details, code structure, or iteration — that is the algorithm stage's job, not this one.",
	},
	"algorithm": {
		label:    "Optimal Algorithm",
		criteria: "The candidate describes a correct and efficient algorithm that solves the problem optimally, including key implementation steps.",
		guidance: "If correct but high-level: ask them to walk through the steps in detail. Do not summarize or elaborate on their answer. If incorrect or incomplete: ask ONE focused Socratic question. Never reveal the answer.",
	},
	"tc_sc": {
		label:    "Time & Space Complexity",
		criteria: "The candidate correctly states both time complexity and space complexity.",
		guidance: "If incorrect: ask ONE focused guiding question about the complexity.",
	},
}

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
		sb.WriteString("\n\nThe user has clicked 'Give me the answer'. Reveal the correct answer for the current stage clearly and completely. You may use markdown inside the \"message\" value (bold, bullet lists, inline code). CRITICAL: your response must still be the exact same JSON format — no code fences, no pretty-printing, no extra fields.")
	}

	return sb.String()
}

// BuildSystemPrompt concatenates the stable and volatile parts.
// Used by Ollama (which does not support caching) and existing tests.
func BuildSystemPrompt(title, description, stage string, activeStages []string, hintRequested, answerRequested bool) string {
	return BuildStableSystemPrompt(title, description, activeStages) + "\n\n" + BuildVolatileSystemSuffix(stage, hintRequested, answerRequested)
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Marker  string `json:"marker,omitempty"` // "hint" | "answer" | ""
}

type EvaluateResponse struct {
	Message string `json:"message"`
	Stage   string `json:"stage"`
}

type Client interface {
	Evaluate(ctx context.Context, problem models.Problem, stage string, activeStages []string, history []ChatMessage, userMessage string, hintRequested, answerRequested bool, onToken func(string)) (EvaluateResponse, error)
	EvaluateSession(ctx context.Context, problem models.Problem, activeStages []string, history []ChatMessage) (SessionEvaluation, error)
}
