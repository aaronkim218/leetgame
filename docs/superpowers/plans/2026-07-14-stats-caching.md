# Stats Page Caching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisits to the Stats page render instantly from an in-memory cache with zero network requests; the cache invalidates only on session completion or sign-out.

**Architecture:** Module-scoped cache variables inside two custom hooks (`useStats` new, `useTags` modified), following the codebase's existing custom-hook pattern. `StatsPage` swaps its mount-time triple fetch for the hooks; two one-line call sites invalidate the stats cache.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest + `@testing-library/react` (`renderHook`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-stats-caching-design.md`

## Global Constraints

- In-memory cache only — no localStorage persistence.
- No background revalidation, no time-based expiry, no tab-refocus refetch.
- Stats cache invalidates in exactly two places: session completion (`App.tsx`, chat stream `event.stage === 'complete' && session` branch) and `SIGNED_OUT` (`useAuth.ts`). Never on `SIGNED_IN`.
- Tags cache is never invalidated (global, static catalog).
- A failed fetch must not populate the cache.
- No new dependencies. Match existing hook style (`useTags`, `usePrefetchedProblem`).
- All commands below run from `frontend/` unless noted. The repo pre-commit hook runs lint + format:check + build + backend tests; a commit failing means the task isn't done.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: `useStats` hook with module-scoped cache

**Files:**
- Create: `frontend/src/hooks/useStats.ts`
- Test: `frontend/src/hooks/useStats.test.ts`

**Interfaces:**
- Consumes: `getProficiency(signal?: AbortSignal): Promise<TopicProficiency[]>` and `getProficiencyHistory(signal?: AbortSignal): Promise<ProficiencySnapshot[]>` from `frontend/src/api.ts`; types `TopicProficiency`, `ProficiencySnapshot` from `frontend/src/types.ts`.
- Produces: `useStats(): { proficiencies: TopicProficiency[]; history: ProficiencySnapshot[]; loading: boolean; error: boolean }` and `invalidateStatsCache(): void`, both exported from `frontend/src/hooks/useStats.ts`. Tasks 3 and 4 rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useStats.test.ts`:

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

beforeEach(() => {
  invalidateStatsCache()
  vi.mocked(getProficiency).mockReset().mockResolvedValue(prof)
  vi.mocked(getProficiencyHistory).mockReset().mockResolvedValue(hist)
})

describe('useStats', () => {
  it('fetches both endpoints on first mount', async () => {
    const { result } = renderHook(() => useStats())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.proficiencies).toEqual(prof)
    expect(result.current.history).toEqual(hist)
    expect(result.current.error).toBe(false)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('serves cache on remount without refetching', async () => {
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
    expect(second.result.current.history).toEqual(hist)
    expect(getProficiency).toHaveBeenCalledTimes(1)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(1)
  })

  it('refetches after invalidateStatsCache', async () => {
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    first.unmount()

    invalidateStatsCache()
    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(getProficiency).toHaveBeenCalledTimes(2)
    expect(getProficiencyHistory).toHaveBeenCalledTimes(2)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    vi.mocked(getProficiency).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useStats())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.error).toBe(true)
    first.unmount()

    vi.mocked(getProficiency).mockResolvedValue(prof)
    const second = renderHook(() => useStats())
    expect(second.result.current.loading).toBe(true)
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.error).toBe(false)
    expect(second.result.current.proficiencies).toEqual(prof)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/hooks/useStats.test.ts`
Expected: FAIL — cannot resolve `./useStats`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/hooks/useStats.ts`:

```ts
import { useEffect, useState } from 'react'
import type { TopicProficiency, ProficiencySnapshot } from '../types'
import { getProficiency, getProficiencyHistory } from '../api'

// module-scoped: stats only change on session completion, so cache across
// mounts and clear via invalidateStatsCache() at the two invalidation sites
let cachedProficiency: TopicProficiency[] | null = null
let cachedHistory: ProficiencySnapshot[] | null = null

export function invalidateStatsCache(): void {
  cachedProficiency = null
  cachedHistory = null
}

