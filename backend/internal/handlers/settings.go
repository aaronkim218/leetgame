package handlers

import (
	"leetgame/internal/constants"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

func (hs *HandlerService) GetSettings(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	settings, err := hs.storage.GetUserSettings(c.RequestCtx(), uid)
	if err != nil {
		return err
	}

	type response struct {
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
	}
	return c.JSON(response{
		ActiveStages:   settings.ActiveStages,
		HideTitle:      settings.HideTitle,
		HideDifficulty: settings.HideDifficulty,
		ActiveTopics:   settings.ActiveTopics,
		TourDone:       settings.TourDone,
	})
}

func (hs *HandlerService) UpdateSettings(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	type request struct {
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
	}
	var req request
	if err := c.Bind().Body(&req); err != nil {
		return xerrors.InvalidJSON()
	}

	if errs := validateActiveStages(req.ActiveStages); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}
	if len(req.ActiveTopics) == 0 {
		return xerrors.UnprocessableEntityError(map[string]string{
			"active_topics": "must contain at least one topic",
		})
	}

	if err := hs.storage.UpsertUserSettings(c.RequestCtx(), uid, req.ActiveStages, req.HideTitle, req.HideDifficulty, req.ActiveTopics, req.TourDone); err != nil {
		return err
	}

	return c.SendStatus(200)
}

func validateActiveStages(stages []string) map[string]string {
	errs := map[string]string{}
	if len(stages) == 0 {
		errs["active_stages"] = "must contain at least one stage"
		return errs
	}
	seen := map[string]bool{}
	prevIdx := -1
	for _, s := range stages {
		if !constants.ValidStageIDs[s] {
			errs["active_stages"] = "invalid stage: " + s
			return errs
		}
		if seen[s] {
			errs["active_stages"] = "duplicate stage: " + s
			return errs
		}
		seen[s] = true
		idx := constants.CanonicalStageIndex(s)
		if idx <= prevIdx {
			errs["active_stages"] = "stages must be in canonical order: edge_cases, brute_force, pattern, algorithm, tc_sc"
			return errs
		}
		prevIdx = idx
	}
	return errs
}

// fiber:context-methods migrated
