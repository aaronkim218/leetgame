# Active Topics Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users choose which topics to practice (defaulting to NeetCode 75 topics); smart practice samples only from active topics, and the stats page shows proficiency only for active topics — but scores are always calculated for everything.

**Architecture:** Add `active_topics TEXT[]` to `user_settings` (backend + schema). `GET/PUT /api/settings` includes `active_topics`. Smart practice handler filters `allTags` to active topics before sampling. Stats page fetches all tags, renders a collapsible topic picker, and filters its proficiency display. `useAuth` loads/persists `activeTopics` alongside existing `activeStages`. NeetCode topics are a shared constant on both backend and frontend.

**Tech Stack:** Go (Fiber, pgx), React (TypeScript), PostgreSQL

---

## File Map

| File | Change |
|------|--------|
| `backend/db/schema.sql` | Add `active_topics TEXT[]` to `user_settings` |
| `backend/internal/models/user_settings.go` | Add `ActiveTopics []string` field |
| `backend/internal/storage/postgres/user_settings.go` | NeetCode default; GET/UPSERT include `active_topics` |
| `backend/internal/storage/storage.go` | Update `UpsertUserSettings` interface signature |
| `backend/internal/handlers/settings.go` | Include `active_topics` in GET response and PUT body |
| `backend/internal/handlers/smart_practice.go` | Accept `active_topics` query param; filter tags before sampling |
| `frontend/src/types.ts` | Add `NEETCODE_TOPICS` constant |
| `frontend/src/api.ts` | Update `getSettings`, `updateSettings`, `getSmartPracticeProblem` |
| `frontend/src/hooks/useAuth.ts` | Add `activeTopics` state and `persistTopics` |
| `frontend/src/App.tsx` | Wire `activeTopics` to StatsPage and smart practice |
| `frontend/src/components/StatsPage.tsx` | Fetch all tags; topic picker UI; filter proficiency display |

---

## Task 1: DB schema — add `active_topics` column

**Files:**
- Modify: `backend/db/schema.sql`

- [ ] **Step 1: Add `active_topics` to `user_settings`**

In `backend/db/schema.sql`, change the `user_settings` table from:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title    BOOLEAN NOT NULL DEFAULT TRUE
);
```

to:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title    BOOLEAN NOT NULL DEFAULT TRUE,
  active_topics TEXT[]  NOT NULL DEFAULT '{}'
);
```

The `DEFAULT '{}'` (empty array) is intentional — the Go layer treats empty as "return NeetCode defaults," so existing users without a stored preference automatically get NeetCode topics.

- [ ] **Step 2: Commit**

```bash
git add backend/db/schema.sql
git commit -m "feat: add active_topics column to user_settings schema"
```

> **Supabase migration (run before deploying):**
> ```sql
> ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_topics TEXT[] NOT NULL DEFAULT '{}';
> ```

---

## Task 2: Backend model + storage + interface

**Files:**
- Modify: `backend/internal/models/user_settings.go`
- Modify: `backend/internal/storage/postgres/user_settings.go`
- Modify: `backend/internal/storage/storage.go`

- [ ] **Step 1: Write the failing test**

In `backend/internal/storage/postgres/user_settings_test.go` (create this file):

```go
package postgres

import (
	"testing"
)

func TestNeetcodeDefault(t *testing.T) {
	// When active_topics is empty, defaultActiveTopics should be returned
	if len(defaultActiveTopics) == 0 {
		t.Fatal("defaultActiveTopics must not be empty")
	}
	// Spot-check a few expected topics
	topicSet := make(map[string]bool, len(defaultActiveTopics))
	for _, t := range defaultActiveTopics {
		topicSet[t] = true
	}
	required := []string{"Array", "Dynamic Programming", "Graph", "Binary Search"}
	for _, r := range required {
		if !topicSet[r] {
			t.Errorf("expected %q in defaultActiveTopics", r)
		}
	}
}

func TestActiveTopicsDefault_WhenEmpty(t *testing.T) {
	// Simulate the Go-layer fallback: empty stored value → neetcode defaults
	stored := []string{}
	result := resolveActiveTopics(stored)
	if len(result) == 0 {
		t.Fatal("resolveActiveTopics(empty) must return neetcode defaults, got empty")
	}
}

func TestActiveTopicsDefault_WhenSet(t *testing.T) {
	// When a non-empty value is stored, return it as-is
	stored := []string{"Array", "Stack"}
	result := resolveActiveTopics(stored)
	if len(result) != 2 || result[0] != "Array" || result[1] != "Stack" {
		t.Errorf("resolveActiveTopics(non-empty) = %v, want %v", result, stored)
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && go test ./internal/storage/postgres/... -v -run TestNeetcode 2>&1 | head -20
```

