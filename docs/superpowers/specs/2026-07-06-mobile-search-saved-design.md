# Mobile search + saved problems + shuffled playlist — design

**Date:** 2026-07-06
**Status:** Approved design, pending implementation plan
**Scope:** Port the web Search page to the RN app (`mobile/`): filtered
problem search, saved problems, tap-to-practice, and a shuffled playlist
mode built on the existing `problemSource` machinery. Sequential playlist
order and the web session back-stack are explicitly deferred.

## 1. Goal

Let mobile users find a specific problem (title/difficulty/tag search),
bookmark problems for later, and practice through a filtered set — mirroring
`frontend/src/components/SearchPage.tsx`, `useSearch`, `useSaved`, and the
`problemSource === 'search'` flow in `App.tsx`.

### In scope

- Search screen: debounced title query, difficulty chips, tag filter with
  and/or matching, paginated results (12/page)
- Saved problems: star toggle on results + a "★ Saved" view (signed-in only)
- Tap a result → practice it, entering the filtered playlist at that problem
- "Practice these" → enter the playlist at a random match
- Shuffled playlist: "next problem" draws another match (excluding the
  current one); exhaustion (404) shows an end-of-set state with
  Restart set / Random problem; a playlist banner with filter summary + exit

### Out of scope (deferred)

- Sequential playlist order (web's shuffle-off mode) and the shuffle toggle
- Session back-stack (web `useSessionStack`: back restores problem + chat)
- Anonymous saved problems (backend requires auth; web also hides stars)

## 2. Backend contract (existing, unchanged)

- `GET /api/problems?q&difficulty&tags&tag_match&page&page_size` →
  `{ problems, page, page_size, total }` (OptionalAuth). Params omitted when
  empty; `difficulty`/`tags` comma-joined; `tag_match` only sent when tags
  are present — mirror `frontend/src/api.ts` `searchProblems`.
- `GET /api/problems/random?q&difficulty&tags&tag_match&exclude_id` →
  `Problem`; **404 when no other problem matches** (set exhausted). Same
  param rules; `exclude_id` optional.
- `GET /api/saved` → `Problem[]`; `POST /api/saved/:problem_id`;
  `DELETE /api/saved/:problem_id` (all RequireAuth).

## 3. Architecture

### `src/api/errors.ts` (new)

`ApiError extends Error` carrying `status: number`. Needed to distinguish
end-of-set 404 from other failures. Lives in its own module (not
`client.ts`) so consumers like the practice-session hook don't pull in the
supabase import chain in tests. Only the new/changed call sites use it;
existing functions keep their plain-Error behavior.

### `src/api/problems.ts`

- `searchProblems(q, difficulties, tags, tagMatch, page, pageSize, signal?):
  Promise<ProblemSearchResponse>`
- `getRandomProblemFiltered(q, difficulties, tags, tagMatch, excludeId?):
  Promise<Problem>` — throws `ApiError` so callers can check `status === 404`.

### `src/api/saved.ts` (new)

`getSavedProblems(): Promise<Problem[]>`, `saveProblem(id): Promise<void>`,
`unsaveProblem(id): Promise<void>` — existing file patterns.

### `src/types.ts`

Add `ProblemSearchResponse { problems: Problem[]; page: number;
page_size: number; total: number }` and
`PlaylistFilters { q: string; difficulties: string[]; tags: string[];
tagMatch: 'and' | 'or' }`.

### `src/saved/use-saved.ts` (new)

Mirror web `useSaved(session)`: fetch on sign-in, clear on sign-out,
optimistic `save`/`unsave` with refetch-on-error, `savedIds: Set<string>`,
`isSaved(id)`.

### `src/practice/pending-playlist.ts` (new — the route-boundary handoff)

There is no problem-by-id endpoint, so the selected `Problem` object crosses
from Search to Practice in memory:

```ts
setPendingPlaylist(p: { filters: PlaylistFilters; problem?: Problem }): void
takePendingPlaylist(): { filters: PlaylistFilters; problem?: Problem } | null
```

`take` returns and clears (one-shot). Pure module, unit-tested. The Search
screen sets it, then `router.dismissTo({ pathname: '/', params:
{ playlist: String(Date.now()) } })` — the nonce pattern proven by smart
mode. The Practice screen's playlist effect (gated on `authReady` + nonce
change, symmetric with the smart effect) takes the pending value and starts
the session. If `takePendingPlaylist()` returns null (stale nonce, e.g.
app-state restoration re-delivering the param), the effect falls back to
`loadRandom()` when no problem is loaded yet, and otherwise ignores the
nonce — the screen can never be left empty.

