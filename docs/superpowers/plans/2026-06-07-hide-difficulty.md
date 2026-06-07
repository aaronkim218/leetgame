# Hide Difficulty Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `hide_difficulty` setting that shows problem difficulty between the title and tags, blurred by default, click-to-reveal — with a settings toggle matching the existing `hide_title` pattern.

**Architecture:** Three independent layers: backend (DB column + model + storage + handler), frontend data layer (api.ts + useAuth), and frontend UI (StagesSettings + NavBar + App.tsx + ProblemView). Each task compiles and passes tests before proceeding to the next.

**Tech Stack:** Go/Fiber/pgx (backend), TypeScript/React/Tailwind (frontend)

---

### Task 1: Backend — add `hide_difficulty` end-to-end

**Files:**
- Modify: `backend/db/schema.sql`
- Modify: `backend/internal/models/user_settings.go`
- Modify: `backend/internal/storage/storage.go`
- Modify: `backend/internal/storage/postgres/user_settings.go`
- Modify: `backend/internal/handlers/settings.go`
- Modify: `backend/internal/storage/postgres/user_settings_test.go`

- [ ] **Step 1: Write failing test for default HideDifficulty**

Add to `backend/internal/storage/postgres/user_settings_test.go`:

```go
func TestDefaultHideDifficulty(t *testing.T) {
	// The no-rows default must have HideDifficulty = true
	// We test this by verifying the default struct in isolation
	defaults := models.UserSettings{
		HideDifficulty: true,
	}
	if !defaults.HideDifficulty {
		t.Error("default HideDifficulty must be true")
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/storage/postgres/... -run TestDefaultHideDifficulty -v
```

Expected: FAIL — `HideDifficulty` field does not exist on `models.UserSettings` yet.

- [ ] **Step 3: Add `HideDifficulty` to model**

Replace `backend/internal/models/user_settings.go` with:

```go
package models

import "github.com/google/uuid"

type UserSettings struct {
	UserID         uuid.UUID `json:"user_id"          db:"user_id"`
	ActiveStages   []string  `json:"active_stages"    db:"active_stages"`
	HideTitle      bool      `json:"hide_title"       db:"hide_title"`
	HideDifficulty bool      `json:"hide_difficulty"  db:"hide_difficulty"`
	ActiveTopics   []string  `json:"active_topics"    db:"active_topics"`
	TourDone       bool      `json:"tour_done"        db:"tour_done"`
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./internal/storage/postgres/... -run TestDefaultHideDifficulty -v
```

Expected: PASS.

- [ ] **Step 5: Update schema.sql**

