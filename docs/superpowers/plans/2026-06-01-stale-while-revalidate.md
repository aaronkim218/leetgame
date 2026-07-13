# Stale-While-Revalidate Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocking-on-reload cache behaviour with stale-while-revalidate so no request ever waits for a DB fetch after the initial cold start.

**Architecture:** Add a `reloading bool` field (protected by `mu`) to `CachedStorage`. `getOrLoad` gains three distinct paths: (1) cache is fresh → return immediately, (2) cache is stale but populated → return stale data and kick off a background goroutine via `triggerReload` if one isn't already running, (3) cache is empty → block and load synchronously so the very first request always gets real data. The background goroutine fetches with its own `context.WithTimeout` (detached from the request context), then swaps the fields atomically under the write lock.

**Tech Stack:** Go stdlib — `sync.RWMutex`, `context.WithTimeout`, goroutines. No new dependencies.

---

## File Map

- **Modify:** `backend/internal/storage/processcache/process_cache.go` — add `reloading bool`, split `getOrLoad` into three paths, add `triggerReload`.
- **Modify:** `backend/internal/storage/processcache/process_cache_test.go` — update `TestCacheExpiry_ReloadsAfterTTL` (now async), add `TestCacheExpiry_ServesStaleDataImmediately` and `TestConcurrentExpiry_OnlyOneReload`.

---

### Task 1: Update `process_cache.go` — stale-while-revalidate logic

**Files:**
- Modify: `backend/internal/storage/processcache/process_cache.go`

- [ ] **Step 1: Add `reloading bool` to the struct**

Open `process_cache.go`. Replace the struct definition (currently lines 21–29):

```go
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
```

- [ ] **Step 2: Replace `getOrLoad` with the three-path version**

Replace the entire `getOrLoad` function (currently lines 35–50):

```go
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
		problems, byID, tags, reloading := c.problems, c.byID, c.tags, c.reloading
		c.mu.RUnlock()
		if !reloading {
			c.triggerReload()
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
```

- [ ] **Step 3: Add `triggerReload` method after `getOrLoad`**

Insert this new method between `getOrLoad` and `load`:

```go
func (c *CachedStorage) triggerReload() {
	c.mu.Lock()
	if c.reloading {
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
```

- [ ] **Step 4: Build to confirm no compilation errors**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/storage/processcache/process_cache.go
git commit -m "feat: stale-while-revalidate — serve stale data, reload async in background"
```

---

### Task 2: Update tests for async reload behaviour

**Files:**
- Modify: `backend/internal/storage/processcache/process_cache_test.go`

- [ ] **Step 1: Write three new/updated test stubs — verify they fail first**

Run the existing expiry test to see its current behaviour before changes:

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/storage/processcache/... -run TestCacheExpiry -v
```

Expected: `TestCacheExpiry_ReloadsAfterTTL` PASS (it still passes because the reload happens, just asynchronously — the sleep in the test may be long enough). Note whether it passes or fails; either outcome is fine. We're replacing it in the next step.

- [ ] **Step 2: Replace `TestCacheExpiry_ReloadsAfterTTL` with the async-aware version**

Find and replace the entire `TestCacheExpiry_ReloadsAfterTTL` function (currently lines 315–330):

```go
func TestCacheExpiry_ReloadsAfterTTL(t *testing.T) {
	stub := &stubStorage{problems: testProblems}
	c := New(stub, time.Millisecond)

	if _, err := c.GetRandomProblem(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if stub.callCount != 1 {
		t.Errorf("want 1 load after initial call, got %d", stub.callCount)
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
		if stub.callCount == 2 {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if stub.callCount != 2 {
		t.Errorf("GetAllProblems called %d times after expiry, want 2", stub.callCount)
	}
}
```

- [ ] **Step 3: Add `TestCacheExpiry_ServesStaleDataImmediately`**

Append after `TestCacheExpiry_ReloadsAfterTTL`:

```go
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
```

- [ ] **Step 4: Add `TestConcurrentExpiry_OnlyOneReload`**

This test requires `sync` — add `"sync"` to the import block in the test file if it is not already present. Then append:

```go
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
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.GetRandomProblem(context.Background()); err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	wg.Wait()

	// wait for async reload
	deadline := time.Now().Add(100 * time.Millisecond)
	for time.Now().Before(deadline) {
		if stub.callCount >= 2 {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if stub.callCount != 2 {
		t.Errorf("want exactly 2 loads (initial + 1 reload), got %d", stub.callCount)
	}
}
```

- [ ] **Step 5: Run all tests and confirm green**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/storage/processcache/... -v
```

Expected: all tests PASS. Count should be 21 tests (18 original + 3 new/updated).

- [ ] **Step 6: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/backend
git add internal/storage/processcache/process_cache_test.go
git commit -m "test: update cache expiry tests for stale-while-revalidate behaviour"
```