### `src/practice/use-practice-session.ts`

- `problemSource` gains `'playlist'`; new internal `playlistFiltersRef` and
  `exhausted: boolean` state.
- `startPlaylist(filters, initialProblem?)`: stores filters; if
  `initialProblem` given, starts the session with it directly (no fetch);
  otherwise fetches via `getRandomProblemFiltered(filters)` (seq-guarded,
  same pattern as `loadRandom`/`loadSmart`). Sets source `'playlist'`,
  clears `exhausted`.
- `loadNext()` in playlist mode: `getRandomProblemFiltered(filters,
  problem.id)`; on `ApiError` 404 → `exhausted = true` (no error message);
  other failures → existing error path. Seq-guarded.
- `restartPlaylist()`: `getRandomProblemFiltered(filters)` with no exclude —
  stays in playlist, clears `exhausted`. (Deviation from web, which restarts
  sequentially at page 1 — meaningless under shuffle-only.)
- `loadRandom()` additionally clears `exhausted` and the stored filters
  (it already resets source; exiting a playlist = loadRandom, like smart).
- Entering smart mode or random clears playlist state; entering playlist
  clears smart. One source at a time.

### Practice screen (`src/app/index.tsx`)

- Header gains a search button (testID `search-button`, accessibilityLabel
  "Search", 🔍) before the stats button, linking to `/search`.
- Playlist effect: reads `useLocalSearchParams().playlist` nonce (dedup via
  ref, same shape as the smart effect); on new nonce, `takePendingPlaylist()`
  and call `practice.startPlaylist(...)`. The initial-load effect also skips
  when a `playlist` param is present (same mutual exclusion as `smart`).
- `PlaylistBanner` (new component, `SmartBanner` sibling): shows a summary —
  the query in quotes, difficulty list, tag list joined with the match mode —
  e.g. `"two sum" · Easy/Medium · Array+Graph`; only non-empty parts.
  Exit `×` (testIDs `playlist-banner`, `playlist-exit`) → `loadRandom()`.
  Web parity note: web shows no summary when all filters are empty; mobile
  playlists always have the filters the user searched with, and an
  all-empty-filters playlist shows just "Playlist".
- End-of-set: when `practice.exhausted`, the ScrollView content is replaced
  by an `EndOfSet` component (testID `end-of-set`): title "End of practice
  set", body "You reached the end of the current filtered set." with buttons
  "Restart set" (testID `end-of-set-restart` → `restartPlaylist()`) and
  "Random problem" (testID `end-of-set-random` → `loadRandom()`).

### Search screen (`src/screens/search-screen.tsx` + `src/app/search.tsx` re-export)

Route registered in `_layout.tsx` with title "Search". Test co-located in
`src/screens/` (route dir bundles everything — established constraint).

State (all screen-local): `q`, `difficulties`, `tags`, `tagMatch`
(default `'and'`), `page`, `results`, `total`, `hasSearched`, `tagQuery`,
`showSaved`. A debounced (300 ms) effect fetches `searchProblems` on
`[q, difficulties, tags, tagMatch, page]` change with abort + stale-guard;
filter changes reset `page` to 1.

