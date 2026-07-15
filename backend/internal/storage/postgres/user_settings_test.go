package postgres

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"

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

func TestDefaultUserSettings(t *testing.T) {
	uid := uuid.New()
	defaults := defaultUserSettings(uid)
	if defaults.UserID != uid {
		t.Error("default settings must carry the requested user ID")
	}
	if !defaults.HideTitle {
		t.Error("default HideTitle must be true")
	}
	if !defaults.HideDifficulty {
		t.Error("default HideDifficulty must be true")
	}
	if !defaults.ConciseMode {
		t.Error("default ConciseMode must be true")
	}
	if defaults.TourDone {
		t.Error("default TourDone must be false")
	}
	if len(defaults.ActiveStages) == 0 || len(defaults.ActiveTopics) == 0 {
		t.Error("default stages and topics must be non-empty")
	}
}

func TestUserSettings_ConciseModeJSONTag(t *testing.T) {
	b, err := json.Marshal(models.UserSettings{ConciseMode: true})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(b), `"concise_mode":true`) {
		t.Errorf("expected concise_mode json tag, got %s", b)
	}
}
