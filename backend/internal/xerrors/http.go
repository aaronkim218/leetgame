package xerrors

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"
)

type HTTPError struct {
	StatusCode int `json:"status_code"`
	Message    any `json:"message"`
}

func (e HTTPError) Error() string {
	return fmt.Sprintf("status code: %d | message: %v", e.StatusCode, e.Message)
}

func NewHTTPError(statusCode int, err error) HTTPError {
	return HTTPError{
		StatusCode: statusCode,
		Message:    err.Error(),
	}
}

func InternalServerError() HTTPError {
	return NewHTTPError(http.StatusInternalServerError, errors.New("internal server error"))
}

func BadRequestError(message string) HTTPError {
	return NewHTTPError(http.StatusBadRequest, errors.New(message))
}

func NotFoundError(entity string, args map[string]string) HTTPError {
	var parts []string
	for k, v := range args {
		parts = append(parts, fmt.Sprintf("%s=%s", k, v))
	}
	if len(parts) == 0 {
		return NewHTTPError(http.StatusNotFound, fmt.Errorf("%s not found", entity))
	}
	return NewHTTPError(http.StatusNotFound, fmt.Errorf("%s with %s not found", entity, strings.Join(parts, ", ")))
}

func InvalidJSON() HTTPError {
	return NewHTTPError(http.StatusBadRequest, errors.New("invalid JSON request data"))
}

func UnauthorizedError() HTTPError {
	return NewHTTPError(http.StatusUnauthorized, errors.New("unauthorized"))
}

func ConflictError(entity, key, value string) HTTPError {
	return NewHTTPError(http.StatusConflict, fmt.Errorf("%s with %s=%s already exists", entity, key, value))
}

func UnprocessableEntityError(errors map[string]string) HTTPError {
	return HTTPError{
		StatusCode: http.StatusUnprocessableEntity,
		Message:    errors,
	}
}

func ErrorHandler(c fiber.Ctx, err error) error {
	var httpErr HTTPError

	switch e := err.(type) {
	case HTTPError:
		httpErr = e
	case *fiber.Error:
		httpErr = NewHTTPError(e.Code, errors.New(e.Message))
	default:
		httpErr = InternalServerError()
	}

	slog.Error(
		"error handling request",
		slog.String("method", c.Method()),
		slog.String("path", c.Path()),
		slog.String("error", err.Error()),
	)

	return c.Status(httpErr.StatusCode).JSON(httpErr)
}