In `backend/db/schema.sql`, find the `user_settings` CREATE TABLE and add `hide_difficulty`:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_stages   TEXT[]  NOT NULL DEFAULT '{pattern,algorithm,tc_sc}',
  hide_title      BOOLEAN NOT NULL DEFAULT TRUE,
  hide_difficulty BOOLEAN NOT NULL DEFAULT TRUE,
  active_topics   TEXT[]  NOT NULL DEFAULT '{}',
  tour_done       BOOLEAN NOT NULL DEFAULT FALSE
);
```

- [ ] **Step 6: Update the Storage interface**

In `backend/internal/storage/storage.go`, replace the `UpsertUserSettings` signature:

```go
UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, activeTopics []string, tourDone bool) error
```

- [ ] **Step 7: Update postgres GetUserSettings**

In `backend/internal/storage/postgres/user_settings.go`, replace the entire `GetUserSettings` function:

```go
func (p *Postgres) GetUserSettings(ctx context.Context, userID uuid.UUID) (models.UserSettings, error) {
	const sql = `SELECT user_id, active_stages, hide_title, hide_difficulty, active_topics, tour_done FROM user_settings WHERE user_id = $1`
	return utils.Retry(ctx, func(ctx context.Context) (models.UserSettings, error) {
		row, err := p.Pool.Query(ctx, sql, userID)
		if err != nil {
			return models.UserSettings{}, err
		}
		s, err := pgx.CollectOneRow(row, pgx.RowToStructByName[models.UserSettings])
		if errors.Is(err, pgx.ErrNoRows) {
			return models.UserSettings{
				UserID:         userID,
				ActiveStages:   defaultActiveStages,
				HideTitle:      true,
				HideDifficulty: true,
				ActiveTopics:   defaultActiveTopics,
				TourDone:       false,
			}, nil
		}
		if err != nil {
			return models.UserSettings{}, err
		}
		s.ActiveTopics = resolveActiveTopics(s.ActiveTopics)
		return s, nil
	})
}
```

- [ ] **Step 8: Update postgres UpsertUserSettings**

In `backend/internal/storage/postgres/user_settings.go`, replace the entire `UpsertUserSettings` function:

```go
func (p *Postgres) UpsertUserSettings(ctx context.Context, userID uuid.UUID, activeStages []string, hideTitle bool, hideDifficulty bool, activeTopics []string, tourDone bool) error {
	const sql = `
		INSERT INTO user_settings (user_id, active_stages, hide_title, hide_difficulty, active_topics, tour_done)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE
		SET active_stages   = EXCLUDED.active_stages,
		    hide_title      = EXCLUDED.hide_title,
		    hide_difficulty = EXCLUDED.hide_difficulty,
		    active_topics   = EXCLUDED.active_topics,
		    tour_done       = EXCLUDED.tour_done
	`
	_, err := utils.Retry(ctx, func(ctx context.Context) (struct{}, error) {
		_, err := p.Pool.Exec(ctx, sql, userID, activeStages, hideTitle, hideDifficulty, activeTopics, tourDone)
		return struct{}{}, err
	})
	return err
}
```

- [ ] **Step 9: Update settings handler**

Replace the entire contents of `backend/internal/handlers/settings.go` with:

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
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
	}
	return c.JSON(response{
		ActiveStages:   settings.ActiveStages,
		HideTitle:      settings.HideTitle,
		HideDifficulty: settings.HideDifficulty,
		ActiveTopics:   settings.ActiveTopics,
		TourDone:       settings.TourDone,
	})
}

func (hs *HandlerService) UpdateSettings(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	type request struct {
		ActiveStages   []string `json:"active_stages"`
		HideTitle      bool     `json:"hide_title"`
		HideDifficulty bool     `json:"hide_difficulty"`
		ActiveTopics   []string `json:"active_topics"`
		TourDone       bool     `json:"tour_done"`
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

	if err := hs.storage.UpsertUserSettings(c.Context(), uid, req.ActiveStages, req.HideTitle, req.HideDifficulty, req.ActiveTopics, req.TourDone); err != nil {
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

- [ ] **Step 10: Run all backend tests**

```bash
cd /Users/aaronkim/projects/leetgame/backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
cd /Users/aaronkim/projects/leetgame && git add backend/db/schema.sql backend/internal/models/user_settings.go backend/internal/storage/storage.go backend/internal/storage/postgres/user_settings.go backend/internal/storage/postgres/user_settings_test.go backend/internal/handlers/settings.go
git commit -m "feat: add hide_difficulty field to user settings"
```

---

### Task 2: Frontend data layer — api.ts and useAuth

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: Update api.ts — getSettings return type**

In `frontend/src/api.ts`, find and replace the `getSettings` function:

```ts
export async function getSettings(): Promise<{ active_stages: ActiveStage[]; hide_title: boolean; hide_difficulty: boolean; active_topics: string[]; tour_done: boolean }> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Update api.ts — updateSettings signature**

In `frontend/src/api.ts`, find and replace the `updateSettings` function:

```ts
export async function updateSettings(activeStages: ActiveStage[], hideTitle: boolean, hideDifficulty: boolean, activeTopics: string[], tourDone: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ active_stages: activeStages, hide_title: hideTitle, hide_difficulty: hideDifficulty, active_topics: activeTopics, tour_done: tourDone }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
```

- [ ] **Step 3: Update useAuth — add hideDifficulty state**

In `frontend/src/hooks/useAuth.ts`, after the line `const [hideTitle, setHideTitle] = useState(true)`, add:

```ts
const [hideDifficulty, setHideDifficulty] = useState(true)
```

- [ ] **Step 4: Update useAuth — load hideDifficulty from API**

Find the `getSettings()` `.then(` block (around line 48). Replace it with:

```ts
getSettings()
  .then(({ active_stages, hide_title, hide_difficulty, active_topics, tour_done }) => {
    setActiveStages(active_stages)
    setHideTitle(hide_title)
    setHideDifficulty(hide_difficulty)
    setActiveTopics(active_topics ?? NEETCODE_TOPICS)
    setTourDone(tour_done)
  })
  .catch(() => {})
  .finally(() => setSettingsReady(true))
```

- [ ] **Step 5: Update useAuth — fix all updateSettings call sites**

`updateSettings` now takes `hideDifficulty` as the third argument (between `hideTitle` and `activeTopics`). Update all four call sites:

In `persistStages`:
```ts
updateSettings(stages, hideTitle, hideDifficulty, activeTopics, tourDone).catch(() => {})
```

In `persistHideTitle`:
```ts
updateSettings(activeStages, value, hideDifficulty, activeTopics, tourDone).catch(() => {})
```

