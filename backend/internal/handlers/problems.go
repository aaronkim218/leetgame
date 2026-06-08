package handlers

import (
	"net/http"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

const (
	defaultProblemSearchPage     = 1
	defaultProblemSearchPageSize = 12
	maxProblemSearchPageSize     = 50
)

func parseProblemSearchFilters(q types.SearchQuery) (tags []string, tagMatch string, difficulties []string) {
	tagMatch = strings.ToLower(strings.TrimSpace(q.TagMatch))
	if tagMatch != "or" {
		tagMatch = "and"
	}

	if q.Tags != "" {
		for _, t := range strings.Split(q.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
	}

	if q.Difficulty != "" {
		for _, d := range strings.Split(q.Difficulty, ",") {
			if d = strings.TrimSpace(d); d != "" {
				difficulties = append(difficulties, d)
			}
		}
	}

	return tags, tagMatch, difficulties
}

func (hs *HandlerService) GetRandomProblem(c fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.Bind().Query(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	tags, tagMatch, difficulties := parseProblemSearchFilters(q)

	var (
		problem models.Problem
		err     error
	)

	if q.Q != "" || len(difficulties) > 0 || len(tags) > 0 {
		problem, err = hs.storage.GetRandomProblemFiltered(c.RequestCtx(), q.Q, difficulties, tags, tagMatch, q.ExcludeID)
	} else {
		problem, err = hs.storage.GetRandomProblem(c.RequestCtx())
	}
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProblemTags(c fiber.Ctx) error {
	tags, err := hs.storage.GetProblemTags(c.RequestCtx())
	if err != nil {
		return err
	}

	return c.Status(http.StatusOK).JSON(tags)
}

func (hs *HandlerService) GetProblems(c fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.Bind().Query(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	page := q.Page
	if page <= 0 {
		page = defaultProblemSearchPage
	}

	pageSize := q.PageSize
	switch {
	case pageSize <= 0:
		pageSize = defaultProblemSearchPageSize
	case pageSize > maxProblemSearchPageSize:
		pageSize = maxProblemSearchPageSize
	}

	tags, tagMatch, difficulties := parseProblemSearchFilters(q)

	problems, err := hs.storage.SearchProblems(c.RequestCtx(), q.Q, difficulties, tags, tagMatch, page, pageSize)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}

// fiber:context-methods migrated
