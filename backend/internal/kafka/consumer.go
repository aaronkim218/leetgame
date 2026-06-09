package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"

	kafkago "github.com/segmentio/kafka-go"
	"github.com/segmentio/kafka-go/sasl/scram"
)

const maxRetries = 3

// messageReader is a subset of *kafkago.Reader used for testing.
type messageReader interface {
	FetchMessage(ctx context.Context) (kafkago.Message, error)
	CommitMessages(ctx context.Context, msgs ...kafkago.Message) error
	Close() error
}

type Consumer struct {
	reader  messageReader
	handler func(context.Context, SessionCompletedEvent) error
	logger  *slog.Logger
}

// NewConsumer creates a Consumer connected to a real Kafka broker.
func NewConsumer(brokerURL, topic, groupID, saslUser, saslPass string, useTLS bool, handler func(context.Context, SessionCompletedEvent) error, logger *slog.Logger) *Consumer {
	dialer := &kafkago.Dialer{}
	if useTLS {
		dialer.TLS = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	if saslUser != "" {
		mechanism, err := scram.Mechanism(scram.SHA256, saslUser, saslPass)
		if err != nil {
			logger.Error("failed to create SASL mechanism", "error", err)
		} else {
			dialer.SASLMechanism = mechanism
		}
	}

	r := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:     []string{brokerURL},
		GroupID:     groupID,
		Topic:       topic,
		StartOffset: kafkago.FirstOffset,
		Dialer:      dialer,
	})
	return newConsumer(r, handler, logger)
}

// newConsumer creates a Consumer with a provided reader (used in tests).
func newConsumer(reader messageReader, handler func(context.Context, SessionCompletedEvent) error, logger *slog.Logger) *Consumer {
	return &Consumer{reader: reader, handler: handler, logger: logger}
}

func (c *Consumer) Run(ctx context.Context) error {
	defer func() {
		if err := c.reader.Close(); err != nil {
			c.logger.Error("failed to close kafka reader", "error", err)
		}
	}()
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("failed to fetch message: %w", err)
		}
		c.process(ctx, msg)
		if ctx.Err() != nil {
			return nil
		}
	}
}

func (c *Consumer) process(ctx context.Context, msg kafkago.Message) {
	var event SessionCompletedEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		c.logger.Error("failed to deserialize event, skipping", "error", err, "offset", msg.Offset)
		c.commit(ctx, msg)
		return
	}

	for attempt := 1; attempt <= maxRetries; attempt++ {
		if err := c.handler(ctx, event); err == nil {
			break
		} else if attempt == maxRetries {
			c.logger.Error("max retries exceeded, dropping event", "error", err, "offset", msg.Offset)
		} else {
			c.logger.Warn("handler failed, retrying", "error", err, "attempt", attempt)
		}
	}

	c.commit(ctx, msg)
}

func (c *Consumer) commit(ctx context.Context, msg kafkago.Message) {
	// Commit failure is logged but not returned — the consumer continues processing.
	// The message will be redelivered on restart, which may cause double-processing.
	if err := c.reader.CommitMessages(ctx, msg); err != nil {
		c.logger.Error("failed to commit offset", "error", err)
	}
}
