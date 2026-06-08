# Multi-Difficulty Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to filter problems by multiple difficulties simultaneously (e.g., Easy + Medium), replacing the current single-select behavior.

**Architecture:** Comma-separated `difficulty` query param on the wire (matching the existing `tags` convention), split into `[]string` in the Go handler, propagated through the storage interface. On the frontend, `SearchState.difficulties: string[]` replaces `difficulty: string`, with toggle-per-button UI and "All" as a clear action.

**Tech Stack:** Go 1.23, Fiber v2, Squirrel SQL builder, React 18, TypeScript

---

### Task 1: Update Go storage interface + test stub

**Files:**
- Modify: `backend/internal/storage/storage.go`
- Modify: `backend/internal/storage/processcache/process_cache_test.go`

- [ ] **Step 1: Update the storage interface**

In `backend/internal/storage/storage.go`, change the two method signatures:

```go
// before:
GetRandomProblemFiltered(ctx context.Context, q, difficulty string, tags []string, tagMatch, excludeID string) (models.Problem, error)
SearchProblems(ctx context.Context, q, difficulty string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)

// after:
GetRandomProblemFiltered(ctx context.Context, q string, difficulties []string, tags []string, tagMatch, excludeID string) (models.Problem, error)
SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error)
```

- [ ] **Step 2: Update stubStorage in the test file**

In `backend/internal/storage/processcache/process_cache_test.go`, update the two panic stubs to match the new signatures:

```go
func (s *stubStorage) GetRandomProblemFiltered(_ context.Context, _ string, _ []string, _ []string, _, _ string) (models.Problem, error) {
	panic("unexpected")
}
func (s *stubStorage) SearchProblems(_ context.Context, _ string, _ []string, _ []string, _ string, _, _ int) (types.ProblemSearchResponse, error) {
	panic("unexpected")
}
```

- [ ] **Step 3: Update existing test call sites that pass difficulty as string**

In `process_cache_test.go`, update all calls to `GetRandomProblemFiltered` and `SearchProblems` on `CachedStorage` (not the stub) to pass `[]string` instead of `string`:

```go
// TestGetRandomProblemFiltered_ByDifficulty — line ~136:
p, err := c.GetRandomProblemFiltered(context.Background(), "", []string{"Easy"}, nil, "and", "")

// TestGetRandomProblemFiltered_ByTagAnd — line ~150:
p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, []string{"hash-table", "string"}, "and", "")

// TestGetRandomProblemFiltered_ByTagOr — line ~165:
p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, []string{"math", "array"}, "or", "")

// TestGetRandomProblemFiltered_ExcludeID — line ~180:
p, err := c.GetRandomProblemFiltered(context.Background(), "", nil, nil, "and", id1.String())

// TestGetRandomProblemFiltered_NoMatch_ReturnsNotFound — line ~193:
_, err := c.GetRandomProblemFiltered(context.Background(), "", []string{"Hard"}, nil, "and", "")

// TestSearchProblems_FilterByDifficulty — line ~222:
resp, err := c.SearchProblems(context.Background(), "", []string{"Medium"}, nil, "and", 1, 10)

// All other SearchProblems calls that pass "" for difficulty — change to nil:
resp, err := c.SearchProblems(context.Background(), "", nil, nil, "and", 1, 10)
// (applies to: TestSearchProblems_SortedByLeetcodeID, TestSearchProblems_Pagination,
//  TestSearchProblems_PageBeyondEnd_ReturnsEmpty, TestSearchProblems_InvalidPage_DefaultsToFirstPage,
//  TestSearchProblems_TitleSubstringMatch)
```

- [ ] **Step 4: Verify it doesn't compile yet (implementations not updated)**

```bash
cd backend && go build ./...
```

Expected: compile errors in `process_cache.go` and `postgres/problems.go` about wrong argument types. This confirms the interface change is correct.

---

### Task 2: Update process cache implementation + add multi-difficulty tests

**Files:**
- Modify: `backend/internal/storage/processcache/process_cache.go`
- Modify: `backend/internal/storage/processcache/process_cache_test.go`

