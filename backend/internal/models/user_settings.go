package models

import "github.com/google/uuid"

type UserSettings struct {
	UserID         uuid.UUID `json:"user_id"          db:"user_id"`
	ActiveStages   []string  `json:"active_stages"    db:"active_stages"`
	HideTitle      bool      `json:"hide_title"       db:"hide_title"`
	HideDifficulty bool      `json:"hide_difficulty"  db:"hide_difficulty"`
	ActiveTopics   []string  `json:"active_topics"    db:"active_topics"`
	TourDone       bool      `json:"tour_done"        db:"tour_done"`
}
