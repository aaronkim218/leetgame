package llm

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"leetgame/internal/models"
)

func TestBuildEvaluationPrompt(t *testing.T) {
	problem := models.Problem{
		Id:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:       "Two Sum",
		Description: "Given an array...",
		TopicTags:   []string{"Array", "Hash Table"},
	}
	activeStages := []string{"pattern", "tc_sc"}
	history := []ChatMessage{
		{Role: "user", Content: "I think we use a hash map"},
		{Role: "assistant", Content: "Good, can you explain why?"},
		{Role: "user", Content: "To achieve O(n) lookup"},
	}

	prompt := BuildEvaluationPrompt(problem, activeStages, history, false)

	checks := []struct {
		name    string
		contain string
	}{
		{"contains problem title", "Two Sum"},
		{"contains topic tags", "Array"},
		{"contains topic tags 2", "Hash Table"},
		{"contains active stages", "pattern"},
		{"contains active stages 2", "tc_sc"},
		{"contains user message", "I think we use a hash map"},
		{"contains assistant message", "Good, can you explain why?"},
		{"contains second user message", "To achieve O(n) lookup"},
		{"contains JSON instruction", `"scores"`},
		{"contains pattern rubric anchor 0.2", "Vague or surface answer with no real substance"},
		{"contains pattern rubric anchor 1.0", "Thorough and accurate with clear reasoning"},
		{"contains edge_cases rubric anchor 0.0", "Identified no relevant edge cases"},
		{"contains edge_cases rubric anchor 0.4", "missed the most important one"},
		{"contains tc_sc rubric anchor 0.5", "One correct, one wrong"},
		{"contains tc_sc rubric anchor 0.7", "Both correct, explanation vague"},
		{"contains reveal cap instruction", "cap that stage's score at 0.2 regardless"},
		{"contains hint cap instruction", "USER REQUESTED HINT"},
		{"contains answer cap instruction", "USER REQUESTED ANSWER"},
		{"contains tc_sc hint cap note", "nearest valid anchor"},
		{"contains calibration note", "most sessions should score in the 0.2"},
	}

	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			if !strings.Contains(prompt, c.contain) {
				t.Errorf("prompt missing %q", c.contain)
			}
		})
	}
}

func TestBuildEvaluationPrompt_MarkerInjectedIntoHistory(t *testing.T) {
	problem := models.Problem{
		Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:     "Two Sum",
		TopicTags: []string{"Array"},
	}
	history := []ChatMessage{
		{Role: "user", Content: "I think hash map", Marker: "hint"},
		{Role: "assistant", Content: "Good, explain why"},
		{Role: "user", Content: "To get O(n)", Marker: "answer"},
	}
	prompt := BuildEvaluationPrompt(problem, []string{"pattern"}, history, false)

	if !strings.Contains(prompt, "[USER REQUESTED HINT]\nI think hash map") {
		t.Error("expected hint marker injected before hint message content")
	}
	if !strings.Contains(prompt, "[USER REQUESTED ANSWER]\nTo get O(n)") {
		t.Error("expected answer marker injected before answer message content")
	}
	if !strings.Contains(prompt, "assistant: Good, explain why") {
		t.Error("expected assistant message without marker")
	}
}

func TestBuildEvaluationPrompt_EmptyHistory(t *testing.T) {
	problem := models.Problem{
		Id:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Title:     "Test",
		TopicTags: []string{"Array"},
	}
	// Should not panic
	prompt := BuildEvaluationPrompt(problem, []string{"pattern"}, nil, false)
	if !strings.Contains(prompt, "Test") {
		t.Error("prompt missing problem title")
	}
}

func TestBuildEvaluationSystemPrompt_contains_rubric_anchors(t *testing.T) {
	system := BuildEvaluationSystemPrompt(false)

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
	system := BuildEvaluationSystemPrompt(false)
	if strings.Contains(system, "Two Sum") {
		t.Error("system prompt should not contain problem-specific content")
	}
	if strings.Contains(system, "Array, Hash Table") {
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
