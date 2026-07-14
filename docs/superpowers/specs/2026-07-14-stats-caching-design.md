# Stats Page Caching (Web)

**Date:** 2026-07-14
**Status:** Approved
**Scope:** Web frontend only. Two stats endpoints plus deduping the tags fetch.

## Problem

`StatsPage` is unmounted whenever the user switches views (`App.tsx` renders it
conditionally), and it fetches proficiency, proficiency history, and problem tags
in a mount-only `useEffect`. Every visit to the Stats tab therefore shows a
"Loading..." flash and issues three network requests, even though stats data only
changes when the user completes a practice session.

`StatsPage` also duplicates the tags fetch that `useTags` already performs
elsewhere in the app.

## Goal

Revisits to the Stats page render instantly from cache with zero network
requests. The cache is invalidated only when a session completes (the sole event
that changes stats) or on sign-out. Tags are fetched once per app lifetime.

## Requirements (settled during brainstorming)

- **Freshness:** fresh-after-sessions-only. No background revalidation, no
  time-based expiry.
- **Multi-device:** acceptable for a web tab to miss sessions completed on
  mobile; a page reload picks them up. This is why the cache is **in-memory
  only** — persisting to localStorage would defeat the reload escape hatch.
- **Scope:** stats endpoints + tags dedupe. No app-wide caching utility, no
  TanStack Query.

## Design

### Hook: `useStats` (new file `frontend/src/hooks/useStats.ts`)

Module-scoped cache:

```ts
let cachedProficiency: TopicProficiency[] | null = null
let cachedHistory: ProficiencySnapshot[] | null = null
```

Exports:

- `useStats()` → `{ proficiencies, history, loading, error }`.
  - If both caches are populated: initialize state from them, make no network
    calls, `loading` starts `false`.
  - Otherwise: fetch `getProficiency` and `getProficiencyHistory` via
    `Promise.all` with an `AbortController` (same shape as the current
    `StatsPage` effect), write results to both the module cache and state.
- `invalidateStatsCache()` → sets both cache variables to `null`. Purely clears
  the cache; the next `useStats()` mount fetches. No event emitter — `StatsPage`
  unmounts when the user leaves the view, so a remount-time cache check is
  sufficient.

The two endpoints stay coupled in one hook because they invalidate together and
have no independent consumers.

### Hook: `useTags` (modified)

Add a module-level `cachedTags: ProblemTag[] | null`. Serve it when present;
fetch once otherwise. No invalidation ever — the tag catalog is global and
static, not per-user.

`StatsPage` drops its own `getProblemTags` call and uses `useTags`, which also
dedupes the fetch it currently duplicates.

### Invalidation wiring (two call sites)

1. `App.tsx` — inside the `event.stage === 'complete' && session` branch of the
   chat stream handler (currently line 581), call `invalidateStatsCache()` next
   to `recordAndUpdateStreak()`.
2. `useAuth.ts` — in the `SIGNED_OUT` branch of `onAuthStateChange` (currently
   line 118), call `invalidateStatsCache()` so one user's stats never leak into
   another account's view. Not on `SIGNED_IN` — Supabase fires that on token
   refresh and tab refocus, which would defeat the cache.

### `StatsPage.tsx` (simplified)

The three-fetch `useEffect` and its five fetch-related `useState`s are replaced
by `useStats()` + `useTags()`. Loading text shows only when loading with no
cached data; the error screen only when there is no data to fall back on. All
rendering logic below the fetch layer is untouched.

### Error handling

A failed fetch does not populate the cache — the next mount retries. Cached data
is never evicted by a failure (a populated cache means no fetch was issued).

## Testing

Vitest tests alongside the existing hook tests (`useStats.test.ts`):

- Revisit serves cache without refetch: mock the api module, mount → unmount →
  remount, assert each endpoint was called exactly once.
- `invalidateStatsCache()` then remount → endpoints called again.
- Sign-out clears the cache (exercised via `invalidateStatsCache()` — the
  `SIGNED_OUT` branch calls the same function).

`invalidateStatsCache()` doubles as the test reset — no separate test-only
helper. `useTags` gets an equivalent cache-hit test; its cache resets via
`vi.resetModules()` in the test setup, keeping the production surface free of a
test-only invalidate export.

## Out of scope

- localStorage persistence
- Tab-refocus revalidation
- Caching for saved problems, streak, or search
- Mobile app changes
