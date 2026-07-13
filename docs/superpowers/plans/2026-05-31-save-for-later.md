# Save for Later Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single bookmark per problem per user — save from practice view or search results, view saved problems as a filter in search.

**Architecture:** New `saved_problems` table (user_id, problem_id). Backend exposes three routes under `/api/saved`: GET returns full saved Problem objects, POST saves, DELETE unsaves — all behind RequireAuth. Frontend `useSaved` hook (called at App level) loads saved problems once per session, exposes a `Set<string>` of IDs plus save/unsave functions with optimistic updates. Bookmark icon appears in ProblemView header and on each SearchPage result card. SearchPage gets a "Saved" toggle that switches the results list to the saved problems from the hook.

**Tech Stack:** Go/Fiber/pgx backend, React 19/TypeScript frontend, Supabase Auth, shadcn Button/Badge

---

## File Map

| File | Change |
|---|---|
| `backend/db/schema.sql` | Add `saved_problems` table |
| `backend/internal/storage/postgres/saved.go` | **Create** — `SaveProblem`, `UnsaveProblem`, `GetSavedProblems` |
| `backend/internal/storage/storage.go` | Add 3 saved methods to interface |
| `backend/internal/constants/routes.go` | Add saved route constants |
| `backend/internal/handlers/saved.go` | **Create** — `SaveProblem`, `UnsaveProblem`, `GetSavedProblems` handlers |
| `backend/internal/handlers/routes.go` | Register `/api/saved` routes |
| `frontend/src/api.ts` | Add `getSavedProblems`, `saveProblem`, `unsaveProblem` |
| `frontend/src/hooks/useSaved.ts` | **Create** — loads saved problems, exposes save/unsave, savedIds Set |
| `frontend/src/App.tsx` | Call `useSaved`, pass props to ProblemView and SearchPage |
| `frontend/src/components/ProblemView.tsx` | Add bookmark button in header |
| `frontend/src/components/SearchPage.tsx` | Add bookmark icon on cards, "Saved" filter toggle |

---

### Task 1: DB schema + storage layer

**Files:**
- Modify: `backend/db/schema.sql`
- Create: `backend/internal/storage/postgres/saved.go`
- Modify: `backend/internal/storage/storage.go`

**Supabase migration to run manually after this task:**
```sql
CREATE TABLE IF NOT EXISTS saved_problems (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);
```

- [ ] **Step 1: Add table to schema.sql**

In `backend/db/schema.sql`, append after the `user_settings` table:

```sql
CREATE TABLE IF NOT EXISTS saved_problems (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);
```

- [ ] **Step 2: Create `backend/internal/storage/postgres/saved.go`**

```go
package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	const q = `
		INSERT INTO saved_problems (user_id, problem_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error {
	const q = `DELETE FROM saved_problems WHERE user_id = $1 AND problem_id = $2`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error) {
	const q = `
		SELECT p.id, p.slug, p.title, p.description, p.difficulty, p.topic_tags, p.leetcode_id, p.created_at
		FROM problems p
		INNER JOIN saved_problems sp ON sp.problem_id = p.id
		WHERE sp.user_id = $1
		ORDER BY sp.created_at DESC`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.Problem, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.Problem])
	})
}
```

- [ ] **Step 3: Add methods to storage interface**

In `backend/internal/storage/storage.go`, add after the `// settings` block:

```go
	// saved problems
	SaveProblem(ctx context.Context, userID, problemID uuid.UUID) error
	UnsaveProblem(ctx context.Context, userID, problemID uuid.UUID) error
	GetSavedProblems(ctx context.Context, userID uuid.UUID) ([]models.Problem, error)
```

- [ ] **Step 4: Build and verify**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/db/schema.sql backend/internal/storage/postgres/saved.go backend/internal/storage/storage.go
git commit -m "feat: add saved_problems table and storage methods"
```

---

### Task 2: Backend handlers and routes

**Files:**
- Create: `backend/internal/handlers/saved.go`
- Modify: `backend/internal/handlers/routes.go`
- Modify: `backend/internal/constants/routes.go`

- [ ] **Step 1: Add route constants**

In `backend/internal/constants/routes.go`:

```go
package constants

const (
	RandomProblem = "/api/problems/random"
	Chat          = "/api/chat"
	Saved         = "/api/saved"
)
```

- [ ] **Step 2: Create `backend/internal/handlers/saved.go`**

```go
package handlers

