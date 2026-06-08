package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	squirrel "github.com/Masterminds/squirrel"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func applyProblemSearchFilters(sb squirrel.SelectBuilder, q string, difficulties []string, tags []string, tagMatch, excludeID string) squirrel.SelectBuilder {
	sb = sb.From("problems").PlaceholderFormat(squirrel.Dollar)

	if q != "" {
		sb = sb.Where(squirrel.ILike{"title": "%" + q + "%"})
	}
	if len(difficulties) > 0 {
		sb = sb.Where(squirrel.Eq{"difficulty": difficulties})
	}
	if excludeID != "" {
		sb = sb.Where(squirrel.NotEq{"id": excludeID})
	}
	if len(tags) > 0 {
		switch tagMatch {
		case "or":
			ors := squirrel.Or{}
			for _, tag := range tags {
				trimmedTag := strings.TrimSpace(tag)
				if trimmedTag != "" {
					ors = append(ors, squirrel.Expr("? = ANY(topic_tags)", trimmedTag))
				}
			}
			if len(ors) > 0 {
				sb = sb.Where(ors)
			}
		default:
			for _, tag := range tags {
				trimmedTag := strings.TrimSpace(tag)
				if trimmedTag != "" {
					sb = sb.Where("? = ANY(topic_tags)", trimmedTag)
				}
			}
		}
	}

	return sb
}

func (p *Postgres) GetRandomProblem(ctx context.Context) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
		FROM problems
		ORDER BY RANDOM()
		LIMIT 1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{}),
				)
			}
			return models.Problem{}, err
		}
		return problem, nil
	})
}

func (p *Postgres) GetRandomProblemFiltered(ctx context.Context, q string, difficulties []string, tags []string, tagMatch, excludeID string) (models.Problem, error) {
	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		sql, args, err := applyProblemSearchFilters(
			squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
			q,
			difficulties,
			tags,
			tagMatch,
			excludeID,
		).
			OrderBy("RANDOM()").
			Limit(1).
			ToSql()
		if err != nil {
			return models.Problem{}, utils.CreateNonRetryableError(fmt.Errorf("failed to build random search query: %w", err))
		}

		rows, err := p.Pool.Query(ctx, sql, args...)
		if err != nil {
			return models.Problem{}, err
		}

		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{}),
				)
			}
			return models.Problem{}, err
		}

		return problem, nil
	})
}

func (p *Postgres) GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
		FROM problems
		WHERE id = $1`

	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q, id)
		if err != nil {
			return models.Problem{}, err
		}
		problem, err := pgx.CollectOneRow(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return models.Problem{}, utils.CreateNonRetryableError(
					xerrors.NotFoundError("problem", map[string]string{"id": id.String()}),
				)
			}
			return models.Problem{}, err
		}
		return problem, nil
	})
}

func (p *Postgres) SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error) {
	return utils.Retry(ctx, func(ctx context.Context) (types.ProblemSearchResponse, error) {
		countSQL, countArgs, err := applyProblemSearchFilters(
			squirrel.Select("COUNT(*)"),
			q,
			difficulties,
			tags,
			tagMatch,
			"",
		).
			ToSql()
		if err != nil {
			return types.ProblemSearchResponse{}, utils.CreateNonRetryableError(fmt.Errorf("failed to build count query: %w", err))
		}

		var total int
		if err := p.Pool.QueryRow(ctx, countSQL, countArgs...).Scan(&total); err != nil {
			return types.ProblemSearchResponse{}, err
		}

		sql, args, err := applyProblemSearchFilters(
			squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
			q,
			difficulties,
			tags,
			tagMatch,
			"",
		).
			OrderBy("leetcode_id ASC NULLS LAST").
			Limit(uint64(pageSize)).
			Offset(uint64((page - 1) * pageSize)).
			ToSql()
		if err != nil {
			return types.ProblemSearchResponse{}, utils.CreateNonRetryableError(fmt.Errorf("failed to build search query: %w", err))
		}

		rows, err := p.Pool.Query(ctx, sql, args...)
		if err != nil {
			return types.ProblemSearchResponse{}, err
		}

		problems, err := pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
		if err != nil {
			return types.ProblemSearchResponse{}, err
		}

		return types.ProblemSearchResponse{
			Problems: problems,
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		}, nil
	})
}

func (p *Postgres) GetAllProblems(ctx context.Context) ([]models.Problem, error) {
	const q = `
		SELECT id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at
		FROM problems
		ORDER BY leetcode_id ASC NULLS LAST`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
	})
}

func (p *Postgres) GetProblemTags(ctx context.Context) ([]types.ProblemTag, error) {
	const q = `
		SELECT tag AS name, COUNT(*)::INT AS count
		FROM problems, UNNEST(topic_tags) AS tag
		GROUP BY tag
		ORDER BY tag ASC`

	return utils.Retry(ctx, func(ctx context.Context) ([]types.ProblemTag, error) {
		rows, err := p.Pool.Query(ctx, q)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[types.ProblemTag])
	})
}
