# Trend Chart Time Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 1M/3M/6M/1Y/All window selector for the Stats page trend charts, backed by a windowed history endpoint, per-window client caching, and forever-retention with weekly thinning of old snapshots.

**Architecture:** Backend: swap the delete-after-90-days pg_cron job for a keep-Mondays thinning job, and parametrize `GET /api/proficiency/history` with `?window=`. Frontend: `useStats` grows a `Map<TrendWindow, ProficiencySnapshot[]>` cache under the existing generation guard; `StatsPage` gets a segmented text control persisted in localStorage.

**Tech Stack:** Go + Fiber **v3** (`c fiber.Ctx`, `c.Query(...)`, `c.RequestCtx()`) + pgx; React 19 + TypeScript + Vitest/`renderHook`; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-trend-windows-design.md`

## Global Constraints

- Window values: exactly `1m|3m|6m|1y|all` mapping to 30/90/180/365/0 days (0 = no filter). Default (missing/empty param) = `1m`. Invalid → 400 via `xerrors.BadRequestError`.
- Retention: daily snapshots for the most recent 90 days; strictly one per week (Mondays, `EXTRACT(ISODOW ...) = 1`) older than that. Never delete Mondays.
- Frontend cache rules carry over from the stats-caching spec: in-memory only; a failed fetch never populates the cache; invalidation only via `invalidateStatsCache()` (session completion + `SIGNED_OUT`); the `cacheGeneration` guard must cover the new map writes.
- Proficiency is fetched at most once per cache lifetime regardless of window switches.
- localStorage key `leetgame_trend_window`; unrecognized values fall back to `1m`.
- No client-side downsampling. `buildChartData` unchanged.
- No new dependencies. Backend files snake_case; Go handler tests are pure-function tests (see `smart_practice_test.go`).
- Commands run from `backend/` or `frontend/` as noted. The repo pre-commit hook runs frontend lint+format+build and backend gofumpt+lint+build+test; the task isn't done until the commit lands.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Snapshot retention — thinning cron job

**Files:**
- Modify: `backend/db/schema.sql:88-94` (the `cleanup-proficiency-snapshots` block)

**Interfaces:**
- Consumes: existing `proficiency_score_snapshots` table and pg_cron.
- Produces: cron jobs `thin-proficiency-snapshots` (new) and the removal of `cleanup-proficiency-snapshots`. No Go code touched.

- [ ] **Step 1: Replace the cleanup block**

In `backend/db/schema.sql`, replace this block:

```sql
-- cleanup: delete snapshots older than 90 days at 3:30am UTC
SELECT cron.schedule('cleanup-proficiency-snapshots', '30 3 * * *', $$
  DELETE FROM proficiency_score_snapshots WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-snapshots'
);
```

with:

```sql
-- migrate: unschedule the old delete-after-90-days job (replaced by thinning)
SELECT cron.unschedule('cleanup-proficiency-snapshots')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-proficiency-snapshots'
);

-- thinning at 3:30am UTC: older than 90 days, keep one snapshot/week (Mondays)
SELECT cron.schedule('thin-proficiency-snapshots', '30 3 * * *', $$
  DELETE FROM proficiency_score_snapshots
  WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
    AND EXTRACT(ISODOW FROM snapshot_date) <> 1
$$)
WHERE NOT EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'thin-proficiency-snapshots'
);
```

- [ ] **Step 2: Sanity-check the SQL locally (if a local Postgres with pg_cron is available)**

If the local dev database has pg_cron: `psql "$STORAGE_DB_URL" -f backend/db/schema.sql` and then `SELECT jobname FROM cron.job;` — expect `thin-proficiency-snapshots` present and `cleanup-proficiency-snapshots` absent. If no local pg_cron, state that in the report; the SQL is declarative and the review gate covers it.

- [ ] **Step 3: Commit**

```bash
git add backend/db/schema.sql
git commit -m "feat(db): thin old proficiency snapshots weekly instead of deleting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Deploy note for the report:** the old cron job is registered in the production DB; schema.sql must be re-run against it to swap the jobs.