Expected: compile error — `defaultActiveTopics` and `resolveActiveTopics` not yet defined.

- [ ] **Step 3: Update the model**

Replace `backend/internal/models/user_settings.go`:

```go
package models

import "github.com/google/uuid"

type UserSettings struct {
	UserID       uuid.UUID `json:"user_id"       db:"user_id"`
	ActiveStages []string  `json:"active_stages" db:"active_stages"`
	HideTitle    bool      `json:"hide_title"    db:"hide_title"`
	ActiveTopics []string  `json:"active_topics" db:"active_topics"`
}
```

- [ ] **Step 4: Update the storage implementation**

Replace `backend/internal/storage/postgres/user_settings.go`:

```go
package postgres

import (
	"context"
	"errors"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var defaultActiveStages = []string{"pattern", "algorithm", "tc_sc"}

var defaultActiveTopics = []string{
	"Array", "Hash Table", "Two Pointers", "Sliding Window",
	"Stack", "Binary Search", "Linked List",
	"Tree", "Binary Tree", "Binary Search Tree",
	"Trie", "Heap (Priority Queue)", "Backtracking",
	"Graph", "Depth-First Search", "Breadth-First Search", "Union Find",
	"Dynamic Programming", "Greedy", "Intervals", "Math", "Bit Manipulation",
	"Matrix",
}

// resolveActiveTopics returns the stored topics if non-empty, or the NeetCode defaults.
func resolveActiveTopics(stored []string) []string {
	if len(stored) > 0 {
		return stored
	}
	return defaultActiveTopics
}

func (p *Postgres) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	const sql = `SELECT user_id, active_stages, hide_title, active_topics FROM user_settings WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (models.UserSettings, error) {
		row, err := p.Pool.Query(ctx, sql, userID)
		if err != nil {
			return models.UserSettings{}, err
		}
		s, err := pgx.CollectOneRow(row, pgx.RowToStructByName[models.UserSettings])
		if errors.Is(err, pgx.ErrNoRows) {
			return models.UserSettings{
				UserID:       userID,
				ActiveStages: defaultActiveStages,
				HideTitle:    true,
				ActiveTopics: defaultActiveTopics,
			}, nil
		}
		if err != nil {
			return models.UserSettings{}, err
		}
		s.ActiveTopics = resolveActiveTopics(s.ActiveTopics)
		return s, nil
	})
}

func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, activeTopics []string) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages, hide_title, active_topics)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id) DO UPDATE
		SET active_stages = EXCLUDED.active_stages,
		    hide_title    = EXCLUDED.hide_title,
		    active_topics = EXCLUDED.active_topics
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages, hideTitle, activeTopics)
		return struct{}{}, err
	})
	return err
}
```

- [ ] **Step 5: Update the Storage interface**

In `backend/internal/storage/storage.go`, change:

```go
UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool) error
```

to:

```go
UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, activeTopics []string) error
```

- [ ] **Step 6: Run the tests**

```bash
cd backend && go test ./internal/storage/postgres/... -v -run TestNeetcode
```

Expected:
```
--- PASS: TestNeetcodeDefault (0.00s)
--- PASS: TestActiveTopicsDefault_WhenEmpty (0.00s)
--- PASS: TestActiveTopicsDefault_WhenSet (0.00s)
PASS
```

- [ ] **Step 7: Verify build fails with expected callsite errors**

```bash
cd backend && go build ./... 2>&1
```

Expected: compile errors in `handlers/settings.go` — `UpsertUserSettings` called with wrong number of args. This is intentional; Task 3 fixes it.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/models/user_settings.go \
        backend/internal/storage/postgres/user_settings.go \
        backend/internal/storage/postgres/user_settings_test.go \
        backend/internal/storage/storage.go
git commit -m "feat: add active_topics to UserSettings model, storage, and interface"
```

---

## Task 3: Backend handler — settings GET/PUT

**Files:**
- Modify: `backend/internal/handlers/settings.go`

- [ ] **Step 1: Update `GetSettings` and `UpdateSettings`**

