package processcache

import (
	"context"
	"log/slog"
	"math/rand"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"leetgame/internal/models"
	"leetgame/internal/storage"
	"leetgame/internal/types"
	"leetgame/internal/utils"
	"leetgame/internal/xerrors"

	"github.com/google/uuid"
)

type CachedStorage struct {
	inner     storage.Storage
	ttl       time.Duration
	mu        sync.RWMutex
	problems  []models.Problem
	byID      map[uuid.UUID]models.Problem
	tags      []types.ProblemTag
	loadedAt  time.Time
	reloading bool
}

func New(inner storage.Storage, ttl time.Duration) *CachedStorage {
	return &CachedStorage{inner: inner, ttl: ttl}
}

func (c *CachedStorage) getOrLoad(ctx context.Context) ([]models.Problem, map[uuid.UUID]models.Problem, []types.ProblemTag, error) {
	c.mu.RLock()
	fresh := !c.loadedAt.IsZero() && time.Since(c.loadedAt) < c.ttl
	populated := !c.loadedAt.IsZero()
	if fresh {
		problems, byID, tags := c.problems, c.byID, c.tags
		c.mu.RUnlock()
		return problems, byID, tags, nil
	}
	if populated {
		problems, byID, tags, loadedAt, reloading := c.problems, c.byID, c.tags, c.loadedAt, c.reloading
		c.mu.RUnlock()
		if !reloading {
			c.triggerReload(loadedAt)
		}
		return problems, byID, tags, nil
	}
	c.mu.RUnlock()

	// cache is empty — block and load synchronously
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.loadedAt.IsZero() {
		return c.problems, c.byID, c.tags, nil
	}
	return c.load(ctx)
}

func (c *CachedStorage) triggerReload(staleLoadedAt time.Time) {
	c.mu.Lock()
	if c.reloading || c.loadedAt != staleLoadedAt {
		c.mu.Unlock()
		return
	}
	c.reloading = true
	c.mu.Unlock()

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		problems, err := c.inner.GetAllProblems(ctx)

		c.mu.Lock()
		defer c.mu.Unlock()
		c.reloading = false
		if err != nil {
			slog.Error("processcache: background reload failed", "err", err)
			return
		}
		byID := make(map[uuid.UUID]models.Problem, len(problems))
		for _, p := range problems {
			byID[p.Id] = p
		}
		c.problems = problems
		c.byID = byID
		c.tags = deriveTags(problems)
		c.loadedAt = time.Now()
	}()
}

func (c *CachedStorage) load(ctx context.Context) ([]models.Problem, map[uuid.UUID]models.Problem, []types.ProblemTag, error) {
	problems, err := c.inner.GetAllProblems(ctx)
	if err != nil {
		return nil, nil, nil, err
	}
	byID := make(map[uuid.UUID]models.Problem, len(problems))
	for _, p := range problems {
		byID[p.Id] = p
	}
	tags := deriveTags(problems)
	c.problems = problems
	c.byID = byID
	c.tags = tags
	c.loadedAt = time.Now()
	return problems, byID, tags, nil
}

func deriveTags(problems []models.Problem) []types.ProblemTag {
	counts := make(map[string]int)
	for _, p := range problems {
		for _, tag := range p.TopicTags {
			counts[tag]++
		}
	}
	tags := make([]types.ProblemTag, 0, len(counts))
	for name, count := range counts {
		tags = append(tags, types.ProblemTag{Name: name, Count: count})
	}
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})
	return tags
}

func matchesProblem(p models.Problem, q string, difficulties []string, tags []string, tagMatch, excludeID string) bool {
	if excludeID != "" && p.Id.String() == excludeID {
		return false
	}
	if q != "" && !strings.Contains(strings.ToLower(p.Title), strings.ToLower(q)) {
		return false
	}
	if len(difficulties) > 0 && !slices.Contains(difficulties, p.Difficulty) {
		return false
	}
	if len(tags) == 0 {
		return true
	}
	switch tagMatch {
	case "or":
		for _, tag := range tags {
			if slices.Contains(p.TopicTags, tag) {
				return true
			}
		}
		return false
	default: // "and"
		for _, tag := range tags {
			if !slices.Contains(p.TopicTags, tag) {
				return false
			}
		}
		return true
	}
}

