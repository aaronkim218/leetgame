# Mobile settings tuning UI — design

**Date:** 2026-07-05
**Status:** Approved design, pending implementation plan
**Scope:** Port the web settings tuning UI to the RN app (`mobile/`): practice
stages, hide title, hide difficulty, concise mode, theme. Topics editing and
anonymous persistence are explicitly out of scope.

## 1. Goal

Mobile v1 shipped settings read-only. This work makes them tunable, mirroring
the web settings dropdown (`frontend/src/components/StagesSettings.tsx` +
`useAuth` persist functions), in a dedicated `/settings` screen.

### In scope

- Practice stages toggle (5 canonical stages, minimum 1 active, canonical
  order always preserved)
- Hide problem title / hide difficulty toggles
- Concise mode toggle, threaded into the `/api/chat` request as `concise`
- Theme picker: `system | light | dark`, persisted locally in AsyncStorage
- Signed-in persistence via `PUT /api/settings` (full replace, web parity)
- Anonymous users: changes apply in-memory only and reset on app restart

### Out of scope (deferred)

- Topics (`active_topics`) editing — web edits these on the Stats page
- Anonymous persistence to AsyncStorage
- Tour / `tour_done` (no tour on mobile)

## 2. Prerequisite: merge `main` into `feat/mobile-app`

The branch predates concise mode. Merge `main` in first so the settings and
chat contracts are current (`concise_mode` in `/api/settings`, `concise` in
`/api/chat`). `mobile/` is disjoint from `main`'s changes; no conflicts
expected. The deployed backend already supports both fields.

## 3. Backend contract (existing, unchanged)

- `GET /api/settings` → `{ active_stages, hide_title, hide_difficulty,
  concise_mode, active_topics, tour_done }`
- `PUT /api/settings` with the same six fields (full replace). Mobile never
  edits `active_topics`/`tour_done` but round-trips the values it last read so
  a PUT does not clobber them.
- `POST /api/chat` body gains `concise: boolean` (web parity).

## 4. Architecture

Mirror the web `useAuth` shape — extend the existing mobile `AuthContext`
rather than adding a new context.

### `src/api/settings.ts`

- Add `concise_mode: boolean` to the `getSettings` response type.
- Add `updateSettings(activeStages, hideTitle, hideDifficulty, conciseMode,
  activeTopics, tourDone)` → `PUT /api/settings`, snake_case body, throws on
  non-OK (callers ignore).

### `src/api/chat.ts`

- `streamChat` request body gains `concise: boolean`.

### `src/auth/auth-context.tsx`

- New state: `conciseMode` (default `false`), plus keep the fetched
  `active_topics`/`tour_done` in refs/state for PUT round-tripping.
- New persist functions, each optimistic-update-then-fire-and-forget when a
  session exists, state-only when anonymous:
  `persistStages`, `persistHideTitle`, `persistHideDifficulty`,
  `persistConciseMode`. PUT failures are swallowed (`.catch(() => {})`), web
  parity — the optimistic UI stands.
- Context value gains `conciseMode` and the four persist functions.

### `src/theme/theme-context.tsx`

- New `themePreference: 'system' | 'light' | 'dark'`, default `system`,
  loaded from AsyncStorage key `leetgame_theme` on mount, written on change.
- Resolved theme = preference, except `system` follows the OS color scheme
  (current behavior). Expose `themePreference` + `setThemePreference`.
- Device-local for everyone (signed in or not), matching web's localStorage
  theme handling.

### `src/app/settings.tsx` + components

- New expo-router screen pushed from a gear button (testID
  `settings-button`) in the Practice header next to the account button.
- Sections mirror the web dropdown:
  - **Display** — theme segmented control (`system`/`light`/`dark`), then
    checkbox rows for Hide problem title, Hide difficulty, Concise mode
    (label + one-line description, same copy as web).
  - **Practice Stages** — the 5 canonical stages with label + description.
    Toggle rule identical to web: adding a stage re-derives the active list
    from canonical order; the last remaining active stage is disabled
    (minimum 1).
- A small `SettingRow` presentational component (checkbox + label +
  description) keeps rows consistent. Every interactive element gets a
  testID (`settings-theme-system`, `settings-hide-title`,
  `settings-stage-pattern`, …) — Task 8 verification showed untagged
  controls are painful to drive.

### `src/practice/use-practice-session.ts`

- Pass `concise` (from AuthContext) into `streamChat`. Stage changes apply to
  the next session via the existing `sessionActiveStages` snapshot — no new
  logic.

## 5. Error handling

- `updateSettings` failures: ignored (optimistic UI, web parity).
- AsyncStorage read/write failures: try/catch, fall back to `system`.

## 6. Testing

Unit (jest-expo, existing patterns):

- `updateSettings` sends the exact six-field snake_case body and auth header.
- AuthContext persist functions: signed-in → PUT called with merged values;
  anonymous → no network call; state updates in both cases.
- Stage toggle rule: canonical order preserved, last active stage can't be
  removed.
- Theme: preference resolution (`system` follows OS) and AsyncStorage
  round-trip.
- `streamChat` body includes `concise`.

Manual (rn-agentic-loop on iOS simulator, receipt-driven):

- Gear button navigates to `/settings`; controls render with account values.
- Toggling concise mode fires `PUT /api/settings` with `concise_mode: true`
  (network receipt); the next `/api/chat` POST body carries `concise: true`.
- Toggling a stage updates the next session's banner stages.
- Theme picker switches the palette live and survives an app restart.
- Anonymous: toggles change practice behavior, no PUT fires.