Replace `backend/internal/handlers/settings.go`:

```go
package handlers

import (
	"leetgame/internal/constants"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetSettings(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	settings, err := hs.storage.GetUserSettings(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		ActiveStages []string `json:"active_stages"`
		HideTitle    bool     `json:"hide_title"`
		ActiveTopics []string `json:"active_topics"`
	}
	return c.JSON(response{
		ActiveStages: settings.ActiveStages,
		HideTitle:    settings.HideTitle,
		ActiveTopics: settings.ActiveTopics,
	})
}

func (hs *HandlerService) UpdateSettings(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	type request struct {
		ActiveStages []string `json:"active_stages"`
		HideTitle    bool     `json:"hide_title"`
		ActiveTopics []string `json:"active_topics"`
	}
	var req request
	if err := c.BodyParser(&req); err != nil {
		return xerrors.InvalidJSON()
	}

	if errs := validateActiveStages(req.ActiveStages); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}
	if len(req.ActiveTopics) == 0 {
		return xerrors.UnprocessableEntityError(map[string]string{
			"active_topics": "must contain at least one topic",
		})
	}

	if err := hs.storage.UpsertUserSettings(c.Context(), uid, req.ActiveStages, req.HideTitle, req.ActiveTopics); err != nil {
		return err
	}

	return c.SendStatus(200)
}

func validateActiveStages(stages []string) map[string]string {
	errs := map[string]string{}
	if len(stages) == 0 {
		errs["active_stages"] = "must contain at least one stage"
		return errs
	}
	seen := map[string]bool{}
	prevIdx := -1
	for _, s := range stages {
		if !constants.ValidStageIDs[s] {
			errs["active_stages"] = "invalid stage: " + s
			return errs
		}
		if seen[s] {
			errs["active_stages"] = "duplicate stage: " + s
			return errs
		}
		seen[s] = true
		idx := constants.CanonicalStageIndex(s)
		if idx <= prevIdx {
			errs["active_stages"] = "stages must be in canonical order: edge_cases, brute_force, pattern, algorithm, tc_sc"
			return errs
		}
		prevIdx = idx
	}
	return errs
}
```

- [ ] **Step 2: Verify clean build**

```bash
cd backend && go build ./...
```

Expected: no output.

- [ ] **Step 3: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/settings.go
git commit -m "feat: include active_topics in settings GET and PUT"
```

---

## Task 4: Backend smart practice — filter by active topics

**Files:**
- Modify: `backend/internal/handlers/smart_practice.go`
- Modify: `backend/internal/handlers/smart_practice_test.go` (if exists, else create)

- [ ] **Step 1: Write the failing test**

Check if `backend/internal/handlers/smart_practice_test.go` exists. If not, create it. Add:

```go
package handlers

import (
	"testing"

	"leetgame/internal/models"
	"leetgame/internal/types"
)

func TestFilterTagsByActiveTopics(t *testing.T) {
	allTags := []types.ProblemTag{
		{Name: "Array"},
		{Name: "Graph"},
		{Name: "Brain Teaser"},
		{Name: "Geometry"},
	}
	activeTopics := []string{"Array", "Graph"}

	got := filterTagsByActiveTopics(allTags, activeTopics)
	if len(got) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(got))
	}
	if got[0].Name != "Array" || got[1].Name != "Graph" {
		t.Errorf("unexpected tags: %v", got)
	}
}

func TestFilterTagsByActiveTopics_EmptyFilter(t *testing.T) {
	allTags := []types.ProblemTag{
		{Name: "Array"},
		{Name: "Graph"},
	}
	// Empty active topics → return all tags unchanged
	got := filterTagsByActiveTopics(allTags, []string{})
	if len(got) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(got))
	}
}

