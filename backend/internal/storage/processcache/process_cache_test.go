package processcache

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"leetgame/internal/models"
	"leetgame/internal/types"

	"github.com/google/uuid"
)

// stubStorage implements storage.Storage minimally for testing.
// Only GetAllProblems is implemented; all other methods panic if called.
type stubStorage struct {
	problems  []models.Problem
	callCount atomic.Int32
}

func (s *stubStorage) GetAllProblems(_ context.Context) ([]models.Problem, error) {
	s.callCount.Add(1)
	return s.problems, nil
}

// Implement the rest of storage.Storage as panics — should never be called in these tests.
func (s *stubStorage) Ping(_ context.Context) error { panic("unexpected") }

func (s *stubStorage) GetRandomProblem(_ context.Context) (models.Problem, error) {
	panic("unexpected")
}

func (s *stubStorage) GetRandomProblemFiltered(_ context.Context, _ string, _ []string, _ []string, _, _ string) (models.Problem, error) {
	panic("unexpected")
}

func (s *stubStorage) GetProblemByID(_ context.Context, _ uuid.UUID) (models.Problem, error) {
	panic("unexpected")
}

func (s *stubStorage) SearchProblems(_ context.Context, _ string, _ []string, _ []string, _ string, _, _ int) (types.ProblemSearchResponse, error) {
	panic("unexpected")
}

func (s *stubStorage) GetProblemTags(_ context.Context) ([]types.ProblemTag, error) {
	panic("unexpected")
}

func (s *stubStorage) UpsertPracticeDay(_ context.Context, _ uuid.UUID) error { panic("unexpected") }

func (s *stubStorage) GetStreak(_ context.Context, _ uuid.UUID) (types.StreakInfo, error) {
	panic("unexpected")
}

func (s *stubStorage) GetUserSettings(_ context.Context, _ uuid.UUID) (models.UserSettings, error) {
	panic("unexpected")
}

func (s *stubStorage) UpsertUserSettings(_ context.Context, _ uuid.UUID, _ []string, _ bool, _ bool, _ bool, _ []string, _ bool) error {
	panic("unexpected")
}
func (s *stubStorage) SaveProblem(_ context.Context, _, _ uuid.UUID) error   { panic("unexpected") }
func (s *stubStorage) UnsaveProblem(_ context.Context, _, _ uuid.UUID) error { panic("unexpected") }
func (s *stubStorage) GetSavedProblems(_ context.Context, _ uuid.UUID) ([]models.Problem, error) {
	panic("unexpected")
}

func (s *stubStorage) UpsertTopicProficiency(_ context.Context, _, _ uuid.UUID, _, _ string, _, _, _ float64) error {
	panic("unexpected")
}

func (s *stubStorage) GetTopicProficiencies(_ context.Context, _ uuid.UUID) ([]models.TopicProficiency, error) {
	panic("unexpected")
}

func (s *stubStorage) GetProficiencyHistory(_ context.Context, _ uuid.UUID, _ int) ([]models.ProficiencySnapshot, error) {
	panic("unexpected")
}

// test data
var (
	id1  = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	id2  = uuid.MustParse("00000000-0000-0000-0000-000000000002")
	id3  = uuid.MustParse("00000000-0000-0000-0000-000000000003")
	lid1 = 1
	lid2 = 2
	lid3 = 3
)

var testProblems = []models.Problem{
	{Id: id1, Title: "Two Sum", Difficulty: "Easy", TopicTags: []string{"array", "hash-table"}, LeetcodeID: &lid1},
	{Id: id2, Title: "Add Two Numbers", Difficulty: "Medium", TopicTags: []string{"linked-list", "math"}, LeetcodeID: &lid2},
	{Id: id3, Title: "Longest Substring", Difficulty: "Medium", TopicTags: []string{"string", "hash-table"}, LeetcodeID: &lid3},
}

func newCache(problems []models.Problem) *CachedStorage {
	return New(&stubStorage{problems: problems}, time.Hour)
}

