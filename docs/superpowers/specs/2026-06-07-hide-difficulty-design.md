# Hide Difficulty Setting Design

## Goal

Show problem difficulty between the title and the tags section. Hidden by default with a click-to-reveal blur mechanic (same as hide title). A settings toggle lets users disable hiding so difficulty is always shown.

## Display Behavior

A small colored difficulty badge (`Easy` / `Medium` / `Hard`) is rendered between the title row and the "Show topics" toggle in `ProblemView`.

When `hideDifficulty = true` (default):
- Badge renders with `opacity-0 blur-[5px]`, matching the hidden-title style
- Clicking it sets local `difficultyOpen` state to `true`, revealing it
- `difficultyOpen` resets to `false` when a new problem loads (keyed on `problem.id`)
- An "Click to reveal difficulty" placeholder text overlays the blurred badge, same pattern as the title

When `hideDifficulty = false`:
- Badge always renders clearly, no click needed

Colors: `text-easy`, `text-medium`, `text-hard` — same as existing `difficultyColor` map.

## Settings UI

A new "Hide difficulty" checkbox in `StagesSettings` under the Display section, directly below "Hide problem title":

- Label: `Hide difficulty`
- Description: `Reveal on click to test recall`
- Controlled by `hideDifficulty` prop, calls `onHideDifficultyChange`

## Backend Changes

### DB

Add column to `user_settings`:
```sql
ALTER TABLE user_settings ADD COLUMN hide_difficulty BOOLEAN NOT NULL DEFAULT TRUE;
```

Update `db/schema.sql` to include the column.

### Model (`internal/models/user_settings.go`)

Add field:
```go
HideDifficulty bool `json:"hide_difficulty" db:"hide_difficulty"`
```

### Storage interface (`internal/storage/storage.go`)

Update `UpsertUserSettings` signature to add `hideDifficulty bool` parameter.

### Postgres storage (`internal/storage/postgres/user_settings.go`)

- `GetUserSettings`: add `hide_difficulty` to SELECT, set `HideDifficulty: true` in the no-rows default
- `UpsertUserSettings`: add `hide_difficulty` to INSERT columns, VALUES, and ON CONFLICT SET; add `$6` parameter

### Handler (`internal/handlers/settings.go`)

- `GetSettings` response struct: add `HideDifficulty bool \`json:"hide_difficulty"\``
- `UpdateSettings` request struct: add `HideDifficulty bool \`json:"hide_difficulty"\``
- Pass `req.HideDifficulty` to `UpsertUserSettings`

## Frontend Changes

### API (`frontend/src/api.ts`)

- `getSettings` return type: add `hide_difficulty: boolean`
- `updateSettings` signature: add `hideDifficulty: boolean` parameter; include `hide_difficulty: hideDifficulty` in request body

### useAuth (`frontend/src/hooks/useAuth.ts`)

- Add `const [hideDifficulty, setHideDifficulty] = useState(true)`
- In settings load: `setHideDifficulty(settings.hide_difficulty)`
- Add `persistHideDifficulty(value: boolean)`: calls `setHideDifficulty(value)` and `updateSettings(..., value, ...)`
- Export `hideDifficulty` and `persistHideDifficulty`

### StagesSettings (`frontend/src/components/StagesSettings.tsx`)

- Add `hideDifficulty: boolean` and `onHideDifficultyChange: (value: boolean) => void` to Props
- Render checkbox below "Hide problem title", same style

### App.tsx (`frontend/src/App.tsx`)

- Destructure `hideDifficulty` and `persistHideDifficulty` from `useAuth()`
- Add `handleHideDifficultyChange` handler calling `persistHideDifficulty`
- Pass `hideDifficulty` and `onHideDifficultyChange` to `StagesSettings`
- Pass `hideDifficulty` to both `ProblemView` call sites

### ProblemView (`frontend/src/components/ProblemView.tsx`)

- Add `hideDifficulty?: boolean` prop (defaults to `false` — safe for any caller that doesn't pass it)
- Add `const [difficultyOpen, setDifficultyOpen] = useState(false)` — no useEffect needed since `key={problem.id}` already remounts the component per problem
- Remove `useEffect` for `difficultyOpen` reset (remount handles it)
- Render between the title row and the tags section:

```tsx
<div className="mb-3 relative inline-block">
  <span
    onClick={() => hideDifficulty && setDifficultyOpen(true)}
    className={cn(
      "text-xs font-semibold transition-all duration-200",
      difficultyColor[problem.difficulty] ?? 'text-muted-foreground',
      hideDifficulty && !difficultyOpen ? "opacity-0 blur-[5px] cursor-pointer select-none" : ""
    )}
  >
    {problem.difficulty}
  </span>
  {hideDifficulty && !difficultyOpen && (
    <span className="absolute inset-0 flex items-center text-muted-foreground text-xs italic cursor-pointer"
      onClick={() => setDifficultyOpen(true)}>
      Click to reveal
    </span>
  )}
</div>
```

## Files Changed

- `backend/db/schema.sql`
- `backend/internal/models/user_settings.go`
- `backend/internal/storage/storage.go`
- `backend/internal/storage/postgres/user_settings.go`
- `backend/internal/handlers/settings.go`
- `frontend/src/api.ts`
- `frontend/src/hooks/useAuth.ts`
- `frontend/src/components/StagesSettings.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/ProblemView.tsx`
