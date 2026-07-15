package postgres

import (
	"context"
	"errors"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var defaultActiveStages = []string{"pattern", "algorithm", "tc_sc"}

var defaultActiveTopics = []string{
	"Array", "Hash Table", "Two Pointers", "Sliding Window",
	"Stack", "Binary Search", "Linked List",
	"Tree", "Binary Tree", "Binary Search Tree",
	"Trie", "Heap (Priority Queue)", "Backtracking",
	"Graph", "Depth-First Search", "Breadth-First Search", "Union Find",
	"Dynamic Programming", "Greedy", "Intervals", "Math", "Bit Manipulation",
	"Matrix",
}

// resolveActiveTopics returns the stored topics if non-empty, or the NeetCode defaults.
func resolveActiveTopics(stored []string) []string {
	if len(stored) > 0 {
		return stored
	}
	return defaultActiveTopics
}

// defaultUserSettings is the settings profile for users with no stored row.
func defaultUserSettings(userID uuid.UUID) models.UserSettings {
	return models.UserSettings{
		UserID:         userID,
		ActiveStages:   defaultActiveStages,
		HideTitle:      true,
		HideDifficulty: true,
		ConciseMode:    true,
		ActiveTopics:   defaultActiveTopics,
		TourDone:       false,
	}
}

func (p *Postgres) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	const sql = `SELECT user_id, active_stages, hide_title, hide_difficulty, concise_mode, active_topics, tour_done FROM user_settings WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (models.UserSettings, error) {
		row, err := p.Pool.Query(ctx, sql, userID)
		if err != nil {
			return models.UserSettings{}, err
		}
		s, err := pgx.CollectOneRow(row, pgx.RowToStructByName[models.UserSettings])
		if errors.Is(err, pgx.ErrNoRows) {
			return defaultUserSettings(userID), nil
		}
		if err != nil {
			return models.UserSettings{}, err
		}
		s.ActiveTopics = resolveActiveTopics(s.ActiveTopics)
		return s, nil
	})
}

func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, conciseMode bool, activeTopics []string, tourDone bool) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages, hide_title, hide_difficulty, concise_mode, active_topics, tour_done)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id) DO UPDATE
		SET active_stages   = EXCLUDED.active_stages,
		    hide_title      = EXCLUDED.hide_title,
		    hide_difficulty = EXCLUDED.hide_difficulty,
		    concise_mode    = EXCLUDED.concise_mode,
		    active_topics   = EXCLUDED.active_topics,
		    tour_done       = EXCLUDED.tour_done
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages, hideTitle, hideDifficulty, conciseMode, activeTopics, tourDone)
		return struct{}{}, err
	})
	return err
}
