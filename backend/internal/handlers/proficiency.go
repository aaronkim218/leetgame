package handlers

import (
	"leetgame/internal/xcontext"

	"github.com/gofiber/fiber/v3"
)

func (hs *HandlerService) GetProficiencyHistory(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	snapshots, err := hs.storage.GetProficiencyHistory(c.RequestCtx(), uid)
	if err != nil {
		return err
	}

	type snapshotResponse struct {
		Topic        string  `json:"topic"`
		Stage        string  `json:"stage"`
		Score        float64 `json:"score"`
		SnapshotDate string  `json:"snapshot_date"`
	}

	resp := make([]snapshotResponse, len(snapshots))
	for i, s := range snapshots {
		resp[i] = snapshotResponse{
			Topic:        s.Topic,
			Stage:        s.Stage,
			Score:        s.Score,
			SnapshotDate: s.SnapshotDate.Format("2006-01-02"),
		}
	}

	type response struct {
		History []snapshotResponse `json:"history"`
	}
	return c.JSON(response{History: resp})
}

// fiber:context-methods migrated
