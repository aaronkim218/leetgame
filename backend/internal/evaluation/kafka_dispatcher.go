package evaluation

import (
	"context"
	"log/slog"

	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
)

// SessionPublisher is implemented by *kafka.Producer.
type SessionPublisher interface {
	PublishSessionCompleted(ctx context.Context, event kafka.SessionCompletedEvent) error
}

type KafkaDispatcher struct {
	publisher SessionPublisher
	fallback  func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool)
	logger    *slog.Logger
}

func NewKafkaDispatcher(publisher SessionPublisher, fallback func(context.Context, uuid.UUID, models.Problem, []string, []llm.ChatMessage, bool), logger *slog.Logger) *KafkaDispatcher {
	return &KafkaDispatcher{publisher: publisher, fallback: fallback, logger: logger}
}

func (d *KafkaDispatcher) Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	event := kafka.SessionCompletedEvent{
		UserID:       userID,
		Problem:      problem,
		ActiveStages: activeStages,
		History:      history,
		Concise:      concise,
	}
	if err := d.publisher.PublishSessionCompleted(ctx, event); err != nil {
		d.logger.Error("kafka publish failed, falling back to inline evaluation", "error", err)
		d.fallback(ctx, userID, problem, activeStages, history, concise)
	}
}