func TestGetProblemTags_DerivedFromProblems(t *testing.T) {
	c := newCache(testProblems)
	tags, err := c.GetProblemTags(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// expect: array=1, hash-table=2, linked-list=1, math=1, string=1 — sorted by name
	expected := []types.ProblemTag{
		{Name: "array", Count: 1},
		{Name: "hash-table", Count: 2},
		{Name: "linked-list", Count: 1},
		{Name: "math", Count: 1},
		{Name: "string", Count: 1},
	}
	if len(tags) != len(expected) {
		t.Fatalf("got %d tags, want %d", len(tags), len(expected))
	}
	for i, want := range expected {
		if tags[i].Name != want.Name || tags[i].Count != want.Count {
			t.Errorf("tag[%d]: got {%s %d}, want {%s %d}", i, tags[i].Name, tags[i].Count, want.Name, want.Count)
		}
	}
}

func TestGetRandomProblem_ReturnsAProblem(t *testing.T) {
	c := newCache(testProblems)
	p, err := c.GetRandomProblem(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Id == uuid.Nil {
		t.Error("returned problem has nil ID")
	}
}

func TestGetRandomProblem_EmptyProblems_ReturnsNotFound(t *testing.T) {
	c := newCache([]models.Problem{})
	_, err := c.GetRandomProblem(context.Background())
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestGetRandomProblemFiltered_ByDifficulty(t *testing.T) {
	c := newCache(testProblems)
	for range 20 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", []string{"Easy"}, nil, "and", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Difficulty != "Easy" {
			t.Errorf("got difficulty %s, want Easy", p.Difficulty)
		}
	}
}

func TestGetRandomProblemFiltered_ByTagAnd(t *testing.T) {
	c := newCache(testProblems)
	// only id3 has both "string" AND "hash-table"
	for range 10 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, []string{"hash-table", "string"}, "and", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id != id3 {
			t.Errorf("expected id3, got %s", p.Id)
		}
	}
}

func TestGetRandomProblemFiltered_ByTagOr(t *testing.T) {
	c := newCache(testProblems)
	// "math" OR "array" matches id1 and id2
	seen := map[uuid.UUID]bool{}
	for range 50 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, []string{"math", "array"}, "or", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id != id1 && p.Id != id2 {
			t.Errorf("unexpected problem %s", p.Id)
		}
		seen[p.Id] = true
	}
	if !seen[id1] || !seen[id2] {
		t.Error("expected both id1 and id2 to appear in 50 samples")
	}
}

func TestGetRandomProblemFiltered_ExcludeID(t *testing.T) {
	c := newCache(testProblems)
	for range 20 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, nil, "and", id1.String())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id == id1 {
			t.Error("excluded id1 was returned")
		}
	}
}

func TestGetRandomProblemFiltered_NoMatch_ReturnsNotFound(t *testing.T) {
	c := newCache(testProblems)
	_, err := c.GetRandomProblemFiltered(context.Background(), "", []string{"Hard"}, nil, "and", "")
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestGetProblemByID_Found(t *testing.T) {
	c := newCache(testProblems)
	p, err := c.GetProblemByID(context.Background(), id2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Id != id2 {
		t.Errorf("got %s, want %s", p.Id, id2)
	}
}

func TestGetProblemByID_NotFound(t *testing.T) {
	c := newCache(testProblems)
	missing := uuid.MustParse("00000000-0000-0000-0000-000000000099")
	_, err := c.GetProblemByID(context.Background(), missing)
	if err == nil {
		t.Fatal("expected not-found error, got nil")
	}
}

func TestSearchProblems_FilterByDifficulty(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", []string{"Medium"}, nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 2 {
		t.Errorf("total: got %d, want 2", resp.Total)
	}
	for _, p := range resp.Problems {
		if p.Difficulty != "Medium" {
			t.Errorf("got difficulty %s, want Medium", p.Difficulty)
		}
	}
}

func TestSearchProblems_SortedByLeetcodeID(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", nil, nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for i := 1; i < len(resp.Problems); i++ {
		if resp.Problems[i-1].LeetcodeID != nil && resp.Problems[i].LeetcodeID != nil {
			if *resp.Problems[i-1].LeetcodeID > *resp.Problems[i].LeetcodeID {
				t.Errorf("not sorted at index %d: %d > %d", i, *resp.Problems[i-1].LeetcodeID, *resp.Problems[i].LeetcodeID)
			}
		}
	}
}

func TestSearchProblems_Pagination(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", nil, nil, "and", 2, 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
	if len(resp.Problems) != 1 {
		t.Errorf("page 2 size: got %d, want 1", len(resp.Problems))
	}
}

