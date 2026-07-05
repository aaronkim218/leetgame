package storage

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

type Storage interface {
	Ping(ctx context.Context) error

	// problems
	GetAllProblems(ctx context.Context) ([]models.Problem, error)
	GetRandomProblem(ctx context.Context) (models.Problem, error)
	GetRandomProblemFiltered(ctx context.Context, q string, difficulties []string, tags []string, tagMatch, excludeID string) (models.Problem, error)
	GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error)
	SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)
	GetProblemTags(ctx context.Context) ([]types.ProblemTag, error)

	// streaks
	UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error
	GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error)

	// settings
	GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error)
	UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, conciseMode bool, activeTopics []string, tourDone bool) error

	// saved problems
	SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error
	UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error
	GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error)

	// topic proficiency
	UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error
	GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error)
	GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error)
}
