# Settings-clobber fix + mobile Stats screen — design

**Date:** 2026-07-05
**Status:** Approved design, pending implementation plan
**Scope:** Two pieces: (A) fix the cross-platform settings-clobber bug (web +
mobile), (B) port the web Stats page to the RN app (`mobile/`) — proficiency
bars, topic picker, and smart practice. Trend charts are explicitly deferred.

## Part A — settings-clobber fix

### The bug

On both platforms, a failed `getSettings()` at sign-in is swallowed
(`.catch(() => {})`), leaving default values in state. The next settings
toggle then sends the full-replace `PUT /api/settings` with those defaults,
wiping the server's real `active_topics`, `tour_done`, and every other field.

- Web: `frontend/src/hooks/useAuth.ts` — has a `settingsReady` flag, but it
  is set `true` even on failure and the persist functions never consult it.
- Mobile: `mobile/src/auth/auth-context.tsx` — same hole; `authReady` plays
  the load-completion role.

### The fix (success-only gate)

A new `settingsLoaded` boolean per platform, `true` only when `getSettings`
resolves successfully for the current session:

- Initial value `false`. Set `false` again when a sign-in event starts a new
  settings fetch and on sign-out.
- Set `true` only in the `getSettings().then(...)` success path. Anonymous
  users (no session) are unaffected — their persistence is localStorage
  (web) / in-memory (mobile) and never PUTs.
- Every signed-in persist function (`persistStages`, `persistHideTitle`,
  `persistHideDifficulty`, `persistConciseMode`, `persistTopics`,
  `persistTourDone` on web; the shared `persist` helper on mobile) skips the
  network PUT when `settingsLoaded` is `false`. Local state still updates,
  so the UI stays responsive.

Web's existing `settingsReady` keeps its current meaning ("load finished,
success or not") — `useTour` and the first-problem-load effect depend on it
firing even on failure. `settingsLoaded` is a separate flag.

Accepted trade-off: in the rare failed-load session, toggles apply locally
but do not persist — strictly better than today, where they persist and
destroy other settings. Future direction if settings grow: a PATCH-style
partial-update endpoint eliminates the clobber class entirely; out of scope
here.

### Tests

- Web (vitest, hook-test precedent in `useSessionStack.test.ts`):
  `getSettings` rejects → toggle → `updateSettings` NOT called, state
  updated; `getSettings` resolves → toggle → `updateSettings` called with
  server-loaded values merged.
- Mobile (extend `mobile/src/auth/auth-context.test.tsx`): same two cases.

## Part B — mobile Stats screen

### In scope

- Per-topic proficiency bars (5 stages each, topics sorted weakest-first)
- "Manage topics" picker — this is where `active_topics` editing lands on
  mobile (deferred out of the settings screen by design)
- "Practice Weakest Topics" button wired into the practice loop (smart mode)

### Out of scope (deferred)

- Trend charts (`GET /api/proficiency/history`, `ProficiencySnapshot`) — the
  only part needing a new RN chart dependency
- Anything anonymous: `/api/proficiency` and `/api/problems/smart` both
  require auth (verified in `backend/internal/handlers/routes.go`)

### Backend contract (existing, unchanged)

- `GET /api/proficiency` → `TopicProficiency[]` (RequireAuth)
- `GET /api/problems/tags` → `ProblemTag[]` (`{ name, count }`)
- `GET /api/problems/smart?active_stages=a,b&active_topics=x,y` → `Problem`
  (RequireAuth per-route; params comma-joined, `active_topics` omitted when
  empty — mirror `frontend/src/api.ts` `getSmartPracticeProblem`)

### Navigation

Chart icon button (testID `stats-button`, accessibilityLabel "Stats",
accessibilityRole "button") in the Practice header next to the settings
gear, pushing a new `/stats` route registered in `_layout.tsx` with title
"Stats" — same pattern as `/settings`.

### API layer

- New `src/api/proficiency.ts`: `getProficiency(): Promise<TopicProficiency[]>`
  — auth header, throws on non-OK.
- `src/api/problems.ts` additions: `getProblemTags(): Promise<ProblemTag[]>`
  and `getSmartPracticeProblem(activeStages: ActiveStage[], activeTopics:
  string[]): Promise<Problem>`.
