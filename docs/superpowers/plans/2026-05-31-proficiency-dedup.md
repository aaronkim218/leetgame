# Proficiency Session Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent users from artificially inflating proficiency scores by repeatedly completing the same problem — each (user, problem, topic, stage, calendar day) combination counts at most once.

**Architecture:** Add a `proficiency_sessions` append-only table with a unique constraint on `(user_id, problem_id, topic, stage, session_date)`. The `UpsertTopicProficiency` storage method gains a `problemID` parameter and uses a CTE: first insert into `proficiency_sessions` (ON CONFLICT DO NOTHING), then proceed with the EMA upsert only if the insert succeeded (i.e., the CTE returned a row). Everything is atomic in a single SQL statement — no application-level check needed.

**Tech Stack:** Go, PostgreSQL (pgx/v5), Supabase (for migration)

---

## File Map

| File | Change |
|------|--------|
| `backend/db/schema.sql` | Add `proficiency_sessions` table |
| `backend/internal/storage/storage.go` | Add `problemID uuid.UUID` to `UpsertTopicProficiency` signature |
| `backend/internal/storage/postgres/proficiency.go` | Rewrite SQL with CTE dedup; add `problemID` param |
| `backend/internal/handlers/chat.go` | Pass `problem.Id` to `UpsertTopicProficiency` |

---

## Task 1: Schema — add `proficiency_sessions` table

**Files:**
- Modify: `backend/db/schema.sql`

- [ ] **Step 1: Add the table definition**

Append to `backend/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS proficiency_sessions (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id   UUID NOT NULL REFERENCES problems(id)   ON DELETE CASCADE,
  topic        TEXT NOT NULL,
  stage        TEXT NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (user_id, problem_id, topic, stage, session_date)
);
```

The PRIMARY KEY doubles as the unique constraint — no separate `UNIQUE` index needed.

- [ ] **Step 2: Commit**

```bash
git add backend/db/schema.sql
git commit -m "feat: add proficiency_sessions dedup table to schema"
```

> **Note for deployer:** Run the following migration in Supabase SQL editor before deploying the backend:
> ```sql
> CREATE TABLE IF NOT EXISTS proficiency_sessions (
>   user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
>   problem_id   UUID NOT NULL REFERENCES problems(id)   ON DELETE CASCADE,
>   topic        TEXT NOT NULL,
>   stage        TEXT NOT NULL,
>   session_date DATE NOT NULL DEFAULT CURRENT_DATE,
>   PRIMARY KEY (user_id, problem_id, topic, stage, session_date)
> );
> ```

---

## Task 2: Storage interface — update `UpsertTopicProficiency` signature

**Files:**
- Modify: `backend/internal/storage/storage.go`

- [ ] **Step 1: Add `problemID uuid.UUID` parameter**

In `backend/internal/storage/storage.go`, change the `UpsertTopicProficiency` line from:

```go
UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error
```

to:

```go
UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error
```

- [ ] **Step 2: Verify build fails with expected error**

```bash
cd backend && go build ./... 2>&1
```

Expected: compile errors in `postgres/proficiency.go` and `handlers/chat.go` — they haven't been updated yet. This confirms the interface change is wired up correctly.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/storage/storage.go
git commit -m "feat: add problemID to UpsertTopicProficiency interface"
```

---

## Task 3: Storage implementation — CTE dedup SQL

**Files:**
- Modify: `backend/internal/storage/postgres/proficiency.go`

- [ ] **Step 1: Rewrite `UpsertTopicProficiency`**

Replace the entire file content with:

```go
package postgres

