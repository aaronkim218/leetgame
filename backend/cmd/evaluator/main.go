package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"leetgame/internal/claude"
	"leetgame/internal/evaluation"
	"leetgame/internal/kafka"
	"leetgame/internal/llm"
	"leetgame/internal/ollama"
	"leetgame/internal/settings"
	"leetgame/internal/storage/postgres"
	"leetgame/internal/utils"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		slog.Error("failed to load .env file", "error", err)
	}

	cfg, err := settings.Load()
	if err != nil {
		slog.Error("failed to load settings", "error", err)
		os.Exit(1)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: utils.MustParseSlogLevel(cfg.Log.Level),
	})))

	if cfg.Kafka.BrokerURL == "" {
		slog.Error("KAFKA_BROKER_URL is required")
		os.Exit(1)
	}

	pg := postgres.New(&postgres.Config{DbUrl: cfg.Storage.DbUrl})
	defer pg.Close()

	var llmClient llm.Client
	switch cfg.LLM.Provider {
	case "ollama":
		llmClient = ollama.New(cfg.LLM.OllamaURL, cfg.LLM.Model, cfg.LLM.APIKey)
	default:
		llmClient = claude.New(cfg.LLM.APIKey, cfg.LLM.Model)
	}

	logger := slog.Default()

	handler := func(ctx context.Context, event kafka.SessionCompletedEvent) error {
		return evaluation.RunSessionWithError(ctx, pg, llmClient, logger, event.UserID, event.Problem, event.ActiveStages, event.History)
	}

	consumer := kafka.NewConsumer(
		cfg.Kafka.BrokerURL,
		cfg.Kafka.Topic,
		cfg.Kafka.GroupID,
		cfg.Kafka.SASLUser,
		cfg.Kafka.SASLPassword,
		cfg.Kafka.TLS,
		handler,
		logger,
	)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	slog.Info(
		"evaluator starting",
		"broker", cfg.Kafka.BrokerURL,
		"topic", cfg.Kafka.Topic,
		"group_id", cfg.Kafka.GroupID,
	)

	if err := consumer.Run(ctx); err != nil {
		slog.Error("consumer error", "error", err)
		pg.Close()
		os.Exit(1)
	}

	slog.Info("evaluator shutdown complete")
}