In `persistTopics`:
```ts
updateSettings(activeStages, hideTitle, hideDifficulty, topics, tourDone).catch(() => {})
```

In `persistTourDone`:
```ts
updateSettings(activeStages, hideTitle, hideDifficulty, activeTopics, true).catch(() => {})
```

- [ ] **Step 6: Add persistHideDifficulty to useAuth**

After the `persistHideTitle` function, add:

```ts
const persistHideDifficulty = (value: boolean) => {
  setHideDifficulty(value)
  if (session) {
    updateSettings(activeStages, hideTitle, value, activeTopics, tourDone).catch(() => {})
  }
}
```

- [ ] **Step 7: Export hideDifficulty and persistHideDifficulty from useAuth**

Find the `return {` block at the bottom. Add `hideDifficulty` and `persistHideDifficulty` to the returned object:

```ts
return {
  session,
  authLoading,
  streak,
  streakStatus,
  activeStages,
  hideTitle,
  hideDifficulty,
  activeTopics,
  tourDone,
  settingsReady,
  persistStages,
  persistHideTitle,
  persistHideDifficulty,
  persistTopics,
  persistTourDone,
  recordAndUpdateStreak,
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: errors about `hideDifficulty` not yet wired into `StagesSettings`/`NavBar`/`App.tsx`/`ProblemView` — that's fine. There must be NO errors in `api.ts` or `useAuth.ts` themselves.

- [ ] **Step 9: Commit**

```bash
cd /Users/aaronkim/projects/leetgame && git add frontend/src/api.ts frontend/src/hooks/useAuth.ts
git commit -m "feat: add hideDifficulty to frontend data layer"
```

---

### Task 3: Frontend UI — StagesSettings, NavBar, App.tsx, ProblemView

**Files:**
- Modify: `frontend/src/components/StagesSettings.tsx`
- Modify: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ProblemView.tsx`

- [ ] **Step 1: Update StagesSettings — add hideDifficulty props**

In `frontend/src/components/StagesSettings.tsx`, replace the `Props` interface:

```ts
interface Props {
  activeStages: ActiveStage[]
  onChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  hideDifficulty: boolean
  onHideDifficultyChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}
```

Replace the function signature:

```ts
export function StagesSettings({ activeStages, onChange, hideTitle, onHideTitleChange, hideDifficulty, onHideDifficultyChange, onTakeTour, theme, onThemeChange }: Props) {
```

- [ ] **Step 2: Render "Hide difficulty" checkbox in StagesSettings**

After the "Hide problem title" button block (after the closing `</button>` around line 68), add:

```tsx
<button
  onClick={() => onHideDifficultyChange(!hideDifficulty)}
  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted cursor-pointer transition-colors"
>
  <Checkbox checked={hideDifficulty} onCheckedChange={v => onHideDifficultyChange(v === true)} />
  <div>
    <p className="text-sm font-medium">Hide difficulty</p>
    <p className="text-xs text-muted-foreground">Reveal on click to test recall</p>
  </div>
</button>
```

- [ ] **Step 3: Update NavBar — add hideDifficulty props**

In `frontend/src/components/NavBar.tsx`, replace the `Props` interface:

```ts
interface Props {
  view: View
  onNavigate: (v: View) => void
  session: Session | null
  authLoading: boolean
  streak: number | null
  streakStatus: 'solid' | 'hollow' | 'none' | null
  activeStages: ActiveStage[]
  onStagesChange: (stages: ActiveStage[]) => void
  hideTitle: boolean
  onHideTitleChange: (value: boolean) => void
  hideDifficulty: boolean
  onHideDifficultyChange: (value: boolean) => void
  onTakeTour?: () => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}
```

Replace the function signature (add `hideDifficulty` and `onHideDifficultyChange` to destructuring):

```ts
export function NavBar({ view, onNavigate, session, authLoading, streak, streakStatus, activeStages, onStagesChange, hideTitle, onHideTitleChange, hideDifficulty, onHideDifficultyChange, onTakeTour, theme, onThemeChange }: Props) {
```

Find the `<StagesSettings` JSX block inside NavBar and add the two new props:

```tsx
<StagesSettings
  activeStages={activeStages}
  onChange={onStagesChange}
  hideTitle={hideTitle}
  onHideTitleChange={onHideTitleChange}
  hideDifficulty={hideDifficulty}
  onHideDifficultyChange={onHideDifficultyChange}
  onTakeTour={onTakeTour}
  theme={theme}
  onThemeChange={onThemeChange}
/>
```