import (
	"net/http"

	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func (hs *HandlerService) GetSavedProblems(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserId(c)
	if err != nil {
		return err
	}
	problems, err := hs.storage.GetSavedProblems(c.Context(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(problems)
}

func (hs *HandlerService) SaveProblem(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserId(c)
	if err != nil {
		return err
	}
	problemID, err := uuid.Parse(c.Params("problem_id"))
	if err != nil {
		return xerrors.BadRequestError("invalid problem_id")
	}
	if err := hs.storage.SaveProblem(c.Context(), uid, problemID); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

func (hs *HandlerService) UnsaveProblem(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserId(c)
	if err != nil {
		return err
	}
	problemID, err := uuid.Parse(c.Params("problem_id"))
	if err != nil {
		return xerrors.BadRequestError("invalid problem_id")
	}
	if err := hs.storage.UnsaveProblem(c.Context(), uid, problemID); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}
```

- [ ] **Step 3: Register routes**

In `backend/internal/handlers/routes.go`, add inside the `app.Route("/api", ...)` block after the settings route:

```go
		api.Route("/saved", func(saved fiber.Router) {
			saved.Use(middleware.RequireAuth(hs.keyfunc))
			saved.Get("/", hs.GetSavedProblems)
			saved.Post("/:problem_id", hs.SaveProblem)
			saved.Delete("/:problem_id", hs.UnsaveProblem)
		})
```

- [ ] **Step 4: Build and verify**

```bash
cd backend && go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/saved.go backend/internal/handlers/routes.go backend/internal/constants/routes.go
git commit -m "feat: add saved problems handlers and routes"
```

---

### Task 3: Frontend API + useSaved hook

**Files:**
- Modify: `frontend/src/api.ts`
- Create: `frontend/src/hooks/useSaved.ts`

- [ ] **Step 1: Add API functions to `frontend/src/api.ts`**

Add these three functions after the existing `getSettings`/`updateSettings` functions:

```ts
export async function getSavedProblems(): Promise<Problem[]> {
  const res = await fetch(`${API_URL}/api/saved`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch saved problems: ${res.status}`)
  return res.json()
}

export async function saveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to save problem: ${res.status}`)
}

export async function unsaveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to unsave problem: ${res.status}`)
}
```

- [ ] **Step 2: Create `frontend/src/hooks/useSaved.ts`**

```ts
import { useState, useEffect } from 'react'
import type { Problem } from '../types'
import { getSavedProblems, saveProblem, unsaveProblem } from '../api'
import type { Session } from '@supabase/supabase-js'

export function useSaved(session: Session | null): {
  savedProblems: Problem[]
  savedIds: Set<string>
  save: (problemId: string) => Promise<void>
  unsave: (problemId: string) => Promise<void>
  isSaved: (problemId: string) => boolean
} {
  const [savedProblems, setSavedProblems] = useState<Problem[]>([])

  useEffect(() => {
    if (!session) {
      setSavedProblems([])
      return
    }
    getSavedProblems().then(setSavedProblems).catch(() => {})
  }, [session])

  const savedIds = new Set(savedProblems.map(p => p.id))

  const save = async (problemId: string) => {
    setSavedProblems(prev => {
      if (prev.some(p => p.id === problemId)) return prev
      // optimistic: add a placeholder; real data comes on next load
      return prev
    })
    await saveProblem(problemId)
    getSavedProblems().then(setSavedProblems).catch(() => {})
  }

  const unsave = async (problemId: string) => {
    setSavedProblems(prev => prev.filter(p => p.id !== problemId))
    await unsaveProblem(problemId).catch(() => {
      getSavedProblems().then(setSavedProblems).catch(() => {})
    })
  }

  const isSaved = (problemId: string) => savedIds.has(problemId)

  return { savedProblems, savedIds, save, unsave, isSaved }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api.ts frontend/src/hooks/useSaved.ts
git commit -m "feat: add saved problems API functions and useSaved hook"
```

---

### Task 4: Frontend UI

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ProblemView.tsx`
- Modify: `frontend/src/components/SearchPage.tsx`

#### App.tsx

- [ ] **Step 1: Wire useSaved into App.tsx**

Add import after the existing hook imports:

```tsx
import { useSaved } from './hooks/useSaved'
```

Add after the `useTags()` call:

```tsx
  const { savedProblems, savedIds, save, unsave, isSaved } = useSaved(session)
```

Pass to ProblemView (inside `practiceView()`):

```tsx
        <ProblemView
          key={problem.id}
          problem={problem}
          onSkip={() => void loadNextProblem()}
          onRandom={() => void loadRandomNextProblem()}
          onBack={canGoBack ? goBack : undefined}
          onExitPlaylist={problemSource === 'search' ? exitPlaylist : undefined}
          playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
          hideTitle={hideTitle}
          isSaved={isSaved(problem.id)}
          onToggleSave={() => isSaved(problem.id) ? void unsave(problem.id) : void save(problem.id)}
          showSave={!!session}
        />
```

Pass to SearchPage:

```tsx
        ? <SearchPage
            onSelectProblem={selectProblem}
            searchState={searchState}
            onSearchStateChange={setSearchState}
            loading={searchLoading}
            error={searchError}
            availableTags={availableTags}
            tagsLoading={tagsLoading}
            tagsError={tagsError}
            savedIds={savedIds}
            savedProblems={savedProblems}
            onToggleSave={(id) => isSaved(id) ? void unsave(id) : void save(id)}
            showSave={!!session}
          />
```

#### ProblemView.tsx

- [ ] **Step 2: Add bookmark button to ProblemView**

Add new props to the interface:

```tsx
  isSaved?: boolean
  onToggleSave?: () => void
  showSave?: boolean
```

In the title row (the `<div className="flex items-start gap-2 mb-3">` section), add a bookmark button before the `onBack` button:

```tsx
          {showSave && onToggleSave && (
            <button
              onClick={e => { e.stopPropagation(); onToggleSave() }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors px-1"
              title={isSaved ? 'Remove bookmark' : 'Save for later'}
              aria-label={isSaved ? 'Remove bookmark' : 'Save for later'}
            >
              {isSaved ? '🔖' : '🔖'}
            </button>
          )}
```

Use filled/unfilled bookmark characters:

```tsx
              {isSaved ? '★' : '☆'}
```

#### SearchPage.tsx

- [ ] **Step 3: Add saved props to SearchPage**

Add to the `Props` interface:

```tsx
  savedIds: Set<string>
  savedProblems: Problem[]
  onToggleSave: (problemId: string) => void
  showSave: boolean
```

Add to the function signature:

```tsx
export function SearchPage({ onSelectProblem, searchState, onSearchStateChange, loading, error, availableTags, tagsLoading, tagsError, savedIds, savedProblems, onToggleSave, showSave }: Props) {
```

- [ ] **Step 4: Add "Saved" filter toggle to SearchPage**

Add a `showSaved` local state:

```tsx
  const [showSaved, setShowSaved] = useState(false)
```

After the difficulty filter row (`<div className="flex gap-2 mb-4">`), add a saved toggle (only shown when logged in):

```tsx
      {showSave && (
        <div className="mb-4">
          <button
            onClick={() => setShowSaved(s => !s)}
            className={cn(
              'px-3.5 py-1.5 text-sm rounded-md border cursor-pointer transition-colors',
              showSaved
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            ★ Saved
          </button>
        </div>
      )}
```

- [ ] **Step 5: Show saved problems list when showSaved is active**

When `showSaved` is true, bypass the normal results and show `savedProblems` instead. Replace the results rendering block:

For the results count area, add a condition:

```tsx
      {!showSaved && !error && hasSearched && total > 0 && (
        <div className="mb-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>{loading ? 'Searching...' : `Showing ${showingFrom}-${showingTo} of ${total}`}</p>
          <p>Page {page} of {totalPages}</p>
        </div>
      )}
      {showSaved && (
        <p className="mb-3 text-sm text-muted-foreground">{savedProblems.length} saved problem{savedProblems.length !== 1 ? 's' : ''}</p>
      )}
```

For the results list, add bookmark icon to each card and handle the saved view:

```tsx
      {!showSaved && !error && loading && !hasSearched && skeletonList}
      {!showSaved && !error && loading && hasSearched && skeletonList}
      {!showSaved && !error && !loading && hasSearched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No problems found.</p>
      )}
      {showSaved && savedProblems.length === 0 && (
        <p className="text-sm text-muted-foreground">No saved problems yet.</p>
      )}
      {(showSaved ? savedProblems : (!error && !loading ? results : [])).map(p => (
        <div
          key={p.id}
          className="p-4 rounded-md border border-border bg-muted hover:bg-secondary cursor-pointer mb-2 transition-colors"
        >
          <div className="flex items-center gap-2.5 mb-1.5">
            {p.leetcode_id != null && (
              <span className="text-xs text-muted-foreground font-normal">#{p.leetcode_id}</span>
            )}
            <span
              className="font-semibold text-sm flex-1"
              onClick={() => onSelectProblem(p, {
                q,
                difficulty,
                tags,
                tagMatch,
                page,
                pageSize: SEARCH_PAGE_SIZE,
                results: showSaved ? savedProblems : results,
                selectedIndex: (showSaved ? savedProblems : results).findIndex(r => r.id === p.id),
              })}
            >
              {p.title}
            </span>
            <span className={cn('text-xs font-semibold', difficultyTextClass[p.difficulty as Difficulty])}>
              {p.difficulty}
            </span>
            {showSave && (
              <button
                onClick={e => { e.stopPropagation(); onToggleSave(p.id) }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                title={savedIds.has(p.id) ? 'Remove bookmark' : 'Save for later'}
              >
                {savedIds.has(p.id) ? '★' : '☆'}
              </button>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {p.topic_tags.map(tag => (
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>
        </div>
      ))}
```

Also hide the pagination when `showSaved` is true:

```tsx
      {!showSaved && !error && totalPages > 1 && (
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/ProblemView.tsx frontend/src/components/SearchPage.tsx
git commit -m "feat: add bookmark UI to ProblemView and SearchPage"
```

---

## Manual step required

After Task 1 is complete, run this in the Supabase SQL editor:

```sql
CREATE TABLE IF NOT EXISTS saved_problems (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, problem_id)
);
```
