package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

func (hs *HandlerService) RecordStreak(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	if err := hs.storage.UpsertPracticeDay(c.RequestCtx(), uid); err != nil {
		return err
	}

	info, err := hs.storage.GetStreak(c.RequestCtx(), uid)
	if err != nil {
		return err
	}

	return c.JSON(info)
}

func (hs *HandlerService) GetStreak(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	info, err := hs.storage.GetStreak(c.RequestCtx(), uid)
	if err != nil {
		return err
	}

	return c.JSON(info)
}

// fiber:context-methods migrated
