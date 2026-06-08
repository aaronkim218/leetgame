package xcontext

import (
	"fmt"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type userIDKey struct{}

func SetUserID(c fiber.Ctx, id uuid.UUID) {
	c.Locals(userIDKey{}, id)
}

func GetUserID(c fiber.Ctx) (uuid.UUID, error) {
	id, ok := c.Locals(userIDKey{}).(uuid.UUID)
	if !ok {
		return uuid.UUID{}, fmt.Errorf("user id not set in context")
	}
	return id, nil
}
