package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"leetgame/internal/claude"
	"leetgame/internal/evaluation"
	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/middleware"
	"leetgame/internal/models"
	"leetgame/internal/ollama"
	"leetgame/internal/server"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/storage/processcache"
	"leetgame/internal/utils"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Error("failed to load .env file", "error", err)
	}

	// Render sets PORT; our settings use SERVER_PORT via envPrefix.
	if port := os.Getenv("PORT"); port != "" && os.Getenv("SERVER_PORT") == "" {
		_ = os.Setenv("SERVER_PORT", port)
	}

	settings, err := settings.Load()
	if err != nil {
		slog.Error("failed to load settings", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(settings.Log.Level),
	})))

	pg := postgres.New(&postgres.Config{
		DbUrl: settings.Storage.DbUrl,
	})

	var llmClient llm.Client
	switch settings.LLM.Provider {
	case "ollama":
		llmClient = ollama.New(settings.LLM.OllamaURL, settings.LLM.Model, settings.LLM.APIKey)
	default:
		llmClient = claude.New(settings.LLM.APIKey, settings.LLM.Model)
	}

	var kf jwt.Keyfunc
	if settings.Auth.SupabaseURL != "" {
		jwks, err := middleware.NewKeyfunc(settings.Auth.SupabaseURL)
		if err != nil {
			slog.Error("failed to initialize JWKS", "error", err)
			os.Exit(1)
		}
		defer jwks.EndBackground()
		kf = jwks.Keyfunc
	}

	store := processcache.New(pg, time.Hour)

	var dispatcher evaluation.EvaluationDispatcher
	if settings.Kafka.BrokerURL != "" {
		producer, err := kafka.NewProducer(
			settings.Kafka.BrokerURL,
			settings.Kafka.Topic,
			settings.Kafka.SASLUser,
			settings.Kafka.SASLPassword,
			settings.Kafka.TLS,
		)
		if err != nil {
			slog.Error("failed to create kafka producer", "error", err)
			os.Exit(1)
		}
		defer func() {
			if err := producer.Close(); err != nil {
				slog.Error("failed to close kafka producer", "error", err)
			}
		}()
		fallback := func(ctx context.Context, userID uuid.UUID, problem models.Problem, activeStages []string, history []llm.ChatMessage) {
			evaluation.RunSession(ctx, store, llmClient, slog.Default(), userID, problem, activeStages, history)
		}
		dispatcher = evaluation.NewKafkaDispatcher(producer, fallback, slog.Default())
		slog.Info("kafka dispatcher enabled", "broker", settings.Kafka.BrokerURL, "topic", settings.Kafka.Topic)
	} else {
		dispatcher = evaluation.NewGoroutineDispatcher(store, llmClient, slog.Default())
		slog.Info("goroutine dispatcher enabled (kafka not configured)")
	}

	app := server.New(&server.Config{
		Storage: store,
		Logger: slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: utils.MustParseSlogLevel(settings.Server.LogLevel),
		})),
		LLMClient:      llmClient,
		AllowedOrigins: settings.Server.AllowedOrigins,
		Keyfunc:        kf,
		Dispatcher:     dispatcher,
	})

	go func() {
		if err := app.Listen(":" + settings.Server.Port); err != nil {
			slog.Error("failed to start server", slog.String("error", err.Error()))
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	<-quit
	slog.Info("shutting down server")

	if err := app.Shutdown(); err != nil {
		slog.Error("failed to shutdown server", slog.String("error", err.Error()))
	}

	pg.Close()
	slog.Info("server shutdown")
}
