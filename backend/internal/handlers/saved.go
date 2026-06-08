package handlers

import (
	"net/http"

	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

func (hs *HandlerService) GetSavedProblems(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	problems, err := hs.storage.GetSavedProblems(c.RequestCtx(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}

func (hs *HandlerService) SaveProblem(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	problemID, err := uuid.Parse(c.Params("problem_id"))
	if err != nil {
		return xerrors.BadRequestError("invalid problem_id")
	}
	if err := hs.storage.SaveProblem(c.RequestCtx(), uid, problemID); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

func (hs *HandlerService) UnsaveProblem(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	problemID, err := uuid.Parse(c.Params("problem_id"))
	if err != nil {
		return xerrors.BadRequestError("invalid problem_id")
	}
	if err := hs.storage.UnsaveProblem(c.RequestCtx(), uid, problemID); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

// fiber:context-methods migrated