func TestSearchProblems_PageBeyondEnd_ReturnsEmpty(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", nil, nil, "and", 99, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(resp.Problems) != 0 {
		t.Errorf("expected empty problems, got %d", len(resp.Problems))
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
}

func TestSearchProblems_InvalidPage_DefaultsToFirstPage(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "", nil, nil, "and", 0, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
	if len(resp.Problems) != 3 {
		t.Errorf("page 0 should default to page 1, got %d problems", len(resp.Problems))
	}
}

func TestSearchProblems_TitleSubstringMatch(t *testing.T) {
	c := newCache(testProblems)
	resp, err := c.SearchProblems(context.Background(), "two sum", nil, nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 1 || resp.Problems[0].Id != id1 {
		t.Errorf("expected id1 for query 'two sum', got total=%d", resp.Total)
	}
}

func TestCacheHit_LoadsOnce(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Hour)

	for range 5 {
		if _, err := c.GetRandomProblem(context.Background()); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	}

	if stub.callCount.Load() != 1 {
		t.Errorf("GetAllProblems called %d times, want 1", stub.callCount.Load())
	}
}

func TestCacheExpiry_ReloadsAfterTTL(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Millisecond)

	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stub.callCount.Load() != 1 {
		t.Errorf("want 1 load after initial call, got %d", stub.callCount.Load())
	}

	time.Sleep(5 * time.Millisecond) // expire TTL

	// stale-while-revalidate: second call returns stale data immediately
	// and triggers an async reload
	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error on stale read: %v", err)
	}

	// wait for the async reload goroutine to finish (up to 100ms)
	deadline := time.Now().Add(100 * time.Millisecond)
	for time.Now().Before(deadline) {
		if stub.callCount.Load() == 2 {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if stub.callCount.Load() != 2 {
		t.Errorf("GetAllProblems called %d times after expiry, want 2", stub.callCount.Load())
	}
}

func TestCacheExpiry_ServesStaleDataImmediately(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Millisecond)

	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	time.Sleep(5 * time.Millisecond) // expire TTL

	p, err := c.GetRandomProblem(context.Background())
	if err != nil {
		t.Fatalf("expected stale data, got error: %v", err)
	}
	if p.Id == uuid.Nil {
		t.Error("stale read returned zero-value problem")
	}
}

func TestGetRandomProblemFiltered_ByMultipleDifficulties(t *testing.T) {
	c := newCache(testProblems)
	// Easy (id1) + Medium (id2, id3) — Hard excluded
	seen := map[uuid.UUID]bool{}
	for range 50 {
		p, err := c.GetRandomProblemFiltered(context.Background(), "", []string{"Easy", "Medium"}, nil, "and", "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if p.Id != id1 && p.Id != id2 && p.Id != id3 {
			t.Errorf("unexpected problem %s returned for Easy+Medium filter", p.Id)
		}
		seen[p.Id] = true
	}
	if !seen[id1] {
		t.Error("expected id1 (Easy) to appear in 50 samples")
	}
	if !seen[id2] || !seen[id3] {
		t.Error("expected id2 and id3 (Medium) to appear in 50 samples")
	}
}

func TestSearchProblems_FilterByMultipleDifficulties(t *testing.T) {
	c := newCache(testProblems)
	// Easy (id1) + Medium (id2, id3) = 3 total
	resp, err := c.SearchProblems(context.Background(), "", []string{"Easy", "Medium"}, nil, "and", 1, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Total != 3 {
		t.Errorf("total: got %d, want 3", resp.Total)
	}
	for _, p := range resp.Problems {
		if p.Difficulty != "Easy" && p.Difficulty != "Medium" {
			t.Errorf("got unexpected difficulty %s", p.Difficulty)
		}
	}
}

func TestConcurrentExpiry_OnlyOneReload(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Millisecond)

	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	time.Sleep(5 * time.Millisecond) // expire TTL

	// 10 concurrent requests after TTL — all should get stale data,
	// only one background reload should be started
	var wg sync.WaitGroup
	for range 10 {
		wg.Go(func() {
			if _, err := c.GetRandomProblem(context.Background()); err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
	wg.Wait()

	// wait for async reload
	deadline := time.Now().Add(100 * time.Millisecond)
	for time.Now().Before(deadline) {
		if stub.callCount.Load() >= 2 {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if stub.callCount.Load() != 2 {
		t.Errorf("want exactly 2 loads (initial + 1 reload), got %d", stub.callCount.Load())
	}
}
