package evaluation

import (
	"context"
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
)

type GoroutineDispatcher struct {
	store     storage.Storage
	llmClient llm.Client
	logger    *slog.Logger
}

func NewGoroutineDispatcher(store storage.Storage, llmClient llm.Client, logger *slog.Logger) *GoroutineDispatcher {
	return &GoroutineDispatcher{store: store, llmClient: llmClient, logger: logger}
}

func (d *GoroutineDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	RunSession(ctx, d.store, d.llmClient, d.logger, userID, problem, activeStages, history, concise)
}

var _ EvaluationDispatcher = (*GoroutineDispatcher)(nil)
