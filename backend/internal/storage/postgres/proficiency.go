package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error {
	const q = `
		WITH dedup AS (
			INSERT INTO proficiency_sessions (user_id, problem_id, topic, stage, session_date)
			VALUES ($1, $7, $2, $3, CURRENT_DATE)
			ON CONFLICT (user_id, problem_id, topic, stage, session_date) DO NOTHING
			RETURNING 1
		)
		INSERT INTO topic_proficiency (user_id, topic, stage, score, session_count, updated_at)
		SELECT $1, $2, $3, $4, 1, NOW()
		FROM dedup
		ON CONFLICT (user_id, topic, stage) DO UPDATE
		SET score         = topic_proficiency.score + GREATEST($5, $6 / sqrt(topic_proficiency.session_count::float + 1)) * ($4 - topic_proficiency.score),
		    session_count = topic_proficiency.session_count + 1,
		    updated_at    = NOW()`

	// args: $1=userID $2=topic $3=stage $4=sessionScore $5=floor $6=scale $7=problemID
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, topic, stage, sessionScore, floor, scale, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	const q = `
		SELECT user_id, topic, stage, score, session_count, updated_at
		FROM topic_proficiency
		WHERE user_id = $1
		ORDER BY topic, stage`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.TopicProficiency, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.TopicProficiency])
	})
}

func (p *Postgres) GetProficiencyHistory(ctx context.Context, userID uuid.UUID, days int) ([]models.ProficiencySnapshot, error) {
	const q = `
		SELECT topic, stage, score, snapshot_date
		FROM proficiency_score_snapshots
		WHERE user_id = $1
		  AND ($2 = 0 OR snapshot_date >= CURRENT_DATE - make_interval(days => $2))
		ORDER BY topic, stage, snapshot_date ASC`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.ProficiencySnapshot, error) {
		rows, err := p.Pool.Query(ctx, q, userID, days)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.ProficiencySnapshot])
	})
}