---

### Task 2: Windowed history endpoint

**Files:**
- Modify: `backend/internal/handlers/proficiency.go` (whole current file shown below)
- Modify: `backend/internal/storage/postgres/proficiency.go:53-68` (`GetProficiencyHistory`)
- Modify: `backend/internal/storage/storage.go:39` (interface line)
- Modify: `backend/internal/storage/processcache/process_cache.go:300-302` (passthrough)
- Test: `backend/internal/handlers/proficiency_test.go` (new)

**Interfaces:**
- Consumes: existing `models.ProficiencySnapshot`, `utils.Retry`, `xerrors.BadRequestError(msg string)`.
- Produces: `GetProficiencyHistory(ctx context.Context, userID uuid.UUID, days int) ([]models.ProficiencySnapshot, error)` across interface/postgres/processcache (days=0 means unbounded); handler accepts `?window=`; unexported `parseTrendWindow(s string) (int, error)`. Task 3's frontend sends `window=<1m|3m|6m|1y|all>`.

- [ ] **Step 1: Write the failing test**

Create `backend/internal/handlers/proficiency_test.go`:

```go
package handlers

import "testing"

func TestParseTrendWindow(t *testing.T) {
	cases := []struct {
		in      string
		days    int
		wantErr bool
	}{
		{"", 30, false},
		{"1m", 30, false},
		{"3m", 90, false},
		{"6m", 180, false},
		{"1y", 365, false},
		{"all", 0, false},
		{"2w", 0, true},
		{"junk", 0, true},
		{"1M", 0, true},
	}
	for _, tc := range cases {
		days, err := parseTrendWindow(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Errorf("parseTrendWindow(%q): expected error, got days=%d", tc.in, days)
			}
			continue
		}
		if err != nil {
			t.Errorf("parseTrendWindow(%q): unexpected error: %v", tc.in, err)
			continue
		}
		if days != tc.days {
			t.Errorf("parseTrendWindow(%q) = %d, want %d", tc.in, days, tc.days)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`): `go test ./internal/handlers/ -run TestParseTrendWindow -v`
Expected: compile error — `parseTrendWindow` undefined.

- [ ] **Step 3: Implement handler + storage changes**

Replace `backend/internal/handlers/proficiency.go` with:

```go
package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v3"
)

var trendWindowDays = map[string]int{
	"1m": 30,
	"3m": 90,
	"6m": 180,
	"1y": 365,
	"all": 0,
}

func parseTrendWindow(s string) (int, error) {
	if s == "" {
		s = "1m"
	}
	days, ok := trendWindowDays[s]
	if !ok {
		return 0, xerrors.BadRequestError("window must be one of 1m, 3m, 6m, 1y, all")
	}
	return days, nil
}

func (hs *HandlerService) GetProficiencyHistory(c fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return err
	}

	days, err := parseTrendWindow(c.Query("window"))
	if err != nil {
		return err
	}

	snapshots, err := hs.storage.GetProficiencyHistory(c.RequestCtx(), uid, days)
	if err != nil {
		return err
	}

	type snapshotResponse struct {
		Topic        string  `json:"topic"`
		Stage        string  `json:"stage"`
		Score        float64 `json:"score"`
		SnapshotDate string  `json:"snapshot_date"`
	}

	resp := make([]snapshotResponse, len(snapshots))
	for i, s := range snapshots {
		resp[i] = snapshotResponse{
			Topic:        s.Topic,
			Stage:        s.Stage,
			Score:        s.Score,
			SnapshotDate: s.SnapshotDate.Format("2006-01-02"),
		}
	}

	type response struct {
		History []snapshotResponse `json:"history"`
	}
	return c.JSON(response{History: resp})
}

// fiber:context-methods migrated
```