- [ ] **Step 1: Write two new failing tests for multi-difficulty filtering**

Append to `process_cache_test.go`:

```go
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
```

- [ ] **Step 2: Run the new tests to confirm they fail (and existing ones to confirm the scope)**

```bash
cd backend && go test ./internal/storage/processcache/... -v -run "MultiDifficulty"
```

Expected: compile error (process_cache.go still uses old signature). This is expected — proceed.

- [ ] **Step 3: Update `matchesProblem` in process_cache.go**

Find `matchesProblem` (around line 131). Change the signature and difficulty check:

```go
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
	// (rest of tag logic unchanged)
```

Make sure `"slices"` is in the import block. If not, add it:

```go
import (
    "slices"
    // ... existing imports
)
```

- [ ] **Step 4: Update `GetRandomProblemFiltered` signature in process_cache.go**

```go
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
	return matches[rand.IntN(len(matches))], nil
}
```

- [ ] **Step 5: Update `SearchProblems` signature in process_cache.go**

```go
func (c *CachedStorage) SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error) {
	problems, _, _, err := c.getOrLoad(ctx)
	if err != nil {
		return types.ProblemSearchResponse{}, err
	}
	var filtered []models.Problem
	for _, p := range problems {
		if matchesProblem(p, q, difficulties, tags, tagMatch, "") {
			filtered = append(filtered, p)
		}
	}
	// (rest of pagination logic unchanged)
```

- [ ] **Step 6: Run all process cache tests**

```bash
cd backend && go test ./internal/storage/processcache/... -v
```

Expected: all tests PASS (including the two new multi-difficulty ones).

- [ ] **Step 7: Commit**

```bash
cd backend && git add internal/storage/storage.go internal/storage/processcache/process_cache.go internal/storage/processcache/process_cache_test.go
git commit -m "feat: update storage interface and process cache for multi-difficulty filtering"
```

---

### Task 3: Update Postgres storage

**Files:**
- Modify: `backend/internal/storage/postgres/problems.go`

- [ ] **Step 1: Update `applyProblemSearchFilters` signature and difficulty filter**

In `problems.go`, find `applyProblemSearchFilters` (line ~19). Change:

```go
func applyProblemSearchFilters(sb squirrel.SelectBuilder, q string, difficulties []string, tags []string, tagMatch, excludeID string) squirrel.SelectBuilder {
	sb = sb.From("problems").PlaceholderFormat(squirrel.Dollar)

	if q != "" {
		sb = sb.Where(squirrel.ILike{"title": "%" + q + "%"})
	}
	if len(difficulties) > 0 {
		sb = sb.Where(squirrel.Eq{"difficulty": difficulties})
	}
	if excludeID != "" {
		sb = sb.Where(squirrel.NotEq{"id": excludeID})
	}
	// (tag logic unchanged)
```

- [ ] **Step 2: Update `GetRandomProblemFiltered` call site**

```go
func (p *Postgres) GetRandomProblemFiltered(ctx context.Context, q string, difficulties []string, tags []string, tagMatch, excludeID string) (models.Problem, error) {
	return utils.Retry(ctx, func(ctx context.Context) (models.Problem, error) {
		sql, args, err := applyProblemSearchFilters(
			squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
			q,
			difficulties,
			tags,
			tagMatch,
			excludeID,
		).
```

- [ ] **Step 3: Update `SearchProblems` call sites (count query and data query)**

```go
func (p *Postgres) SearchProblems(ctx context.Context, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int) (types.ProblemSearchResponse, error) {
	return utils.Retry(ctx, func(ctx context.Context) (types.ProblemSearchResponse, error) {
		countSQL, countArgs, err := applyProblemSearchFilters(
			squirrel.Select("COUNT(*)"),
			q,
			difficulties,
			tags,
			tagMatch,
			"",
		).ToSql()
		// ...
		sql, args, err := applyProblemSearchFilters(
			squirrel.Select("id, slug, title, description, difficulty, topic_tags, leetcode_id, created_at"),
			q,
			difficulties,
			tags,
			tagMatch,
			"",
		).
```

