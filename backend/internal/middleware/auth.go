package middleware

import (
	"strings"

	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func RequireAuth(kf jwt.Keyfunc) fiber.Handler {
	return func(c fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return xerrors.UnauthorizedError()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, kf)
		if err != nil || !token.Valid {
			return xerrors.UnauthorizedError()
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		sub, ok := claims["sub"].(string)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return xerrors.UnauthorizedError()
		}

		xcontext.SetUserID(c, uid)
		return c.Next()
	}
}

// OptionalAuth sets the user ID in context if a valid JWT is present, but does not
// block unauthenticated requests. A nil keyfunc disables verification entirely (passthrough).
func OptionalAuth(kf jwt.Keyfunc) fiber.Handler {
	return func(c fiber.Ctx) error {
		if kf == nil {
			return c.Next()
		}

		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return c.Next()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, kf)
		if err != nil || !token.Valid {
			return c.Next()
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Next()
		}
		sub, ok := claims["sub"].(string)
		if !ok {
			return c.Next()
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return c.Next()
		}

		xcontext.SetUserID(c, uid)
		return c.Next()
	}
}