- [ ] **Step 4: Update App.tsx — wire hideDifficulty**

In `frontend/src/App.tsx`, find the `useAuth()` destructure (around line 59). Add `hideDifficulty` and `persistHideDifficulty`:

```ts
const { session, authLoading, streak, streakStatus, activeStages, hideTitle, hideDifficulty, activeTopics, tourDone, settingsReady, persistStages, persistHideTitle, persistHideDifficulty, persistTopics, persistTourDone, recordAndUpdateStreak } = useAuth()
```

After `handleHideTitleChange` (around line 124), add:

```ts
const handleHideDifficultyChange = (value: boolean) => {
  persistHideDifficulty(value)
}
```

Find the `<NavBar` JSX block (where `hideTitle` and `onHideTitleChange` are passed). Add the two new props:

```tsx
hideDifficulty={hideDifficulty}
onHideDifficultyChange={handleHideDifficultyChange}
```

Find both `<ProblemView` JSX blocks (there are two, around lines 459 and 500). Add `hideDifficulty={hideDifficulty}` to each.

- [ ] **Step 5: Update ProblemView — add hideDifficulty prop**

In `frontend/src/components/ProblemView.tsx`, add `hideDifficulty` to the props destructuring and type:

```tsx
export function ProblemView({
  problem,
  onSkip,
  onBack,
  onExitPlaylist,
  playlistSummary,
  hideTitle = true,
  isSaved = false,
  onToggleSave,
  onSmartPractice,
  smartMode = false,
  shuffle,
  onToggleShuffle,
  hideDifficulty = false,
}: {
  problem: Problem
  onSkip: () => void
  onBack?: () => void
  onExitPlaylist?: () => void
  onSmartPractice?: () => void
  smartMode?: boolean
  playlistSummary?: SearchPlaylistSummary | null
  hideTitle?: boolean
  isSaved?: boolean
  onToggleSave?: () => void
  shuffle?: boolean
  onToggleShuffle?: () => void
  hideDifficulty?: boolean
}) {
```

- [ ] **Step 6: Add difficultyOpen state to ProblemView**

After the `const [tagsOpen, setTagsOpen] = useState(false)` line, add:

```ts
const [difficultyOpen, setDifficultyOpen] = useState(false)
```

No `useEffect` needed — `key={problem.id}` in App.tsx remounts the component for each new problem, resetting all local state automatically.

- [ ] **Step 7: Render difficulty between title row and tags section**

Find the closing `</div>` of the title row block (the `flex items-start gap-2 mb-3` div). After it, insert the difficulty display block:

```tsx
<div className="relative inline-block mb-3">
  <span
    className={cn(
      "text-xs font-semibold transition-all duration-200 block",
      difficultyColor[problem.difficulty] ?? 'text-muted-foreground',
      hideDifficulty && !difficultyOpen ? "opacity-0 blur-[5px]" : ""
    )}
  >
    {problem.difficulty}
  </span>
  {hideDifficulty && !difficultyOpen && (
    <span
      className="absolute inset-0 flex items-center text-muted-foreground text-xs italic cursor-pointer select-none whitespace-nowrap"
      onClick={() => setDifficultyOpen(true)}
    >
      Reveal difficulty
    </span>
  )}
</div>
```

The `relative inline-block` container lets the `absolute inset-0` overlay cover the blurred text. `whitespace-nowrap` prevents the overlay text from wrapping within the small container.

- [ ] **Step 8: Verify TypeScript compiles cleanly**

```bash
cd /Users/aaronkim/projects/leetgame/frontend && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 9: Manual smoke test**

Start the dev server if not running:
```bash
cd /Users/aaronkim/projects/leetgame/frontend && npm run dev
```

Test these cases:
1. **Default state** — difficulty shows as "Reveal difficulty" italic text below the problem title, before "Show topics". Clicking it reveals the colored difficulty word (Easy/Medium/Hard). Moving to the next problem resets back to hidden.
2. **Toggle off in settings** — open settings (gear icon), check that "Hide difficulty" checkbox is present below "Hide problem title". Uncheck it. Difficulty now shows immediately on all problems without needing to click.
3. **Toggle back on** — re-check "Hide difficulty". Difficulty is hidden again on next problem.
4. **Logged out** — difficulty defaults to hidden (same as logged-in default).

- [ ] **Step 10: Commit**

```bash
cd /Users/aaronkim/projects/leetgame && git add frontend/src/components/StagesSettings.tsx frontend/src/components/NavBar.tsx frontend/src/App.tsx frontend/src/components/ProblemView.tsx
git commit -m "feat: show difficulty between title and tags with hide/reveal setting"
```
