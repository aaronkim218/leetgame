package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

var trendWindowDays = map[string]int{
	"1m":  30,
	"3m":  90,
	"6m":  180,
	"1y":  365,
	"all": 0,
}

func parseTrendWindow(s string) (int, error) {
	if s == "" {
		s = "1m"
	}
	days, ok := trendWindowDays[s]
	if !ok {
		return 0, xerrors.BadRequestError("window must be one of 1m, 3m, 6m, 1y, all")
	}
	return days, nil
}

func (hs *HandlerService) GetProficiencyHistory(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	days, err := parseTrendWindow(c.Query("window"))
	if err != nil {
		return err
	}

	snapshots, err := hs.storage.GetProficiencyHistory(c.RequestCtx(), uid, days)
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
