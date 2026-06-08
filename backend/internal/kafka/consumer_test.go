package kafka

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"leetgame/internal/llm"
	"leetgame/internal/models"

	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockReader implements messageReader for tests.
type mockReader struct {
	msgs    []kafkago.Message
	pos     int
	commits []kafkago.Message
	done    chan struct{} // closed after last message is committed
}

func newMockReader(msgs []kafkago.Message) *mockReader {
	return &mockReader{msgs: msgs, done: make(chan struct{})}
}

func (m *mockReader) FetchMessage(ctx context.Context) (kafkago.Message, error) {
	if m.pos >= len(m.msgs) {
		<-ctx.Done()
		return kafkago.Message{}, ctx.Err()
	}
	msg := m.msgs[m.pos]
	m.pos++
	return msg, nil
}

func (m *mockReader) CommitMessages(_ context.Context, msgs ...kafkago.Message) error {
	m.commits = append(m.commits, msgs...)
	if len(m.commits) >= len(m.msgs) {
		select {
		case <-m.done:
		default:
			close(m.done)
		}
	}
	return nil
}

func (m *mockReader) Close() error { return nil }

func validMessage(t *testing.T) kafkago.Message {
	t.Helper()
	event := SessionCompletedEvent{
		UserID:       uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Problem:      models.Problem{Title: "Two Sum", Difficulty: "Easy"},
		ActiveStages: []string{"pattern"},
		History:      []llm.ChatMessage{{Role: "user", Content: "hash map"}},
	}
	data, err := json.Marshal(event)
	require.NoError(t, err)
	return kafkago.Message{Value: data}
}

func TestConsumer_BadJSON_CommitsAndSkips(t *testing.T) {
	r := newMockReader([]kafkago.Message{{Value: []byte("not json")}})
	handlerCalled := false
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		handlerCalled = true
		return nil
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)
	assert.False(t, handlerCalled)
}

func TestConsumer_HandlerSuccess_Commits(t *testing.T) {
	r := newMockReader([]kafkago.Message{validMessage(t)})
	handlerCalled := false
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		handlerCalled = true
		return nil
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)
	assert.True(t, handlerCalled)
}

func TestConsumer_HandlerAlwaysFails_CommitsAfterMaxRetries(t *testing.T) {
	r := newMockReader([]kafkago.Message{validMessage(t)})
	callCount := 0
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		callCount++
		return errors.New("transient error")
	}, slog.Default())

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		<-r.done
		cancel()
	}()
	c.Run(ctx) //nolint:errcheck

	assert.Len(t, r.commits, 1)            // still committed after max retries
	assert.Equal(t, maxRetries, callCount) // retried maxRetries times
}

func TestConsumer_FetchError_ReturnsError(t *testing.T) {
	fetchErr := errors.New("broker connection lost")
	r := &errorReader{err: fetchErr}
	c := newConsumer(r, func(_ context.Context, _ SessionCompletedEvent) error {
		return nil
	}, slog.Default())

	err := c.Run(context.Background())
	assert.ErrorIs(t, err, fetchErr)
}

// errorReader always returns an error from FetchMessage.
type errorReader struct {
	err     error
	commits []kafkago.Message
}

func (e *errorReader) FetchMessage(_ context.Context) (kafkago.Message, error) {
	return kafkago.Message{}, e.err
}

func (e *errorReader) CommitMessages(_ context.Context, msgs ...kafkago.Message) error {
	e.commits = append(e.commits, msgs...)
	return nil
}
func (e *errorReader) Close() error { return nil }
