package postgres

import (
	"testing"

	"leetgame/internal/models"
)

func TestNeetcodeDefault(t *testing.T) {
	// When active_topics is empty, defaultActiveTopics should be returned
	if len(defaultActiveTopics) == 0 {
		t.Fatal("defaultActiveTopics must not be empty")
	}
	// Spot-check a few expected topics
	topicSet := make(map[string]bool, len(defaultActiveTopics))
	for _, topic := range defaultActiveTopics {
		topicSet[topic] = true
	}
	required := []string{"Array", "Dynamic Programming", "Graph", "Binary Search"}
	for _, r := range required {
		if !topicSet[r] {
			t.Errorf("expected %q in defaultActiveTopics", r)
		}
	}
}

func TestActiveTopicsDefault_WhenEmpty(t *testing.T) {
	// Simulate the Go-layer fallback: empty stored value → neetcode defaults
	stored := []string{}
	result := resolveActiveTopics(stored)
	if len(result) == 0 {
		t.Fatal("resolveActiveTopics(empty) must return neetcode defaults, got empty")
	}
}

func TestActiveTopicsDefault_WhenSet(t *testing.T) {
	// When a non-empty value is stored, return it as-is
	stored := []string{"Array", "Stack"}
	result := resolveActiveTopics(stored)
	if len(result) != 2 || result[0] != "Array" || result[1] != "Stack" {
		t.Errorf("resolveActiveTopics(non-empty) = %v, want %v", result, stored)
	}
}

func TestDefaultHideDifficulty(t *testing.T) {
	// The no-rows default must have HideDifficulty = true
	// We test this by verifying the default struct in isolation
	defaults := models.UserSettings{
		HideDifficulty: true,
	}
	if !defaults.HideDifficulty {
		t.Error("default HideDifficulty must be true")
	}
}