export function useStats(): {
  proficiencies: TopicProficiency[]
  history: ProficiencySnapshot[]
  loading: boolean
  error: boolean
} {
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>(
    () => cachedProficiency ?? [],
  )
  const [history, setHistory] = useState<ProficiencySnapshot[]>(
    () => cachedHistory ?? [],
  )
  const [loading, setLoading] = useState(
    cachedProficiency === null || cachedHistory === null,
  )
  const [error, setError] = useState(false)

  useEffect(() => {
    if (cachedProficiency !== null && cachedHistory !== null) return
    const controller = new AbortController()
    Promise.all([
      getProficiency(controller.signal),
      getProficiencyHistory(controller.signal),
    ])
      .then(([prof, hist]) => {
        if (controller.signal.aborted) return
        cachedProficiency = prof
        cachedHistory = hist
        setProficiencies(prof)
        setHistory(hist)
        setError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  return { proficiencies, history, loading, error }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/hooks/useStats.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useStats.ts frontend/src/hooks/useStats.test.ts
git commit -m "feat(web): add useStats hook with module-scoped cache

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Module-scoped cache in `useTags`

**Files:**
- Modify: `frontend/src/hooks/useTags.ts` (whole file shown below)
- Test: `frontend/src/hooks/useTags.test.ts`

**Interfaces:**
- Consumes: `getProblemTags(signal?: AbortSignal): Promise<ProblemTag[]>` from `frontend/src/api.ts`.
- Produces: unchanged public API — `useTags(): { availableTags: ProblemTag[]; tagsLoading: boolean; tagsError: string | null }`. Existing consumers must not need changes. No invalidate export (tags are never invalidated).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useTags.test.ts`. Gotcha this test works around: the tags cache is module state with no invalidate export, so test isolation uses `vi.resetModules()` + dynamic imports. After `vi.resetModules()`, statically imported mock instances are stale — both `../api` and `./useTags` must be re-imported dynamically so the hook and the assertions see the same `vi.fn()`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ProblemTag } from '../types'

vi.mock('../api', () => ({
  getProblemTags: vi.fn(),
}))

const tags: ProblemTag[] = [{ name: 'Arrays & Hashing', count: 10 }]

async function setup() {
  const api = await import('../api')
  vi.mocked(api.getProblemTags).mockResolvedValue(tags)
  const { useTags } = await import('./useTags')
  return { api, useTags }
}

beforeEach(() => {
  vi.resetModules()
})

describe('useTags', () => {
  it('fetches tags on first mount', async () => {
    const { api, useTags } = await setup()
    const { result } = renderHook(() => useTags())
    expect(result.current.tagsLoading).toBe(true)
    await waitFor(() => expect(result.current.tagsLoading).toBe(false))
    expect(result.current.availableTags).toEqual(tags)
    expect(api.getProblemTags).toHaveBeenCalledTimes(1)
  })

  it('serves cache on remount without refetching', async () => {
    const { api, useTags } = await setup()
    const first = renderHook(() => useTags())
    await waitFor(() => expect(first.result.current.tagsLoading).toBe(false))
    first.unmount()

    const second = renderHook(() => useTags())
    expect(second.result.current.tagsLoading).toBe(false)
    expect(second.result.current.availableTags).toEqual(tags)
    expect(api.getProblemTags).toHaveBeenCalledTimes(1)
  })

  it('failed fetch sets error and does not populate cache', async () => {
    const { api, useTags } = await setup()
    vi.mocked(api.getProblemTags).mockRejectedValue(new Error('boom'))
    const first = renderHook(() => useTags())
    await waitFor(() => expect(first.result.current.tagsLoading).toBe(false))
    expect(first.result.current.tagsError).toBe('Failed to load tags.')
    first.unmount()

    vi.mocked(api.getProblemTags).mockResolvedValue(tags)
    const second = renderHook(() => useTags())
    expect(second.result.current.tagsLoading).toBe(true)
    await waitFor(() => expect(second.result.current.tagsLoading).toBe(false))
    expect(second.result.current.availableTags).toEqual(tags)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/hooks/useTags.test.ts`
Expected: FAIL — 'serves cache on remount' fails with `getProblemTags` called 2 times (current hook fetches every mount). The other two tests pass against the existing implementation; that's fine — the cache test is the driver.

- [ ] **Step 3: Add the module cache**

Replace the body of `frontend/src/hooks/useTags.ts` with:

```ts
import { useState, useEffect } from 'react'
import type { ProblemTag } from '../types'
import { getProblemTags } from '../api'

// module-scoped: the tag catalog is global and static, cache for app lifetime
let cachedTags: ProblemTag[] | null = null

export function useTags(): {
  availableTags: ProblemTag[]
  tagsLoading: boolean
  tagsError: string | null
} {
  const [availableTags, setAvailableTags] = useState<ProblemTag[]>(
    () => cachedTags ?? [],
  )
  const [tagsLoading, setTagsLoading] = useState(cachedTags === null)
  const [tagsError, setTagsError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedTags !== null) return
    const controller = new AbortController()
    async function loadTags() {
      setTagsLoading(true)
      setTagsError(null)
      try {
        const res = await getProblemTags(controller.signal)
        cachedTags = res
        setAvailableTags(res)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setTagsError('Failed to load tags.')
        }
      } finally {
        if (!controller.signal.aborted) setTagsLoading(false)
      }
    }
    void loadTags()
    return () => controller.abort()
  }, [])

  return { availableTags, tagsLoading, tagsError }
}
```

- [ ] **Step 4: Run the test suite to verify it passes**

Run: `npm run test -- src/hooks/useTags.test.ts`
Expected: 3 tests PASS.

Then run the full suite to check existing `useTags` consumers: `npm run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTags.ts frontend/src/hooks/useTags.test.ts
git commit -m "feat(web): cache problem tags at module scope in useTags

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `StatsPage` uses the cached hooks

**Files:**
- Modify: `frontend/src/components/StatsPage.tsx:1-122` (imports + fetch layer only; rendering below stays untouched)

**Interfaces:**
- Consumes: `useStats()` from Task 1, `useTags()` from Task 2.
- Produces: no API change — `StatsPage` props are unchanged.

- [ ] **Step 1: Replace the fetch layer**

In `frontend/src/components/StatsPage.tsx`, change the imports: drop `useEffect` from the React import, drop `getProficiency`, `getProblemTags`, `getProficiencyHistory` from the `../api` import (remove the `../api` import line entirely), and add:

```ts
import { useStats } from '../hooks/useStats'
import { useTags } from '../hooks/useTags'
```

Then replace these pieces of the component body — the five fetch-related `useState`s (`proficiencies`, `allTags`, `loading`, `fetchError`, `history` — currently lines 80-83 and 85; line 84 `topicPickerOpen` stays) and the whole mount `useEffect` (currently lines 100-122) — with:

```ts
const {
  proficiencies,
  history,
  loading: statsLoading,
  error: statsError,
} = useStats()
const { availableTags: allTags, tagsLoading, tagsError } = useTags()
const loading = statsLoading || tagsLoading
const fetchError = statsError || tagsError !== null
```

Keep the local UI state (`topicPickerOpen`, `expandedTopic`, `hiddenLines`) and everything below. The destructure renames (`availableTags` → `allTags`) keep every downstream reference (`loading`, `fetchError`, `proficiencies`, `history`, `allTags`) compiling unchanged.

Note: the old code also imported `TopicProficiency`/`ProficiencySnapshot`/`ProblemTag` types — `TopicProficiency` and `ProficiencySnapshot` are still used by `buildChartData` and the topic grouping; `ProblemTag` is no longer referenced once `allTags` comes typed from `useTags`, so remove it from the type import if TypeScript flags it as unused.

- [ ] **Step 2: Verify build and tests**

Run: `npm run build && npm run test`
Expected: build succeeds, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatsPage.tsx
git commit -m "refactor(web): StatsPage reads stats and tags from cached hooks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Invalidation wiring

**Files:**
- Modify: `frontend/src/App.tsx:581-583` (chat stream `complete` branch) + imports
- Modify: `frontend/src/hooks/useAuth.ts:118-126` (`SIGNED_OUT` branch) + imports

**Interfaces:**
- Consumes: `invalidateStatsCache()` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Invalidate on session completion**

In `frontend/src/App.tsx`, add to the imports:

```ts
import { invalidateStatsCache } from './hooks/useStats'
```

and change the stream-completion branch (currently line 581):

```ts
if (event.stage === 'complete' && session) {
  invalidateStatsCache()
  recordAndUpdateStreak()
}
```

- [ ] **Step 2: Invalidate on sign-out**

In `frontend/src/hooks/useAuth.ts`, add to the imports:

```ts
import { invalidateStatsCache } from './useStats'
```

and add the call at the top of the `SIGNED_OUT` branch (currently line 118):

```ts
} else if (event === 'SIGNED_OUT') {
  invalidateStatsCache()
  settingsSeq++
  ...
```

Do NOT add it to the `SIGNED_IN` branch — Supabase fires `SIGNED_IN` on token refresh and tab refocus, which would defeat the cache.

- [ ] **Step 3: Verify build and tests**

Run: `npm run build && npm run test`
Expected: build succeeds, all tests PASS (`useAuth.test.ts` in particular).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/hooks/useAuth.ts
git commit -m "feat(web): invalidate stats cache on session completion and sign-out

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification in the running app

**Files:** none (verification only).

Harness (known-good recipe): local Go backend (`cd backend && go run ./cmd/server`, port 42069) + `npm run dev` in `frontend/` (vite on :5173 proxies `/api`) + chrome-devtools MCP. Sign in by navigating to `http://localhost:5173/?dev=1` (dev creds are in `frontend/.env.local`).

- [ ] **Step 1: Declare receipts before acting**

The change is verified iff, in a signed-in session:
1. First visit to Stats issues exactly one request each to `/api/proficiency`, `/api/proficiency/history`, `/api/problems/tags` and renders the proficiency bars.
2. Navigating to Practice and back to Stats renders instantly with **zero** new requests to those three endpoints (network request list receipt, not a screenshot).
3. Completing a practice session (drive a session to `stage === 'complete'`, or if too slow, temporarily verify via the hook test from Task 1 plus code inspection of the wiring — flag which path was taken) followed by a Stats visit re-issues the two proficiency requests (tags stays cached).

- [ ] **Step 2: Run the checks and record receipts**

Use `list_network_requests` filtered to `/api/proficiency` before/after each navigation. Report the receipt for each of the three checks. If check 3's full-session path is impractical in the loop, say so explicitly rather than skipping silently.

- [ ] **Step 3: Report**

No commit — report the three receipts (pass/fail each) back to the user.
