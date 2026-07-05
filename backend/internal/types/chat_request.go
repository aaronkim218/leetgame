package types

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"leetgame/internal/constants"
)

type HistoryMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Marker  string `json:"marker,omitempty"`
}

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

func (r ChatRequest) Validate() map[string]string {
	errs := map[string]string{}

	if r.HintRequested && r.AnswerRequested {
		errs["hint_requested"] = "cannot be true when answer_requested is also true"
	}

	if r.ProblemID == uuid.Nil {
		errs["problem_id"] = "required"
	}

	if strings.TrimSpace(r.Message) == "" {
		errs["message"] = "required"
	}

	validMarkers := map[string]bool{"": true, "hint": true, "answer": true}
	for i, msg := range r.History {
		if !validMarkers[msg.Marker] {
			errs[fmt.Sprintf("history[%d].marker", i)] = "must be 'hint', 'answer', or omitted"
		}
	}

	if len(r.ActiveStages) == 0 {
		errs["active_stages"] = "must contain at least one stage"
	} else {
		seen := map[string]bool{}
		prevIdx := -1
		stageInActive := false
		for _, s := range r.ActiveStages {
			if !constants.ValidStageIDs[s] {
				errs["active_stages"] = "invalid stage: " + s
				break
			}
			if seen[s] {
				errs["active_stages"] = "duplicate stage: " + s
				break
			}
			seen[s] = true
			idx := constants.CanonicalStageIndex(s)
			if idx <= prevIdx {
				errs["active_stages"] = "stages must be in canonical order: edge_cases, brute_force, pattern, algorithm, tc_sc"
				break
			}
			prevIdx = idx
			if s == r.Stage {
				stageInActive = true
			}
		}
		if _, hasErr := errs["active_stages"]; !hasErr {
			if !constants.ValidStageIDs[r.Stage] {
				errs["stage"] = "invalid stage"
			} else if !stageInActive {
				errs["stage"] = "must be one of active_stages"
			}
		}
	}

	validRoles := map[string]bool{"user": true, "assistant": true}
	for i, msg := range r.History {
		if !validRoles[msg.Role] {
			errs[fmt.Sprintf("history[%d].role", i)] = "must be 'user' or 'assistant'"
		}
	}

	return errs
}