- `src/types.ts`: add `ProblemTag { name: string; count: number }`.
  `TopicProficiency` already exists.

### AuthContext

Expose `activeTopics: string[]` and `persistTopics(topics: string[])` in the
context value (state already exists for PUT round-tripping). `persistTopics`
goes through the same gated persist helper (Part A). Minimum-1 topic rule
enforced at the UI, web parity. Anonymous: in-memory only.

### Stats screen (`src/app/stats.tsx`)

States, in order of precedence:

1. **Signed out** — "Sign in to track proficiency" + button to `/sign-in`.
2. **Loading** — while `getProficiency` + `getProblemTags` (parallel,
   fired on mount) are in flight.
3. **Error** — either fetch failed: "Failed to load stats." message.
4. **Empty** — no proficiency rows for active topics: header + topic picker +
   "Complete a practice session to see your scores."
5. **Data** — header row ("Topic Proficiency" + "Practice Weakest Topics"
   button), topic picker, then topic cards.

Topic picker: collapsible "Manage topics (N of M active)" row toggling a
chip-wrap of all tags; active chips filled, tapping toggles membership via
`persistTopics`; the last active chip is disabled (min 1). Same rule as web's
`toggleTopic`.

Topic cards: proficiencies filtered to active topics, grouped by topic,
sorted by average score ascending (weakest first). Each card: topic name +
one row per stage present (stage label, horizontal bar, percent). Bar color:
score ≥ 0.7 green, ≥ 0.4 yellow, else red — same thresholds and stage labels
as web.

testIDs on every control: `stats-screen`, `stats-smart-practice`,
`stats-manage-topics`, `stats-topic-chip-<name>`, `stats-topic-card-<name>`.

### Smart practice wiring

- "Practice Weakest Topics" calls
  `router.dismissTo({ pathname: '/', params: { smart: String(Date.now()) } })`
  — `dismissTo` verified present in installed expo-router 56.2.11. The nonce
  value makes repeat activations observable.
- Practice screen (`index.tsx`) reads the `smart` param via
  `useLocalSearchParams` and, when it changes to a new value, tells the
  session hook to enter smart mode.
- `use-practice-session.ts`: new `problemSource: 'random' | 'smart'` state
  (session-internal), `startSmartPractice()` action. Entering smart mode
  fetches via `getSmartPracticeProblem(activeStages, activeTopics)`;
  "next problem" while in smart mode fetches smart again; exiting loads a
  random problem and returns `problemSource` to `'random'`. Fetch failure
  surfaces through the hook's existing error path.
- Smart-mode indicator: a banner row above the problem — "SMART PRACTICE"
  label + "×" exit button (testIDs `smart-banner`, `smart-exit`) — web
  `ProblemView` parity.
- Stage/topic changes apply to the next smart fetch (values read at call
  time), consistent with the existing session-snapshot behavior.

### Error handling

- Stats fetches: error state on screen (no retry button in v1; leaving and
  re-entering the screen re-fetches, since fetching happens on mount).
- Smart fetch failure: existing session error message path.
- `persistTopics` PUT failure: swallowed, optimistic UI (web parity, and
  gated per Part A).

## Testing

Unit (jest-expo, existing patterns):

- Part A tests as above (both platforms).
- `getProficiency` / `getProblemTags` / `getSmartPracticeProblem`: URL,
  query params (comma-joined, `active_topics` omitted when empty), auth
  header, throw on non-OK.
- Topic toggle rule: min-1 enforced, add/remove membership.
- `use-practice-session`: `startSmartPractice` fetches smart problem and
  sets source; next-in-smart fetches smart again; exit returns to random.

Manual (rn-agentic-loop on iOS simulator, receipt-driven):

- Stats button navigates to `/stats`; bars render with account data.
- Toggling a topic fires `PUT /api/settings` whose `active_topics` matches
  (server round-trip receipt) and the other four settings are unchanged.
- "Practice Weakest Topics" dismisses to Practice, `GET /api/problems/smart`
  fires with the account's stages/topics, banner shows; "next" fires smart
  again; "×" loads random and the banner disappears.
- Clobber fix receipt (mobile): with settings fetch forced to fail, a toggle
  produces NO PUT (negative control: same toggle after a successful load
  produces one).
- Web clobber fix: vitest coverage; quick browser sanity pass on the
  settings dropdown.
