package llm_test

import (
	"strings"
	"testing"

	"leetgame/internal/llm"
)

func TestBuildSystemPrompt_contains_current_stage(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false)
	if !strings.Contains(prompt, `"pattern"`) {
		t.Error("expected prompt to contain current stage")
	}
}

func TestBuildSystemPrompt_contains_problem_title(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "algorithm", "tc_sc"}, false, false)
	if !strings.Contains(prompt, "Two Sum") {
		t.Error("expected prompt to contain problem title")
	}
}

func TestBuildSystemPrompt_lists_only_active_stages(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern", "tc_sc"}, false, false)
	if !strings.Contains(prompt, "Optimal Pattern") {
		t.Error("expected prompt to contain active stage 'pattern'")
	}
	if !strings.Contains(prompt, "Time & Space Complexity") {
		t.Error("expected prompt to contain active stage 'tc_sc'")
	}
	if strings.Contains(prompt, "Brute Force") {
		t.Error("expected prompt to NOT contain inactive stage 'brute_force'")
	}
}

func TestBuildSystemPrompt_success_stage_is_complete_for_last(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "tc_sc", []string{"pattern", "tc_sc"}, false, false)
	if !strings.Contains(prompt, `"complete"`) {
		t.Error("expected prompt to indicate 'complete' as success for last stage")
	}
}

func TestBuildSystemPrompt_empty_active_stages_does_not_panic(t *testing.T) {
	// Should not panic even with empty stages — returns a minimal prompt
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{}, false, false)
	if prompt == "" {
		t.Error("expected non-empty prompt even with no active stages")
	}
}

func TestBuildSystemPrompt_hint_requested(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern"}, true, false)
	if !strings.Contains(prompt, "Give a targeted hint") {
		t.Error("expected hint instruction in prompt when hintRequested=true")
	}
}

func TestBuildSystemPrompt_answer_requested(t *testing.T) {
	prompt := llm.BuildSystemPrompt("Two Sum", "Given an array...", "pattern", []string{"pattern"}, false, true)
	if !strings.Contains(prompt, "Reveal the correct answer") {
		t.Error("expected answer instruction in prompt when answerRequested=true")
	}
}

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
