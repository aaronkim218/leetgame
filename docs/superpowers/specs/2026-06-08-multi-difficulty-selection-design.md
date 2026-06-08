# Multi-Difficulty Selection

**Date:** 2026-06-08

## Problem

Difficulty filtering is currently single-select: one button active at a time (All / Easy / Medium / Hard). Users cannot filter to, e.g., Easy + Medium simultaneously.

## Approach

Follow the existing `tags` pattern throughout the stack: comma-separated string on the wire, split into `[]string` in the handler, `[]string` propagated through storage. No new wire conventions or structural patterns introduced.

## Frontend Changes

### `types.ts`

- `SearchState.difficulty: string` → `difficulties: string[]`
- `defaultSearchState.difficulties: []` (empty = no filter)

### `SearchPage.tsx`

- `SearchSelectionContext.difficulty: string` → `difficulties: string[]`
- Button behavior: each of Easy / Medium / Hard independently toggles in/out of the array
- "All" clears the array to `[]`; active when `difficulties.length === 0`
- `hasActiveFilters` checks `difficulties.length > 0`
- `setDifficulty` helper replaced with toggle logic

### `ProblemView.tsx`

- `SearchPlaylistSummary.difficulty: string` → `difficulties: string[]`
- Render one badge per selected difficulty (map) instead of a single conditional badge

### `App.tsx`

- `SearchPlaylist.difficulty: string` → `difficulties: string[]`
- `getPlaylistSummary`: checks `difficulties.length === 0` instead of `!searchPlaylist.difficulty`
- `enterPlaylistFromSearch`: destructures `difficulties` from `searchState`
- `selectProblem`: reads `context.difficulties`
- `loadNextSearchProblem`, `loadRandomNextProblem`, `restartSearchSet`: use `searchPlaylist.difficulties`

### `api.ts`

- `searchProblems(difficulties: string[], ...)` and `getRandomProblemFiltered(difficulties: string[], ...)`
- Serialize: `if (difficulties.length) params.set('difficulty', difficulties.join(','))`

### `useSearch.ts`

- Destructures `difficulties` instead of `difficulty`
- Effect dep array: `difficulties.join(',')` (same pattern as `tags.join(',')`)

## Backend Changes

### `handlers/problems.go`

- `parseProblemSearchFilters` gains difficulty parsing — same split-and-trim loop as tags — and returns `difficulties []string` as a third return value
- `GetRandomProblem`: filter routing checks `len(difficulties) > 0`
- `GetProblems`: passes `difficulties` to `SearchProblems`

### `storage/storage.go`

- `GetRandomProblemFiltered(ctx, q string, difficulties []string, tags []string, tagMatch, excludeID string)`
- `SearchProblems(ctx, q string, difficulties []string, tags []string, tagMatch string, page, pageSize int)`

### `storage/postgres/problems.go`

- `applyProblemSearchFilters(sb, q string, difficulties []string, tags []string, tagMatch, excludeID string)`
- When `len(difficulties) > 0`: `sb = sb.Where(squirrel.Eq{"difficulty": difficulties})` — Squirrel emits `difficulty IN ($1, $2, ...)` automatically
- When empty: no filter added (skip entirely — never emit `IN ()`)

### `storage/processcache/process_cache.go`

- `matchesProblem(p, q string, difficulties []string, tags []string, tagMatch, excludeID string)`
- Difficulty check: `len(difficulties) == 0 || slices.Contains(difficulties, p.Difficulty)`
- `GetRandomProblemFiltered` and `SearchProblems` signatures updated to match

## Non-Goals

- No changes to the `hide_difficulty` setting (that's about display, not filtering)
- No URL persistence of selected difficulties across page loads
- No backend migration (difficulty values are already clean strings in the DB)