import (
	"context"

	"leetgame/internal/models"
	"leetgame/internal/utils"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (p *Postgres) UpsertTopicProficiency(ctx context.Context, userID uuid.UUID, problemID uuid.UUID, topic, stage string, sessionScore, scale, floor float64) error {
	const q = `
		WITH dedup AS (
			INSERT INTO proficiency_sessions (user_id, problem_id, topic, stage, session_date)
			VALUES ($1, $7, $2, $3, CURRENT_DATE)
			ON CONFLICT (user_id, problem_id, topic, stage, session_date) DO NOTHING
			RETURNING 1
		)
		INSERT INTO topic_proficiency (user_id, topic, stage, score, session_count, updated_at)
		SELECT $1, $2, $3, $4, 1, NOW()
		FROM dedup
		ON CONFLICT (user_id, topic, stage) DO UPDATE
		SET score         = topic_proficiency.score + GREATEST($5, $6 / sqrt(topic_proficiency.session_count::float + 1)) * ($4 - topic_proficiency.score),
		    session_count = topic_proficiency.session_count + 1,
		    updated_at    = NOW()`

	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, q, userID, topic, stage, sessionScore, floor, scale, problemID)
		return struct{}{}, err
	})
	return err
}

func (p *Postgres) GetTopicProficiencies(ctx context.Context, userID uuid.UUID) ([]models.TopicProficiency, error) {
	const q = `
		SELECT user_id, topic, stage, score, session_count, updated_at
		FROM topic_proficiency
		WHERE user_id = $1
		ORDER BY topic, stage`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.TopicProficiency, error) {
		rows, err := p.Pool.Query(ctx, q, userID)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.TopicProficiency])
	})
}
```

**How the CTE works:**
- `dedup` CTE: inserts a row into `proficiency_sessions`. If this (user, problem, topic, stage, today) already exists → `ON CONFLICT DO NOTHING` → CTE returns 0 rows.
- Outer INSERT: `SELECT ... FROM dedup` — if `dedup` returned 0 rows, the SELECT produces nothing → no insert or update happens on `topic_proficiency`. If `dedup` returned 1 row, the upsert proceeds as before.
- Parameter binding: `$1`=userID, `$2`=topic, `$3`=stage, `$4`=sessionScore, `$5`=floor, `$6`=scale, `$7`=problemID

- [ ] **Step 2: Run existing tests**

```bash
cd backend && go test ./internal/storage/postgres/... -v -run TestAdaptiveLR
```

Expected: all 6 tests pass (these test pure math helpers, unchanged by this task).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/storage/postgres/proficiency.go
git commit -m "feat: dedup proficiency updates via proficiency_sessions CTE"
```

---

## Task 4: Handler — pass problem ID to storage call

**Files:**
- Modify: `backend/internal/handlers/chat.go`

- [ ] **Step 1: Update `runSessionEvaluation` to accept and pass `problemID`**

In `backend/internal/handlers/chat.go`, find `runSessionEvaluation`. Change the storage call from:

```go
if err := hs.storage.UpsertTopicProficiency(ctx, userID, score.Topic, score.Stage, score.Score, dp.scale, dp.floor); err != nil {
```

to:

```go
if err := hs.storage.UpsertTopicProficiency(ctx, userID, problem.Id, score.Topic, score.Stage, score.Score, dp.scale, dp.floor); err != nil {
```

No other changes needed — `problem.Id` is already available in `runSessionEvaluation` via the `problem models.Problem` parameter.

- [ ] **Step 2: Verify build is clean**

```bash
cd backend && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 3: Run all tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handlers/chat.go
git commit -m "feat: pass problem ID to UpsertTopicProficiency for dedup"
```

---

## Self-Review

**Spec coverage:**
- ✅ `proficiency_sessions` table with unique constraint on (user, problem, topic, stage, date)
- ✅ Same problem same day → dedup blocks update atomically in SQL
- ✅ Different problem same day → passes through normally
- ✅ Same problem different day → passes through (CURRENT_DATE in the key)
- ✅ `UpsertTopicProficiency` signature updated throughout (interface + impl + callsite)
- ✅ Supabase migration noted for deployer

**Placeholder scan:** None found.

**Type consistency:** `problemID uuid.UUID` added consistently to interface (Task 2), implementation (Task 3), and callsite (Task 4).