func TestComputeTopicWeights_WithActiveTopics(t *testing.T) {
	proficiencies := []models.TopicProficiency{
		{Topic: "Array", Stage: "pattern", Score: 0.8},
		{Topic: "Graph", Stage: "pattern", Score: 0.2},
		{Topic: "Brain Teaser", Stage: "pattern", Score: 0.5},
	}
	// Only Array and Graph are active — Brain Teaser should not appear in weights
	tags := []types.ProblemTag{{Name: "Array"}, {Name: "Graph"}}
	weights := computeTopicWeights(proficiencies, tags, []string{"pattern"})
	if len(weights) != 2 {
		t.Fatalf("expected 2 weights, got %d", len(weights))
	}
	// Graph (score=0.2) should have higher weight than Array (score=0.8)
	graphW, arrayW := 0.0, 0.0
	for _, w := range weights {
		if w.Topic == "Graph" { graphW = w.Weight }
		if w.Topic == "Array" { arrayW = w.Weight }
	}
	if graphW <= arrayW {
		t.Errorf("Graph weight (%f) should be > Array weight (%f)", graphW, arrayW)
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && go test ./internal/handlers/... -v -run TestFilterTags 2>&1 | head -20
```

Expected: compile error — `filterTagsByActiveTopics` not yet defined.

- [ ] **Step 3: Add `filterTagsByActiveTopics` and update `GetSmartPracticeProblem`**

Replace `backend/internal/handlers/smart_practice.go`:

```go
package handlers

import (
	"errors"
	"math/rand"
	"net/http"
	"strings"

	"leetgame/internal/models"
	"leetgame/internal/types"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

type topicWeight struct {
	Topic  string
	Weight float64
}

// computeTopicWeights returns an inverse-proficiency weight for each available topic.
// Topics with no proficiency data default to score 0.0 (cold start → maximum weight).
// If all weights are zero (perfect scores everywhere), returns uniform weights.
func computeTopicWeights(proficiencies []models.TopicProficiency, tags []types.ProblemTag, activeStages []string) []topicWeight {
	scoreMap := make(map[string]float64)
	for _, p := range proficiencies {
		scoreMap[p.Topic+"|"+p.Stage] = p.Score
	}

	weights := make([]topicWeight, 0, len(tags))
	for _, tag := range tags {
		var total float64
		for _, stage := range activeStages {
			total += scoreMap[tag.Name+"|"+stage] // missing = 0.0
		}
		avg := total / float64(len(activeStages))
		weights = append(weights, topicWeight{Topic: tag.Name, Weight: 1.0 - avg})
	}

	// If all weights are zero, use uniform
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	if sum == 0 {
		for i := range weights {
			weights[i].Weight = 1.0
		}
	}

	return weights
}

// sampleTopic picks one topic from weights using weighted random sampling.
func sampleTopic(weights []topicWeight) string {
	if len(weights) == 0 {
		return ""
	}
	var sum float64
	for _, w := range weights {
		sum += w.Weight
	}
	r := rand.Float64() * sum
	for _, w := range weights {
		r -= w.Weight
		if r <= 0 {
			return w.Topic
		}
	}
	return weights[len(weights)-1].Topic
}

// filterTagsByActiveTopics returns only the tags whose names are in activeTopics.
// If activeTopics is empty, all tags are returned unchanged.
func filterTagsByActiveTopics(tags []types.ProblemTag, activeTopics []string) []types.ProblemTag {
	if len(activeTopics) == 0 {
		return tags
	}
	topicSet := make(map[string]bool, len(activeTopics))
	for _, t := range activeTopics {
		topicSet[t] = true
	}
	filtered := make([]types.ProblemTag, 0, len(activeTopics))
	for _, tag := range tags {
		if topicSet[tag.Name] {
			filtered = append(filtered, tag)
		}
	}
	return filtered
}

func (hs *HandlerService) GetSmartPracticeProblem(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	stagesParam := strings.TrimSpace(c.Query("active_stages"))
	if stagesParam == "" {
		return xerrors.BadRequestError("active_stages is required")
	}
	var activeStages []string
	for s := range strings.SplitSeq(stagesParam, ",") {
		if t := strings.TrimSpace(s); t != "" {
			activeStages = append(activeStages, t)
		}
	}
	if len(activeStages) == 0 {
		return xerrors.BadRequestError("active_stages must contain at least one non-empty value")
	}

	var activeTopics []string
	if topicsParam := strings.TrimSpace(c.Query("active_topics")); topicsParam != "" {
		for t := range strings.SplitSeq(topicsParam, ",") {
			if t := strings.TrimSpace(t); t != "" {
				activeTopics = append(activeTopics, t)
			}
		}
	}

	allTags, err := hs.storage.GetProblemTags(c.Context())
	if err != nil {
		return err
	}
	allTags = filterTagsByActiveTopics(allTags, activeTopics)

	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}

	weights := computeTopicWeights(proficiencies, allTags, activeStages)
	if len(weights) == 0 {
		problem, err := hs.storage.GetRandomProblem(c.Context())
		if err != nil {
			return err
		}
		return c.Status(http.StatusOK).JSON(problem)
	}
	sampledTopic := sampleTopic(weights)

	problem, err := hs.storage.GetRandomProblemFiltered(c.Context(), "", "", []string{sampledTopic}, "or", "")
	if err != nil {
		var httpErr xerrors.HTTPError
		if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotFound {
			problem, err = hs.storage.GetRandomProblem(c.Context())
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}

	return c.Status(http.StatusOK).JSON(problem)
}

func (hs *HandlerService) GetProficiency(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}
	proficiencies, err := hs.storage.GetTopicProficiencies(c.Context(), uid)
	if err != nil {
		return err
	}
	return c.Status(http.StatusOK).JSON(proficiencies)
}
```

- [ ] **Step 4: Run the tests**

```bash
cd backend && go test ./internal/handlers/... -v -run "TestFilterTags|TestComputeTopicWeights_WithActiveTopics"
```

Expected:
```
--- PASS: TestFilterTagsByActiveTopics (0.00s)
--- PASS: TestFilterTagsByActiveTopics_EmptyFilter (0.00s)
--- PASS: TestComputeTopicWeights_WithActiveTopics (0.00s)
PASS
```

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handlers/smart_practice.go \
        backend/internal/handlers/smart_practice_test.go
git commit -m "feat: filter smart practice by active_topics query param"
```

---

## Task 5: Frontend types + API

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add `NEETCODE_TOPICS` to types**

In `frontend/src/types.ts`, add after the existing constants:

```ts
export const NEETCODE_TOPICS: string[] = [
  'Array', 'Hash Table', 'Two Pointers', 'Sliding Window',
  'Stack', 'Binary Search', 'Linked List',
  'Tree', 'Binary Tree', 'Binary Search Tree',
  'Trie', 'Heap (Priority Queue)', 'Backtracking',
  'Graph', 'Depth-First Search', 'Breadth-First Search', 'Union Find',
  'Dynamic Programming', 'Greedy', 'Intervals', 'Math', 'Bit Manipulation',
  'Matrix',
]
```

- [ ] **Step 2: Update `getSettings` in `api.ts`**

Change the return type and response parsing for `getSettings`:

```ts
export async function getSettings(): Promise<{ active_stages: ActiveStage[]; hide_title: boolean; active_topics: string[] }> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Update `updateSettings` in `api.ts`**

```ts
export async function updateSettings(activeStages: ActiveStage[], hideTitle: boolean, activeTopics: string[]): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ active_stages: activeStages, hide_title: hideTitle, active_topics: activeTopics }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
```

- [ ] **Step 4: Update `getSmartPracticeProblem` in `api.ts`**

```ts
export async function getSmartPracticeProblem(activeStages: ActiveStage[], activeTopics: string[]): Promise<Problem> {
  const params = new URLSearchParams()
  params.set('active_stages', activeStages.join(','))
  if (activeTopics.length) params.set('active_topics', activeTopics.join(','))
  const res = await fetch(`${API_URL}/api/problems/smart?${params.toString()}`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch smart practice problem: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors in `useAuth.ts` and `App.tsx` (callers of `updateSettings` and `getSmartPracticeProblem` haven't been updated yet). These are fixed in Tasks 6 and 7.

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: add NEETCODE_TOPICS constant and active_topics to settings/smart-practice API"
```

---

## Task 6: Frontend useAuth — add activeTopics state

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Replace `useAuth.ts`**

```ts
import { useState, useEffect } from 'react'
import type { ActiveStage } from '../types'
import { DEFAULT_STAGES, NEETCODE_TOPICS } from '../types'
import { getStreak, recordStreak, getSettings, updateSettings } from '../api'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [streak, setStreak] = useState<number | null>(null)
  const [activeStages, setActiveStages] = useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [activeTopics, setActiveTopics] = useState<string[]>(NEETCODE_TOPICS)
  const [settingsReady, setSettingsReady] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setAuthLoading(false)
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          getStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
          getSettings()
            .then(({ active_stages, hide_title, active_topics }) => {
              setActiveStages(active_stages)
              setHideTitle(hide_title)
              setActiveTopics(active_topics)
            })
            .catch(() => {})
            .finally(() => setSettingsReady(true))
        } else {
          setStreak(null)
          applyLocalSettings()
          setSettingsReady(true)
        }
      } else if (event === 'SIGNED_OUT') {
        setStreak(null)
        setActiveTopics(NEETCODE_TOPICS)
        applyLocalSettings()
        setSettingsReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function applyLocalSettings() {
    const stored = localStorage.getItem('leetgame_active_stages')
    let stages = DEFAULT_STAGES
    if (stored) {
      try { stages = JSON.parse(stored) as ActiveStage[] } catch { /* use default */ }
    }
    const storedHideTitle = localStorage.getItem('leetgame_hide_title')
    setActiveStages(stages)
    setHideTitle(storedHideTitle === null ? true : storedHideTitle === 'true')
  }

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      updateSettings(stages, hideTitle, activeTopics).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch { /* ignore */ }
    }
  }

  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    if (session) {
      updateSettings(activeStages, value, activeTopics).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_hide_title', String(value))
      } catch { /* ignore */ }
    }
  }

  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    if (session) {
      updateSettings(activeStages, hideTitle, topics).catch(() => {})
    }
  }

  const recordAndUpdateStreak = () => {
    recordStreak().then(({ streak }) => setStreak(streak)).catch(() => {})
  }

  return {
    session,
    authLoading,
    streak,
    activeStages,
    hideTitle,
    activeTopics,
    settingsReady,
    persistStages,
    persistHideTitle,
    persistTopics,
    recordAndUpdateStreak,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles (App.tsx errors expected)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in `App.tsx` (hasn't been updated yet). This is expected.

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/src/hooks/useAuth.ts
git commit -m "feat: add activeTopics and persistTopics to useAuth"
```

---

## Task 7: Frontend App.tsx — wire activeTopics

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Destructure `activeTopics` and `persistTopics` from `useAuth`**

In `App.tsx`, find:

```ts
const { session, authLoading, streak, activeStages, hideTitle, settingsReady, persistStages, persistHideTitle, recordAndUpdateStreak } = useAuth()
```

Change to:

```ts
const { session, authLoading, streak, activeStages, hideTitle, activeTopics, settingsReady, persistStages, persistHideTitle, persistTopics, recordAndUpdateStreak } = useAuth()
```

- [ ] **Step 2: Pass `activeTopics` to `loadSmartPracticeProblem`**

Find `loadSmartPracticeProblem`:

```ts
const loadSmartPracticeProblem = async () => {
  try {
    pushSnapshot()
    setError(null)
    setPlaylistExhausted(false)
    const p = await getSmartPracticeProblem(activeStages)
```

Change to:

```ts
const loadSmartPracticeProblem = async () => {
  try {
    pushSnapshot()
    setError(null)
    setPlaylistExhausted(false)
    const p = await getSmartPracticeProblem(activeStages, activeTopics)
```

- [ ] **Step 3: Pass `activeTopics` and `persistTopics` to `StatsPage`**

Find the `StatsPage` render:

```tsx
: <StatsPage onSmartPractice={session ? () => { void loadSmartPracticeProblem(); setView('practice') } : undefined} />
```

Change to:

```tsx
: <StatsPage
    onSmartPractice={session ? () => { void loadSmartPracticeProblem(); setView('practice') } : undefined}
    activeTopics={activeTopics}
    onTopicsChange={persistTopics}
  />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in `StatsPage.tsx` (hasn't been updated yet).

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/App.tsx
git commit -m "feat: wire activeTopics to smart practice and StatsPage"
```

---

## Task 8: Frontend StatsPage — topic picker + filtered display

**Files:**
- Modify: `frontend/src/components/StatsPage.tsx`

- [ ] **Step 1: Replace `StatsPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { TopicProficiency, ProblemTag } from '../types'
import { getProficiency, getProblemTags } from '../api'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

const stageLabel: Record<string, string> = {
  edge_cases:  'Edge Cases',
  brute_force: 'Brute Force',
  pattern:     'Pattern',
  algorithm:   'Algorithm',
  tc_sc:       'Time & Space',
}

export function StatsPage({
  onSmartPractice,
  activeTopics,
  onTopicsChange,
}: {
  onSmartPractice?: () => void
  activeTopics: string[]
  onTopicsChange: (topics: string[]) => void
}) {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [allTags, setAllTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [topicPickerOpen, setTopicPickerOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getProficiency(controller.signal),
      getProblemTags(controller.signal),
    ])
      .then(([prof, tags]) => {
        if (!controller.signal.aborted) {
          setProficiencies(prof)
          setAllTags(tags)
          setFetchError(false)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setFetchError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  const toggleTopic = (name: string) => {
    const next = activeTopics.includes(name)
      ? activeTopics.filter(t => t !== name)
      : [...activeTopics, name]
    if (next.length > 0) onTopicsChange(next)
  }

  const topicPicker = (
    <div className="mb-6">
      <button
        onClick={() => setTopicPickerOpen(o => !o)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {topicPickerOpen ? '▾' : '▸'} Manage topics ({activeTopics.length} of {allTags.length} active)
      </button>
      {topicPickerOpen && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allTags.map(tag => {
            const active = activeTopics.includes(tag.name)
            return (
              <button
                key={tag.name}
                onClick={() => toggleTopic(tag.name)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground"
                )}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-sm text-muted-foreground">Failed to load stats. Please sign in and try again.</p>
        </div>
      </div>
    )
  }

  // Filter proficiencies to active topics only
  const activeSet = new Set(activeTopics)
  const filtered = proficiencies.filter(p => activeSet.has(p.topic))

  if (filtered.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Topic Proficiency</h2>
            {onSmartPractice && (
              <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
            )}
          </div>
          {topicPicker}
          <p className="text-sm text-muted-foreground">Complete a practice session to see your scores.</p>
        </div>
      </div>
    )
  }

  // Group by topic, compute avg per topic for sorting
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of filtered) {
    const existing = topicMap.get(p.topic) ?? []
    topicMap.set(p.topic, [...existing, p])
  }

  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg) // weakest first

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Topic Proficiency</h2>
          {onSmartPractice && (
            <Button size="sm" onClick={onSmartPractice}>Practice Weakest Topics</Button>
          )}
        </div>
        {topicPicker}
        <div className="flex flex-col gap-4">
          {topics.map(({ topic, rows }) => (
            <div key={topic} className="rounded-md border border-border bg-muted p-4">
              <p className="text-sm font-semibold mb-3">{topic}</p>
              <div className="flex flex-col gap-2">
                {rows.map(row => (
                  <div key={row.stage} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0">
                      {stageLabel[row.stage] ?? row.stage}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          row.score >= 0.7 ? "bg-green-500" :
                          row.score >= 0.4 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${Math.round(row.score * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right shrink-0">
                      {Math.round(row.score * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the frontend dev server and verify manually**

```bash
cd frontend && npm run dev
```

Open the app. Sign in. Navigate to Stats page. Verify:
- "▸ Manage topics (N of M active)" appears below the header
- Clicking it expands the topic picker with all DB topics as pill buttons
- NeetCode topics are filled (active), niche topics are outlined (inactive)
- Clicking a topic toggles it
- The proficiency cards below only show topics that are active
- Navigate to a problem and click "Practice Weakest Topics" — should sample only from active topics

- [ ] **Step 4: Commit**

```bash
cd .. && git add frontend/src/components/StatsPage.tsx
git commit -m "feat: topic picker on stats page with active topic filtering"
```

---

## Self-Review

**Spec coverage:**
- ✅ `active_topics` column in `user_settings` schema
- ✅ NeetCode 75 topics as default for new users (empty stored array → NeetCode defaults)
- ✅ Existing users with no `active_topics` row get NeetCode defaults via `resolveActiveTopics`
- ✅ `GET /api/settings` returns `active_topics`
- ✅ `PUT /api/settings` persists `active_topics` with at-least-one validation
- ✅ Smart practice filters by `active_topics` query param (empty = all topics, backward compatible)
- ✅ Stats page shows all DB topics in picker (NeetCode active, others inactive by default)
- ✅ Stats page proficiency display filtered to active topics only
- ✅ Proficiency scores still calculated for all topics (evaluation unchanged)
- ✅ `useAuth` loads/persists `activeTopics` alongside `activeStages`

**Placeholder scan:** None found.

**Type consistency:**
- `activeTopics: string[]` used consistently across `useAuth`, `App.tsx`, `StatsPage`, `api.ts`
- `NEETCODE_TOPICS` defined in `types.ts`, imported in `useAuth.ts`
- `filterTagsByActiveTopics` defined and tested before use in handler
- `UpsertUserSettings` updated in interface, implementation, and callsite in Task 3

**Supabase migration needed before deploy:**
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS active_topics TEXT[] NOT NULL DEFAULT '{}';
```