Layout, top to bottom (every control testID'd):
- Title query input (`search-query`)
- Difficulty chips: All / Easy / Medium / Hard (`search-difficulty-all`,
  `search-difficulty-<d>`) — "All" clears; chips toggle
- `★ Saved` toggle (`search-saved-toggle`) — rendered signed-in only;
  when on, the results area lists saved problems instead
- Tag section: match-mode chips Match all / Match any (`search-tag-match-and`,
  `search-tag-match-or`), tag search input (`search-tag-query`), selected
  tag chips with `×` (`search-tag-selected-<name>`), and up to 12 matching
  available tags (`search-tag-option-<name>`) from `getProblemTags`
  (fetched once on mount)
- "Practice these" button (`search-enter-playlist`), hidden in Saved view;
  label gains `· N problems` after a search with results (web: "Enter
  Playlist" — mobile uses "Practice these", clearer on a phone)
- Result rows (`search-result-<id>`): `#leetcode_id`, title, difficulty in
  its difficulty color (reuse `DifficultyBadge` colors), tag badges, and a
  star (`search-save-<id>`, ★/☆, signed-in only) that toggles saved state
  without triggering row selection
- States: loading (skeleton not required — `ActivityIndicator`), error
  ("Search failed."), empty ("No problems found." + " Try clearing your
  filters." when filters active), saved-empty ("No saved problems yet."),
  saved count line
- Pagination: Previous / Next (`search-prev`, `search-next`) with
  "Showing X–Y of N · Page P of Q" line, hidden in Saved view

Selection behavior:
- Tapping a result: `setPendingPlaylist({ filters: current filters,
  problem })` → dismissTo Practice with a new `playlist` nonce → session
  starts at that problem, playlist mode with those filters.
- Tapping "Practice these": same, without `problem`.
- Tapping a Saved row: `setPendingPlaylist({ filters: EMPTY_FILTERS,
  problem })` where `EMPTY_FILTERS = { q: '', difficulties: [], tags: [],
  tagMatch: 'and' }` — practicing a saved problem; "next" then draws from
  all problems (web behaves equivalently: saved selection passes empty
  filters). Banner shows "Playlist" (all-empty summary).

## 4. Error handling

- Search fetch failure: inline error text; retry by changing any filter or
  paging (the effect re-fires). Aborted requests are not errors.
- `getRandomProblemFiltered` 404 → `exhausted` (end-of-set), never an error
  message. Non-404 → existing "Failed to load a problem." path.
- Saved toggle failures: optimistic UI + silent refetch (web parity).
- `takePendingPlaylist()` returning null on a playlist nonce (e.g. stale
  param after app restore): fall back to `loadRandom()` if no problem is
  loaded, otherwise keep the current session.

## 5. Testing

Unit (jest-expo, existing patterns):
- API: `searchProblems` param encoding (omit-empty, comma-join, tag_match
  only with tags, page/page_size always), `getRandomProblemFiltered`
  encoding + `ApiError` with status on non-OK, saved CRUD calls.
- `pending-playlist`: set → take returns value; second take returns null.
- `use-saved`: sign-in fetch, sign-out clear, optimistic save/unsave,
  refetch on failure.
- `use-practice-session`: startPlaylist with/without initial problem;
  loadNext excludes current id; 404 → exhausted (no error); restart clears
  exhausted without exclude; loadRandom exits playlist; smart↔playlist
  mutual exclusion.
- Search screen: renders results from mocked API; difficulty/tag filters
  reset page; row tap sets pending playlist + dismisses with nonce; saved
  view lists saved problems; star toggle calls save/unsave; anonymous hides
  stars and Saved toggle.
- `PlaylistBanner` summary formatting; `EndOfSet` fires callbacks.

Manual (rn-agentic-loop on iOS simulator, receipt-driven):
- Search button → `/search`; typing fires debounced `GET /api/problems`
  with correct params (network receipt); pagination works.
- Tapping a result lands on Practice with that problem (fiber receipt:
  problem title/slug in session state), playlist banner mounted.
- Next problem fires filtered random with `exclude_id` = current problem.
- Exhaustion: narrow filters to a 1-problem set → next → end-of-set view;
  Restart set re-enters; Random problem exits to unfiltered random.
- Star a problem → `POST /api/saved/:id` (server GET receipt), appears in
  Saved view; unstar → DELETE + disappears. Restore account state after.
- Anonymous: search + playlist work; no stars, no Saved toggle, no PUT/POST.