- [ ] **Step 4: Verify the backend compiles cleanly**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && git add internal/storage/postgres/problems.go
git commit -m "feat: update postgres storage for multi-difficulty filtering (IN query)"
```

---

### Task 4: Update Go handler

**Files:**
- Modify: `backend/internal/handlers/problems.go`

- [ ] **Step 1: Update `parseProblemSearchFilters` to parse difficulties**

Replace the function with a version that returns three values:

```go
func parseProblemSearchFilters(q types.SearchQuery) (tags []string, tagMatch string, difficulties []string) {
	tagMatch = strings.ToLower(strings.TrimSpace(q.TagMatch))
	if tagMatch != "or" {
		tagMatch = "and"
	}

	if q.Tags != "" {
		for _, t := range strings.Split(q.Tags, ",") {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
	}

	if q.Difficulty != "" {
		for _, d := range strings.Split(q.Difficulty, ",") {
			if d = strings.TrimSpace(d); d != "" {
				difficulties = append(difficulties, d)
			}
		}
	}

	return tags, tagMatch, difficulties
}
```

- [ ] **Step 2: Update `GetRandomProblem` handler**

```go
func (hs *HandlerService) GetRandomProblem(c *fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.QueryParser(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	tags, tagMatch, difficulties := parseProblemSearchFilters(q)

	var (
		problem models.Problem
		err     error
	)

	if q.Q != "" || len(difficulties) > 0 || len(tags) > 0 {
		problem, err = hs.storage.GetRandomProblemFiltered(c.Context(), q.Q, difficulties, tags, tagMatch, q.ExcludeID)
	} else {
		problem, err = hs.storage.GetRandomProblem(c.Context())
	}
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problem)
}
```

- [ ] **Step 3: Update `GetProblems` handler**

```go
func (hs *HandlerService) GetProblems(c *fiber.Ctx) error {
	var q types.SearchQuery
	if err := c.QueryParser(&q); err != nil {
		return xerrors.BadRequestError("invalid query params")
	}

	page := q.Page
	if page <= 0 {
		page = defaultProblemSearchPage
	}

	pageSize := q.PageSize
	switch {
	case pageSize <= 0:
		pageSize = defaultProblemSearchPageSize
	case pageSize > maxProblemSearchPageSize:
		pageSize = maxProblemSearchPageSize
	}

	tags, tagMatch, difficulties := parseProblemSearchFilters(q)

	problems, err := hs.storage.SearchProblems(c.Context(), q.Q, difficulties, tags, tagMatch, page, pageSize)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}
```

- [ ] **Step 4: Verify the full backend compiles and tests pass**

```bash
cd backend && go build ./... && go test ./...
```

Expected: no errors, all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && git add internal/handlers/problems.go
git commit -m "feat: parse comma-separated difficulty param in handler"
```

---

### Task 5: Update frontend types and API layer

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Update `SearchState` in types.ts**

Change `difficulty: string` to `difficulties: string[]` and update `defaultSearchState`:

```ts
export interface SearchState {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  results: Problem[]
  page: number
  total: number
  hasSearched: boolean
}

export const defaultSearchState: SearchState = {
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
  results: [],
  page: 1,
  total: 0,
  hasSearched: false,
}
```

- [ ] **Step 2: Update `searchProblems` in api.ts**

```ts
export async function searchProblems(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ProblemSearchResponse> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
    signal,
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Update `getRandomProblemFiltered` in api.ts**

```ts
export async function getRandomProblemFiltered(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(`${API_URL}/api/problems/random?${params.toString()}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch filtered random problem: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 4: Verify TypeScript compiles (it won't yet — callers still use old signature)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors in `useSearch.ts`, `SearchPage.tsx`, `App.tsx`. This confirms the types changed correctly.

---

### Task 6: Update useSearch hook and SearchPage component

**Files:**
- Modify: `frontend/src/hooks/useSearch.ts`
- Modify: `frontend/src/components/SearchPage.tsx`

- [ ] **Step 1: Update useSearch.ts**

```ts
import { useState, useEffect, useRef } from 'react'
import type { SearchState } from '../types'
import { searchProblems } from '../api'

export const SEARCH_PAGE_SIZE = 12

export function useSearch(
  searchState: SearchState,
  onSearchStateChange: (s: SearchState) => void,
): { loading: boolean; error: string | null } {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchStateRef = useRef(searchState)
  // eslint-disable-next-line react-hooks/refs
  searchStateRef.current = searchState

  const { q, difficulties, tags, tagMatch, page } = searchState

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const { q: sq, difficulties: sd, tags: st, tagMatch: sm, page: sp } = searchStateRef.current
        const res = await searchProblems(sq, sd, st, sm, sp, SEARCH_PAGE_SIZE, controller.signal)
        onSearchStateChange({ ...searchStateRef.current, results: res.problems, total: res.total, hasSearched: true })
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Search failed. Is the backend running?')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- difficulties.join(',') replaces array ref; others are primitives; onSearchStateChange is a stable useState setter
  }, [q, difficulties.join(','), tags.join(','), tagMatch, page])

  return { loading, error }
}
```

- [ ] **Step 2: Update SearchSelectionContext and the difficulty constant in SearchPage.tsx**

At the top of `SearchPage.tsx`, rename the constant and update `SearchSelectionContext`:

```ts
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
type Difficulty = typeof DIFFICULTIES[number]

// difficultyTextClass and difficultyActiveClass stay the same but keyed to Difficulty type

export interface SearchSelectionContext {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}
```

- [ ] **Step 3: Update the component body in SearchPage.tsx**

Replace all `difficulty`-related lines in the component with multi-select logic:

```tsx
// Destructure (replaces: const { q, difficulty, ... } = searchState)
const { q, difficulties, tags, tagMatch, results, page, total, hasSearched } = searchState
const hasActiveFilters = q !== '' || difficulties.length > 0 || tags.length > 0

// Replace setDifficulty with these two helpers:
const toggleDifficulty = (d: string) => {
  const next = difficulties.includes(d) ? difficulties.filter(x => x !== d) : [...difficulties, d]
  onSearchStateChange({ ...searchState, difficulties: next, page: 1 })
}
const clearDifficulties = () => onSearchStateChange({ ...searchState, difficulties: [], page: 1 })
```

- [ ] **Step 4: Replace the difficulty button block in SearchPage.tsx JSX**

Find the `<div className="flex gap-2 mb-4">` containing the difficulty buttons and replace it:

```tsx
<div className="flex gap-2 mb-4">
  <button
    onClick={clearDifficulties}
    className={cn(
      'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
      difficulties.length === 0
        ? 'border-foreground bg-foreground text-background'
        : 'border-border text-muted-foreground hover:text-foreground'
    )}
  >
    All
  </button>
  {DIFFICULTIES.map(d => (
    <button
      key={d}
      onClick={() => toggleDifficulty(d)}
      className={cn(
        'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
        difficulties.includes(d)
          ? difficultyActiveClass[d]
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {d}
    </button>
  ))}
</div>
```

- [ ] **Step 5: Update the `onSelectProblem` call in SearchPage.tsx to use `difficulties`**

Find the object passed to `onSelectProblem` (inside the result list `onClick`):

```tsx
onClick={() => onSelectProblem(p, {
  q: showSaved ? '' : q,
  difficulties: showSaved ? [] : difficulties,
  tags: showSaved ? [] : tags,
  tagMatch: showSaved ? 'and' : tagMatch,
  page: showSaved ? 1 : page,
  pageSize: SEARCH_PAGE_SIZE,
  results: showSaved ? savedProblems : results,
  selectedIndex: (showSaved ? savedProblems : results).findIndex(r => r.id === p.id),
})}
```

---

### Task 7: Update ProblemView component

**Files:**
- Modify: `frontend/src/components/ProblemView.tsx`

- [ ] **Step 1: Update the `SearchPlaylistSummary` interface**

Find the `SearchPlaylistSummary` interface (around line 16) and change `difficulty`:

```ts
interface SearchPlaylistSummary {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
}
```

- [ ] **Step 2: Replace the difficulty badge rendering in the playlist summary section**

Find lines like:
```tsx
{playlistSummary.difficulty && (
  <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[playlistSummary.difficulty] ?? 'text-foreground')}>
    {playlistSummary.difficulty}
  </span>
)}
```

Replace with:
```tsx
{playlistSummary.difficulties.map(d => (
  <span key={d} className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[d] ?? 'text-foreground')}>
    {d}
  </span>
))}
```

---

### Task 8: Update App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update the `SearchPlaylist` interface**

```ts
interface SearchPlaylist {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  page: number
  pageSize: number
  results: Problem[]
  selectedIndex: number
}
```

- [ ] **Step 2: Update `getPlaylistSummary`**

```ts
function getPlaylistSummary(searchPlaylist: SearchPlaylist | null) {
  if (!searchPlaylist) return null

  if (!searchPlaylist.q && searchPlaylist.difficulties.length === 0 && searchPlaylist.tags.length === 0) {
    return null
  }

  return {
    q: searchPlaylist.q,
    difficulties: searchPlaylist.difficulties,
    tags: searchPlaylist.tags,
    tagMatch: searchPlaylist.tagMatch,
  }
}
```

- [ ] **Step 3: Update `loadNextSearchProblem`**

Change `searchPlaylist.difficulty` → `searchPlaylist.difficulties` in the two places it appears:

```ts
const res = await searchProblems(
  searchPlaylist.q,
  searchPlaylist.difficulties,
  searchPlaylist.tags,
  searchPlaylist.tagMatch,
  nextPage,
  searchPlaylist.pageSize,
)
```

- [ ] **Step 4: Update `loadRandomNextProblem`**

```ts
const p = await getRandomProblemFiltered(
  searchPlaylist.q,
  searchPlaylist.difficulties,
  searchPlaylist.tags,
  searchPlaylist.tagMatch,
  problem?.id,
)
```

- [ ] **Step 5: Update `enterPlaylistFromSearch`**

```ts
const { q, difficulties, tags, tagMatch } = searchState
// ...
const p = await getRandomProblemFiltered(q, difficulties, tags, tagMatch)
setProblem(p)
setProblemSource('search')
setSearchPlaylist({
  q,
  difficulties,
  tags,
  tagMatch,
  page: 0,
  pageSize: SEARCH_PAGE_SIZE,
  results: [],
  selectedIndex: -1,
})
```

- [ ] **Step 6: Update `selectProblem`**

```ts
setSearchPlaylist({
  q: context.q,
  difficulties: context.difficulties,
  tags: context.tags,
  tagMatch: context.tagMatch,
  page: context.page,
  pageSize: context.pageSize,
  results: context.results,
  selectedIndex: context.selectedIndex,
})
```

- [ ] **Step 7: Update `restartSearchSet`**

```ts
const res = await searchProblems(
  searchPlaylist.q,
  searchPlaylist.difficulties,
  searchPlaylist.tags,
  searchPlaylist.tagMatch,
  1,
  searchPlaylist.pageSize,
)
```

- [ ] **Step 8: Verify TypeScript compiles with no errors**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9: Commit all frontend changes**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/hooks/useSearch.ts frontend/src/components/SearchPage.tsx frontend/src/components/ProblemView.tsx frontend/src/App.tsx
git commit -m "feat: multi-difficulty selection — frontend"
```

---

### Task 9: Verify end-to-end

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Manual smoke test checklist**

Open the app in a browser and verify:

1. On the Search page, clicking "Easy" highlights it; "All" is no longer highlighted.
2. Clicking "Medium" while "Easy" is active highlights both; "All" remains unhighlighted.
3. Clicking "Easy" again deselects it; only "Medium" remains highlighted.
4. Clicking "All" clears all selections; "All" is highlighted again.
5. With "Easy" + "Medium" selected, results show only Easy and Medium problems.
6. With "Easy" + "Medium" selected, entering a playlist (Enter Playlist button) works and only returns Easy/Medium problems.
7. The playlist summary chip in practice view shows separate Easy and Medium badges when both are selected.
8. Selecting only "Hard" returns only Hard problems.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p && git commit -m "fix: post-review corrections for multi-difficulty selection"
```

(Only needed if Step 2 revealed issues.)