// --- intercepted methods ---

func (c *CachedStorage) GetAllProblems(ctx context.Context) ([]models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	return problems, err
}

func (c *CachedStorage) GetRandomProblem(ctx context.Context) (models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	if len(problems) == 0 {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{}))
	}
	return problems[rand.Intn(len(problems))], nil
}

func (c *CachedStorage) GetRandomProblemFiltered(ctx context.Context, q string, difficulties []string, tags []string, tagMatch, excludeID string) (models.Problem, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	var matches []models.Problem
	for _, p := range problems {
		if matchesProblem(p, q, difficulties, tags, tagMatch, excludeID) {
			matches = append(matches, p)
		}
	}
	if len(matches) == 0 {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{}))
	}
	return matches[rand.Intn(len(matches))], nil
}

func (c *CachedStorage) GetProblemByID(ctx context.Context, id uuid.UUID) (models.Problem, error) {
	_, byID, _, err := c.getOrLoad(ctx)
	if err != nil {
		return models.Problem{}, err
	}
	p, ok := byID[id]
	if !ok {
		return models.Problem{}, utils.CreateNonRetryableError(xerrors.NotFoundError("problem", map[string]string{"id": id.String()}))
	}
	return p, nil
}

func (c *CachedStorage) SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return types.ProblemSearchResponse{}, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}
	filtered := make([]models.Problem, 0)
	for _, p := range problems {
		if matchesProblem(p, q, difficulties, tags, tagMatch, "") {
			filtered = append(filtered, p)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool {
		if filtered[i].LeetcodeID == nil {
			return false
		}
		if filtered[j].LeetcodeID == nil {
			return true
		}
		return *filtered[i].LeetcodeID < *filtered[j].LeetcodeID
	})
	total := len(filtered)
	start := (page - 1) * pageSize
	if start >= total {
		return types.ProblemSearchResponse{
			Problems: []models.Problem{},
			Page:     page,
			PageSize: pageSize,
			Total:    total,
		}, nil
	}
	end := min(start+pageSize, total)
	return types.ProblemSearchResponse{
		Problems: filtered[start:end],
		Page:     page,
		PageSize: pageSize,
		Total:    total,
	}, nil
}

func (c *CachedStorage) GetProblemTags(ctx context.Context) ([]types.ProblemTag, error) {
	_, _, tags, err := c.getOrLoad(ctx)
	return tags, err
}

// --- pass-through methods ---

func (c *CachedStorage) Ping(ctx context.Context) error {
	return c.inner.Ping(ctx)
}

func (c *CachedStorage) UpsertPracticeDay(ctx context.Context, userID uuid.UUID) error {
	return c.inner.UpsertPracticeDay(ctx, userID)
}

func (c *CachedStorage) GetStreak(ctx context.Context, userID uuid.UUID) (types.StreakInfo, error) {
	return c.inner.GetStreak(ctx, userID)
}

func (c *CachedStorage) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	return c.inner.GetUserSettings(ctx, userID)
}

func (c *CachedStorage) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, activeTopics []string, tourDone bool) error {
	return c.inner.UpsertUserSettings(ctx, userID, activeStages, hideTitle, hideDifficulty, activeTopics, tourDone)
}

func (c *CachedStorage) SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	return c.inner.SaveProblem(ctx, userID, problemID)
}

func (c *CachedStorage) UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	return c.inner.UnsaveProblem(ctx, userID, problemID)
}

func (c *CachedStorage) GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error) {
	return c.inner.GetSavedProblems(ctx, userID)
}

func (c *CachedStorage) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error {
	return c.inner.UpsertTopicProficiency(ctx, userID, problemID, topic, stage, sessionScore, scale, floor)
}

func (c *CachedStorage) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	return c.inner.GetTopicProficiencies(ctx, userID)
}

func (c *CachedStorage) GetProficiencyHistory(ctx context.Context, userID uuid.UUID) ([]models.ProficiencySnapshot, error) {
	return c.inner.GetProficiencyHistory(ctx, userID)
}
