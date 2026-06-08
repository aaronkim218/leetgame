package server

import (
	"log/slog"
	"strings"

	"leetgame/internal/evaluation"
	"leetgame/internal/handlers"
	"leetgame/internal/llm"
	"leetgame/internal/storage"
	"leetgame/internal/xerrors"

	go_json "github.com/goccy/go-json"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/golang-jwt/jwt/v5"
)

type Config struct {
	Storage        storage.Storage
	Logger         *slog.Logger
	LLMClient      llm.Client
	AllowedOrigins string
	Keyfunc        jwt.Keyfunc
	Dispatcher     evaluation.EvaluationDispatcher
}

func New(cfg *Config) *fiber.App {
	app := fiber.New(fiber.Config{
		JSONEncoder:  go_json.Marshal,
		JSONDecoder:  go_json.Unmarshal,
		ErrorHandler: xerrors.ErrorHandler,
	})

	app.Use(logger.New())
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: strings.Split(cfg.AllowedOrigins, ","),
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
	}))

	service := handlers.NewService(&handlers.HandlerServiceConfig{
		Storage:    cfg.Storage,
		Logger:     cfg.Logger,
		LLMClient:  cfg.LLMClient,
		Keyfunc:    cfg.Keyfunc,
		Dispatcher: cfg.Dispatcher,
	})
	service.RegisterRoutes(app)

	return app
}
