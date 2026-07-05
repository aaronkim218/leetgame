package kafka

import (
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
)

type SessionCompletedEvent struct {
	UserID       uuid.UUID         `json:"user_id"`
	Problem      models.Problem    `json:"problem"`
	ActiveStages []string          `json:"active_stages"`
	History      []llm.ChatMessage `json:"history"`
	Concise      bool              `json:"concise"`
}
