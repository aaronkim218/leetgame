package evaluation_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"leetgame/internal/evaluation"
	"leetgame/internal/llm"
	"leetgame/internal/models"
	"leetgame/internal/storage"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubStorage satisfies storage.Storage. Unimplemented methods panic.
type stubStorage struct {
	storage.Storage
	upsertCalls []upsertArgs
	upsertErr   error
}

type upsertArgs struct {
	userID, problemID   uuid.UUID
	topic, stage        string
	score, scale, floor float64
}

func (s *stubStorage) UpsertTopicProficiency(ctx context.Context, userID, problemID uuid.UUID, topic, stage string, score, scale, floor float64) error {
	s.upsertCalls = append(s.upsertCalls, upsertArgs{userID, problemID, topic, stage, score, scale, floor})
	return s.upsertErr
}

// stubLLM satisfies llm.Client.
type stubLLM struct {
	eval llm.SessionEvaluation
	err  error
}

func (s *stubLLM) Evaluate(_ context.Context, _ models.Problem, _ string, _ []string, _ []llm.ChatMessage, _ string, _, _, _ bool, _ func(string)) (llm.EvaluateResponse, error) {
	return llm.EvaluateResponse{}, nil
}

func (s *stubLLM) EvaluateSession(_ context.Context, _ models.Problem, _ []string, _ []llm.ChatMessage) (llm.SessionEvaluation, error) {
	return s.eval, s.err
}

var (
	testUserID    = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	testProblemID = uuid.MustParse("00000000-0000-0000-0000-000000000002")
	testProblem   = models.Problem{Id: testProblemID, Title: "Two Sum", Difficulty: "Easy", TopicTags: []string{"Array"}}
	testStages    = []string{"pattern"}
	testHistory   = []llm.ChatMessage{{Role: "user", Content: "hash map"}}
	testLogger    = slog.Default()
)

func TestRunSessionWithError_Success(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 0.8},
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	require.NoError(t, err)
	require.Len(t, store.upsertCalls, 1)
	call := store.upsertCalls[0]
	assert.Equal(t, testUserID, call.userID)
	assert.Equal(t, testProblemID, call.problemID)
	assert.Equal(t, "Array", call.topic)
	assert.Equal(t, "pattern", call.stage)
	assert.InDelta(t, 0.8, call.score, 0.001)
	// Easy difficulty → scale 0.15, floor 0.03
	assert.InDelta(t, 0.15, call.scale, 0.001)
	assert.InDelta(t, 0.03, call.floor, 0.001)
}

func TestRunSessionWithError_LLMError(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{err: errors.New("llm unavailable")}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	assert.Error(t, err)
	assert.Empty(t, store.upsertCalls)
}

func TestRunSessionWithError_OutOfRangeScoreSkipped(t *testing.T) {
	store := &stubStorage{}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 1.5}, // out of range
				{Topic: "Array", Stage: "tc_sc", Score: 0.6},   // valid
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	require.NoError(t, err)
	require.Len(t, store.upsertCalls, 1) // only the valid score
	assert.Equal(t, "tc_sc", store.upsertCalls[0].stage)
}

func TestRunSessionWithError_DBError(t *testing.T) {
	store := &stubStorage{upsertErr: errors.New("db down")}
	llmClient := &stubLLM{
		eval: llm.SessionEvaluation{
			Scores: []llm.TopicScore{
				{Topic: "Array", Stage: "pattern", Score: 0.5},
			},
		},
	}

	err := evaluation.RunSessionWithError(context.Background(), store, llmClient, testLogger, testUserID, testProblem, testStages, testHistory)
	assert.Error(t, err)
}

// Ensure stubStorage and stubLLM satisfy the required interfaces at compile time.
var (
	_ storage.Storage = (*stubStorage)(nil)
	_ llm.Client      = (*stubLLM)(nil)
)
