package evaluation

import (
	"context"
	"fmt"
	"log/slog"

	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
)

// EvaluationDispatcher dispatches session evaluation work after a session completes.
// Implementations: GoroutineDispatcher (direct), KafkaDispatcher (via Kafka topic).
type EvaluationDispatcher interface {
	Dispatch(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool)
}

// RunSession runs session evaluation and logs any error. Used by GoroutineDispatcher.
func RunSession(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) {
	if err := RunSessionWithError(ctx, store, llmClient, logger, userID, problem, activeStages, history, concise); err != nil {
		logger.Error(
			"session evaluation failed",
			"error", err,
			"user_id", userID,
			"problem_id", problem.Id,
			"problem_title", problem.Title,
		)
	}
}

// RunSessionWithError runs session evaluation and returns the first error encountered.
// Used by the Kafka consumer so it can decide whether to retry.
func RunSessionWithError(ctx context.Context, store storage.Storage, llmClient llm.Client, logger *slog.Logger, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage, concise bool) error {
	logger.Info(
		"starting session evaluation",
		"user_id", userID,
		"problem_id", problem.Id,
		"problem_title", problem.Title,
		"active_stages", activeStages,
	)

	eval, err := llmClient.EvaluateSession(ctx, problem, activeStages, history, concise)
	if err != nil {
		return fmt.Errorf("EvaluateSession failed: %w", err)
	}

	type difficultyParams struct{ scale, floor float64 }
	params := map[string]difficultyParams{
		"Easy": {0.15, 0.03},
		"Hard": {0.35, 0.07},
	}
	dp, ok := params[problem.Difficulty]
	if !ok {
		dp = difficultyParams{0.25, 0.05} // Medium + unknown
	}

	var updated int
	for _, score := range eval.Scores {
		if score.Score < 0 || score.Score > 1 {
			logger.Warn(
				"skipping out-of-range score from LLM",
				"topic", score.Topic,
				"stage", score.Stage,
				"score", score.Score,
			)
			continue
		}
		if err := store.UpsertTopicProficiency(ctx, userID, problem.Id, score.Topic, score.Stage, score.Score, dp.scale, dp.floor); err != nil {
			return fmt.Errorf("UpsertTopicProficiency failed: %w", err)
		}
		updated++
	}

	logger.Info(
		"session evaluation complete",
		"user_id", userID,
		"problem_title", problem.Title,
		"topics_updated", updated,
	)
	return nil
}