(`xerrors.BadRequestError(message string) HTTPError` — `HTTPError` implements `error`, so returning it from `parseTrendWindow`'s `(int, error)` signature works as written.)

In `backend/internal/storage/postgres/proficiency.go`, replace `GetProficiencyHistory` (lines 53-68) with:

```go
func (p *Postgres) GetProficiencyHistory(ctx context.Context, userID uuid.UUID, days int) ([]models.ProficiencySnapshot, error) {
	const q = `
		SELECT topic, stage, score, snapshot_date
		FROM proficiency_score_snapshots
		WHERE user_id = $1
		  AND ($2 = 0 OR snapshot_date >= CURRENT_DATE - make_interval(days => $2))
		ORDER BY topic, stage, snapshot_date ASC`

	return utils.Retry(ctx, func(ctx context.Context) ([]models.ProficiencySnapshot, error) {
		rows, err := p.Pool.Query(ctx, q, userID, days)
		if err != nil {
			return nil, err
		}
		return pgx.CollectRows(rows, pgx.RowToStructByName[models.ProficiencySnapshot])
	})
}
```

In `backend/internal/storage/storage.go` line 39, change the interface method to:

```go
	GetProficiencyHistory(ctx context.Context, userID uuid.UUID, days int) ([]models.ProficiencySnapshot, error)
```

In `backend/internal/storage/processcache/process_cache.go` lines 300-302, change the passthrough to:

```go
func (c *CachedStorage) GetProficiencyHistory(ctx context.Context, userID uuid.UUID, days int) ([]models.ProficiencySnapshot, error) {
	return c.inner.GetProficiencyHistory(ctx, userID, days)
}
```

If `go build ./...` reveals any other implementor of the `Storage` interface (e.g. a test fake), update its signature identically.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `go build ./... && go test ./...`
Expected: build clean, all packages pass, `TestParseTrendWindow` PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handlers/proficiency.go backend/internal/handlers/proficiency_test.go backend/internal/storage/storage.go backend/internal/storage/postgres/proficiency.go backend/internal/storage/processcache/process_cache.go
git commit -m "feat(api): windowed proficiency history endpoint (?window=1m|3m|6m|1y|all)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — `TrendWindow` type, api param, per-window cache in `useStats`

**Files:**
- Modify: `frontend/src/types.ts` (add one type)
- Modify: `frontend/src/api.ts:279-291` (`getProficiencyHistory`)
- Modify: `frontend/src/hooks/useStats.ts` (whole new file shown below)
- Test: `frontend/src/hooks/useStats.test.ts` (full rewrite shown below)

**Interfaces:**
- Consumes: Task 2's endpoint (`?window=`).
- Produces: `TrendWindow` in `types.ts`; `getProficiencyHistory(window: TrendWindow, signal?: AbortSignal)`; `useStats(window: TrendWindow): { proficiencies, history, loading, historyLoading, error }`; `invalidateStatsCache()` unchanged in name/callers. Task 4 relies on these exact names.

- [ ] **Step 1: Add the type and api param**

In `frontend/src/types.ts`, after the `View` type:

```ts
export type TrendWindow = '1m' | '3m' | '6m' | '1y' | 'all'
```

In `frontend/src/api.ts`, replace `getProficiencyHistory` with:

```ts
export async function getProficiencyHistory(
  window: TrendWindow,
  signal?: AbortSignal,
): Promise<ProficiencySnapshot[]> {
  const res = await fetch(`${API_URL}/api/proficiency/history?window=${window}`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok)
    throw new Error(`Failed to fetch proficiency history: ${res.status}`)
  const data = (await res.json()) as ProficiencyHistoryResponse
  return data.history
}
```

and add `TrendWindow` to the existing `import type { ... } from './types'` line in `api.ts`.

- [ ] **Step 2: Rewrite the useStats test file (failing tests first)**

Replace `frontend/src/hooks/useStats.test.ts` entirely with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { TopicProficiency, ProficiencySnapshot } from '../types'

vi.mock('../api', () => ({
  getProficiency: vi.fn(),
  getProficiencyHistory: vi.fn(),
}))

import { getProficiency, getProficiencyHistory } from '../api'
import { useStats, invalidateStatsCache } from './useStats'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const prof: TopicProficiency[] = [
  {
    user_id: 'u1',
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.5,
    updated_at: '2026-07-14T00:00:00Z',
  },
]
const hist: ProficiencySnapshot[] = [
  {
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.5,
    snapshot_date: '2026-07-14',
  },
]
const hist3m: ProficiencySnapshot[] = [
  {
    topic: 'Arrays & Hashing',
    stage: 'pattern',
    score: 0.4,
    snapshot_date: '2026-05-01',
  },
  ...hist,
]

beforeEach(() => {
  invalidateStatsCache()
  vi.mocked(getProficiency).mockReset().mockResolvedValue(prof)
  vi.mocked(getProficiencyHistory)
    .mockReset()
    .mockImplementation((w) => Promise.resolve(w === '3m' ? hist3m : hist))
})

describe('useStats', () => {
  it('fetches proficiency and windowed history on first mount', async () => {
    const { result } = renderHook(() => useStats('1m'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proficiencies).toEqual(prof)
    expect(result.current.history).toEqual(hist)
    expect(result.current.error).toBe(false)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledWith('1m', expect.anything())
  })

  it('serves cache on remount without refetching', async () => {
    const first = renderHook(() => useStats('1m'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.historyLoading).toBe(false)
    expect(second.result.current.history).toEqual(hist)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('window switch fetches history only, not proficiency', async () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: '1m' | '3m' }) => useStats(w),
      { initialProps: { w: '1m' as '1m' | '3m' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ w: '3m' })
    expect(result.current.historyLoading).toBe(true)
    expect(result.current.loading).toBe(false)
    await waitFor(() => expect(result.current.historyLoading).toBe(false))
    expect(result.current.history).toEqual(hist3m)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenLastCalledWith(
      '3m',
      expect.anything(),
    )
  })

  it('switching back to a cached window issues no request', async () => {
    const { result, rerender } = renderHook(
      ({ w }: { w: '1m' | '3m' }) => useStats(w),
      { initialProps: { w: '1m' as '1m' | '3m' } },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ w: '3m' })
    await waitFor(() => expect(result.current.historyLoading).toBe(false))

    rerender({ w: '1m' })
    expect(result.current.historyLoading).toBe(false)
    expect(result.current.history).toEqual(hist)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
  })

  it('invalidateStatsCache clears every window', async () => {
    const first = renderHook(({ w }: { w: '1m' | '3m' }) => useStats(w), {
      initialProps: { w: '1m' as '1m' | '3m' },
    })
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.rerender({ w: '3m' })
    await waitFor(() => expect(first.result.current.historyLoading).toBe(false))
    first.unmount()

    invalidateStatsCache()
    const second = renderHook(() => useStats('3m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(3)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    vi.mocked(getProficiency).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useStats('1m'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe(true)
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.error).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
  })

  it('fetch resolving after invalidation does not repopulate the cache', async () => {
    const d = deferred<TopicProficiency[]>()
    vi.mocked(getProficiency).mockReturnValue(d.promise)
    const first = renderHook(() => useStats('1m'))
    invalidateStatsCache()
    d.resolve(prof)
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats('1m'))
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run (from `frontend/`): `npm run test -- src/hooks/useStats.test.ts`
Expected: FAIL — `useStats` doesn't accept an argument / `historyLoading` undefined / `getProficiencyHistory` called without a window arg.

- [ ] **Step 4: Rewrite the hook**

Replace `frontend/src/hooks/useStats.ts` entirely with:

```ts
import { useEffect, useState } from 'react'
import type {
  TopicProficiency,
  ProficiencySnapshot,
  TrendWindow,
} from '../types'
import { getProficiency, getProficiencyHistory } from '../api'

// module-scoped: stats only change on session completion, so cache across
// mounts (history per window) and clear via invalidateStatsCache() at the
// two invalidation sites; mounted consumers re-check on remount by design
let cachedProficiency: TopicProficiency[] | null = null
let cachedHistory = new Map<TrendWindow, ProficiencySnapshot[]>()
// bumped on invalidate so an in-flight fetch can't repopulate stale data
let cacheGeneration = 0

export function invalidateStatsCache(): void {
  cacheGeneration++
  cachedProficiency = null
  cachedHistory = new Map()
}

export function useStats(window: TrendWindow): {
  proficiencies: TopicProficiency[]
  history: ProficiencySnapshot[]
  loading: boolean
  historyLoading: boolean
  error: boolean
} {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>(
    () => cachedProficiency ?? [],
  )
  const [history, setHistory] = useState<ProficiencySnapshot[]>(
    () => cachedHistory.get(window) ?? [],
  )
  const [loading, setLoading] = useState(cachedProficiency === null)
  const [historyLoading, setHistoryLoading] = useState(
    !cachedHistory.has(window),
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    const prof = cachedProficiency
    const hist = cachedHistory.get(window)
    if (prof !== null && hist !== undefined) {
      setProficiencies(prof)
      setHistory(hist)
      setLoading(false)
      setHistoryLoading(false)
      setError(false)
      return
    }
    const controller = new AbortController()
    const generation = cacheGeneration
    setHistoryLoading(true)
    Promise.all([
      prof !== null ? Promise.resolve(prof) : getProficiency(controller.signal),
      getProficiencyHistory(window, controller.signal),
    ])
      .then(([p, h]) => {
        if (controller.signal.aborted) return
        if (generation === cacheGeneration) {
          cachedProficiency = p
          cachedHistory.set(window, h)
        }
        setProficiencies(p)
        setHistory(h)
        setError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
          setHistoryLoading(false)
        }
      })
    return () => controller.abort()
  }, [window])

  return { proficiencies, history, loading, historyLoading, error }
}
```

Note: `StatsPage` still compiles against the old signature at this point — Step 5 will show it as a type error, which Task 4 fixes. To keep this task's commit green, make the minimal call-site fix in the same commit: in `frontend/src/components/StatsPage.tsx`, change `useStats()` to `useStats('1m')` and add `historyLoading` to nothing (leave destructure as-is — extra return fields don't break destructuring). The full UI wiring is Task 4.

- [ ] **Step 5: Run tests + build**

Run (from `frontend/`): `npm run test -- src/hooks/useStats.test.ts && npm run build`
Expected: 7 tests PASS; build clean (after the one-line `useStats('1m')` call-site fix).

Then full suite: `npm run test` — all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types.ts frontend/src/api.ts frontend/src/hooks/useStats.ts frontend/src/hooks/useStats.test.ts frontend/src/components/StatsPage.tsx
git commit -m "feat(web): per-window stats history cache in useStats

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: StatsPage — segmented window control, persistence, tick format, chart states

**Files:**
- Modify: `frontend/src/components/StatsPage.tsx` only.

**Interfaces:**
- Consumes: `useStats(window: TrendWindow)` returning `{ proficiencies, history, loading, historyLoading, error }`; `TrendWindow` from `../types`.
- Produces: no API change — `StatsPage` props unchanged.

- [ ] **Step 1: Wire the window state and control**

All edits in `frontend/src/components/StatsPage.tsx`.

Add `TrendWindow` to the type import from `../types`. Above the component (next to `stageLabel`), add:

```ts
const TREND_WINDOW_KEY = 'leetgame_trend_window'
const TREND_WINDOWS: TrendWindow[] = ['1m', '3m', '6m', '1y', 'all']
const trendWindowLabel: Record<TrendWindow, string> = {
  '1m': '1M',
  '3m': '3M',
  '6m': '6M',
  '1y': '1Y',
  all: 'All',
}
```

Inside the component, replace the Task-3 stopgap `useStats('1m')` with:

```ts
const [trendWindow, setTrendWindow] = useState<TrendWindow>(() => {
  const v = localStorage.getItem(TREND_WINDOW_KEY)
  return (TREND_WINDOWS as string[]).includes(v ?? '')
    ? (v as TrendWindow)
    : '1m'
})
const selectTrendWindow = (w: TrendWindow) => {
  setTrendWindow(w)
  localStorage.setItem(TREND_WINDOW_KEY, w)
}
const {
  proficiencies,
  history,
  loading: statsLoading,
  historyLoading,
  error: statsError,
} = useStats(trendWindow)
```

(`useStats` must be called after `trendWindow` is declared; keep `useTags` as-is.) Then change the derived `fetchError` line so a failed window switch never blanks a page that has data (spec: error surface only when there is no data to fall back on):

```ts
const fetchError =
  (statsError && proficiencies.length === 0) || tagsError !== null
```

(`loading` stays `statsLoading || tagsLoading`.)

After the `topicPicker` JSX constant, add:

```tsx
const windowPicker = (
  <div className="mb-6 flex items-center gap-3 text-xs">
    <span className="text-muted-foreground">Trend window:</span>
    {TREND_WINDOWS.map((w) => (
      <button
        key={w}
        onClick={() => selectTrendWindow(w)}
        aria-pressed={trendWindow === w}
        className={cn(
          'transition-colors',
          trendWindow === w
            ? 'text-foreground font-semibold'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {trendWindowLabel[w]}
      </button>
    ))}
  </div>
)
```

In the main (non-empty) return, render `{windowPicker}` immediately after `{topicPicker}`. Do not add it to the `filtered.length === 0` early return (no charts there).

- [ ] **Step 2: Chart loading/error states and tick format**

Above the return statements, add:

```ts
const isLongWindow =
  trendWindow === '6m' || trendWindow === '1y' || trendWindow === 'all'
```

In the expanded-chart block, the current code is:

```tsx
{chartData.length === 0 ? (
  <p className="text-muted-foreground text-xs">
    Practice more sessions to see your trend.
  </p>
) : (
```

Replace with:

```tsx
{historyLoading ? (
  <p className="text-muted-foreground text-xs">Loading trend…</p>
) : chartData.length === 0 ? (
  <p className="text-muted-foreground text-xs">
    {statsError
      ? 'Failed to load trend.'
      : 'Practice more sessions to see your trend.'}
  </p>
) : (
```

Change the XAxis `tickFormatter` from:

```tsx
tickFormatter={(d) => {
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}}
```

to:

```tsx
tickFormatter={(d) => {
  const date = new Date(d + 'T00:00:00')
  return isLongWindow
    ? date
        .toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        })
        .replace(' ', " '")
    : date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
}}
```

(`month: 'short', year: '2-digit'` renders `Jun 26`; the replace makes it `Jun '26` per the spec.)

- [ ] **Step 3: Build + tests**

Run (from `frontend/`): `npm run build && npm run test`
Expected: build clean, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StatsPage.tsx
git commit -m "feat(web): trend window selector on stats page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification in the running app

**Files:** none (verification only).

Harness: local Go backend (`cd backend && go run ./cmd/server`, port 42069 — if the port is taken by an older instance, kill and restart it so the NEW backend code serves; unlike the last feature, this one changes backend behavior) + `npm run dev` in `frontend/` + chrome-devtools MCP. Sign in via `http://localhost:5173/?dev=1`.

- [ ] **Step 1: Declare receipts before acting**

1. Stats first visit: one `GET /api/proficiency`, one `GET /api/proficiency/history?window=1m` (default from localStorage).
2. Click `3M`: exactly one new request, `history?window=3m`; chart area shows the switch without a full-page loading flash; proficiency NOT refetched.
3. Click `1M` again: zero new requests (cached).
4. Click `All`: one `history?window=all` request returning 200 (exercises the `days=0` SQL branch against real Postgres).
5. Reload the page: selected window persists (localStorage) and is used for the initial fetch.
6. `curl` the endpoint with `window=junk` (with auth header or via the browser fetch console): 400.

- [ ] **Step 2: Run the checks, record receipts, restore state**

Use `list_network_requests` filtered to `/api/proficiency`. Report each receipt pass/fail. Leave the dev account's stored window at `1m` when done.

- [ ] **Step 3: Report**

No commit — report the six receipts back.
