# Mobile Settings Tuning UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile settings tunable — practice stages, hide title, hide difficulty, concise mode, theme — in a `/settings` screen, persisted via `PUT /api/settings` when signed in.

**Architecture:** Extend the existing mobile `AuthContext` with persist functions mirroring web `useAuth` (optimistic update + fire-and-forget PUT). Theme preference lives in `ThemeContext` + AsyncStorage. A new expo-router `/settings` screen hosts the controls; `concise` threads through `streamChat` into `/api/chat`.

**Tech Stack:** Expo SDK 56 / expo-router, `@react-native-async-storage/async-storage` (already installed, v2.2.0), jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-07-05-mobile-settings-design.md`

## Global Constraints

- Work on the `feat/mobile-app` branch. All mobile code lives in `mobile/`.
- Read the exact versioned Expo docs (https://docs.expo.dev/versions/v56.0.0/) before writing Expo/RN code (per `mobile/AGENTS.md`).
- Backend is unchanged. `PUT /api/settings` full-replace body: `active_stages, hide_title, hide_difficulty, concise_mode, active_topics, tour_done` (all snake_case). Mobile never edits `active_topics`/`tour_done` — round-trip the last-read values.
- Anonymous users: settings changes are in-memory only (no storage, no PUT). Theme preference is device-local (AsyncStorage) for everyone.
- Stage toggle rule: canonical order always preserved; minimum 1 active stage.
- `updateSettings` failures are swallowed by callers (`.catch(() => {})`) — optimistic UI stands (web parity).
- Every interactive element gets a `testID`.
- All commands run from `mobile/` unless stated otherwise. Test with `npx jest <path>`, typecheck with `npx tsc --noEmit`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Task 1: Merge main into feat/mobile-app

**Files:** none edited by hand (merge commit only).

**Interfaces:**
- Produces: current backend/web contract in-tree (`concise_mode` in settings, `concise` in chat) for reference; `mobile/` is untouched by the merge.

- [ ] **Step 1: Merge**

Run from the repo root (`/Users/aaronkim/projects/leetgame`):

```bash
git checkout feat/mobile-app
git merge main --no-edit
```

Expected: clean merge (`mobile/` is disjoint from main's changes). If conflicts appear, they will be in docs — resolve keeping both sides.

- [ ] **Step 2: Verify mobile is unaffected**

```bash
cd mobile && npx tsc --noEmit && npx jest
```

Expected: typecheck clean, 9 suites / 18 tests pass.

- [ ] **Step 3: Verify the frontend/backend still build (pre-commit hook runs these anyway)**

```bash
cd .. && git log --oneline -1
```

Expected: a merge commit like `Merge branch 'main' into feat/mobile-app`. (The merge commits itself; no separate commit step.)

---

## Task 2: Settings API — `updateSettings` + `concise_mode` in `getSettings`

**Files:**
- Modify: `mobile/src/api/settings.ts`
- Create: `mobile/src/api/settings.test.ts`

**Interfaces:**
- Consumes: `API_URL`, `authHeaders()` from `./client`; `ActiveStage` from `../types`.
- Produces:
  - `getSettings(): Promise<{ active_stages: ActiveStage[]; hide_title: boolean; hide_difficulty: boolean; concise_mode: boolean; active_topics: string[]; tour_done: boolean }>`
  - `updateSettings(activeStages: ActiveStage[], hideTitle: boolean, hideDifficulty: boolean, conciseMode: boolean, activeTopics: string[], tourDone: boolean): Promise<void>` — throws on non-OK.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/api/settings.test.ts`:

```ts
jest.mock('../auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'tok' } },
      })),
    },
  },
}))

import { updateSettings } from './settings'

test('updateSettings PUTs the full six-field snake_case body with auth', async () => {
  const fetchMock = jest.fn(async () => ({ ok: true }))
  globalThis.fetch = fetchMock as unknown as typeof fetch

  await updateSettings(['pattern'], true, false, true, ['Array'], false)

  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    { method: string; headers: Record<string, string>; body: string },
  ]
  expect(url).toContain('/api/settings')
  expect(init.method).toBe('PUT')
  expect(init.headers.Authorization).toBe('Bearer tok')
  expect(JSON.parse(init.body)).toEqual({
    active_stages: ['pattern'],
    hide_title: true,
    hide_difficulty: false,
    concise_mode: true,
    active_topics: ['Array'],
    tour_done: false,
  })
})

test('updateSettings throws on non-OK response', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 500,
  })) as unknown as typeof fetch
  await expect(
    updateSettings(['pattern'], true, true, false, [], false),
  ).rejects.toThrow('Failed to update settings: 500')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/api/settings.test.ts`
Expected: FAIL — `updateSettings` is not exported.

- [ ] **Step 3: Implement**

Replace the whole of `mobile/src/api/settings.ts` with:

```ts
import type { ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSettings(): Promise<{
  active_stages: ActiveStage[]
  hide_title: boolean
  hide_difficulty: boolean
  concise_mode: boolean
  active_topics: string[]
  tour_done: boolean
}> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}

export async function updateSettings(
  activeStages: ActiveStage[],
  hideTitle: boolean,
  hideDifficulty: boolean,
  conciseMode: boolean,
  activeTopics: string[],
  tourDone: boolean,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      active_stages: activeStages,
      hide_title: hideTitle,
      hide_difficulty: hideDifficulty,
      concise_mode: conciseMode,
      active_topics: activeTopics,
      tour_done: tourDone,
    }),
  })
  if (!res.ok) throw new Error(`Failed to update settings: ${res.status}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/api/settings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/settings.ts src/api/settings.test.ts
git commit -m "feat(mobile): add updateSettings and concise_mode to settings API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: `streamChat` gains `concise`

**Files:**
- Modify: `mobile/src/api/chat.ts`
- Modify: `mobile/src/api/chat.test.ts`

**Interfaces:**
- Produces: `streamChat(problemId, stage, activeStages, history, message, hintRequested, answerRequested, concise: boolean, signal?)` — `concise` is a new positional param **before** `signal`; request body gains `concise`.

- [ ] **Step 1: Update the body-shape test to expect `concise`**

In `mobile/src/api/chat.test.ts`, the three `streamChat(...)` calls each gain a `false` (or `true`) argument after the `answerRequested` argument, and the body assertion gains `concise`:

- Line 39: `streamChat('p1', 'pattern', ['pattern', 'algorithm'], [], 'hi', false, false)` → `streamChat('p1', 'pattern', ['pattern', 'algorithm'], [], 'hi', false, false, false)`
- Line 56: `streamChat('p1', 'pattern', ['pattern'], [], 'hi', false, false)` → `streamChat('p1', 'pattern', ['pattern'], [], 'hi', false, false, false)`
- Line 67: `streamChat('p1', 'pattern', ['pattern'], [{ role: 'user', content: 'prev' }], 'hi', true, false)` → `...'hi', true, false, true)`
- The `expect(body).toEqual({...})` block gains `concise: true,` after `answer_requested: false,`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/api/chat.test.ts`
Expected: FAIL — body does not contain `concise` (the third test's `toEqual` mismatches).

- [ ] **Step 3: Implement**

In `mobile/src/api/chat.ts`, change the signature and body:

```ts
export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  concise: boolean,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'done'; stage: Stage; message: string }
> {
```

and in the `JSON.stringify` body add `concise,` after `answer_requested: answerRequested,`.

Note: `mobile/src/practice/use-practice-session.ts` now fails typecheck (missing arg). Fix it minimally in this task by passing `false` at the call site (line 89 area, after `answer,`):

```ts
          answer,
          false,
          controller.signal,
```

(Task 6 replaces this `false` with the real setting.)

- [ ] **Step 4: Run tests and typecheck**

Run: `npx jest src/api/chat.test.ts src/practice/use-practice-session.test.tsx && npx tsc --noEmit`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/chat.ts src/api/chat.test.ts src/practice/use-practice-session.ts
git commit -m "feat(mobile): thread concise flag through streamChat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: AuthContext — `conciseMode` + persist functions

**Files:**
- Modify: `mobile/src/auth/auth-context.tsx`
- Modify: `mobile/src/auth/auth-context.test.tsx`

**Interfaces:**
- Consumes: `updateSettings` from `../api/settings` (Task 2 signature).
- Produces (added to `AuthValue` and the provider value):
  - `conciseMode: boolean`
  - `persistStages(stages: ActiveStage[]): void`
  - `persistHideTitle(value: boolean): void`
  - `persistHideDifficulty(value: boolean): void`
  - `persistConciseMode(value: boolean): void`

- [ ] **Step 1: Write the failing tests**

Append to `mobile/src/auth/auth-context.test.tsx`. First extend the settings mock at the top of the file (line 18) to include `updateSettings`:

```ts
jest.mock(
  '../api/settings',
  () => ({ getSettings: jest.fn(), updateSettings: jest.fn(async () => {}) }),
  { virtual: true },
)
```

Then add at the bottom:

```tsx
import { getSettings, updateSettings } from '../api/settings'
import { getStreak } from '../api/streak'
import { Pressable } from 'react-native'

function PersistProbe() {
  const { conciseMode, persistConciseMode, persistStages } = useAuth()
  return (
    <>
      <Text testID="concise">{String(conciseMode)}</Text>
      <Pressable
        testID="toggle-concise"
        onPress={() => persistConciseMode(true)}
      />
      <Pressable
        testID="set-stages"
        onPress={() => persistStages(['pattern'])}
      />
    </>
  )
}

test('signed-in persistConciseMode PUTs merged settings', async () => {
  ;(getSettings as jest.Mock).mockResolvedValue({
    active_stages: ['pattern', 'algorithm'],
    hide_title: false,
    hide_difficulty: true,
    concise_mode: false,
    active_topics: ['Array'],
    tour_done: true,
  })
  ;(getStreak as jest.Mock).mockResolvedValue({
    streak: 1,
    last_practiced_at: null,
  })
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('SIGNED_IN', { access_token: 't' })
  })
  await waitFor(() => expect(getByTestId('concise').children[0]).toBe('false'))

  await act(async () => {
    getByTestId('toggle-concise').props.onPress()
  })
  expect(getByTestId('concise').children[0]).toBe('true')
  expect(updateSettings).toHaveBeenCalledWith(
    ['pattern', 'algorithm'], // stages unchanged
    false, // hide_title from fetched settings
    true, // hide_difficulty from fetched settings
    true, // the new concise value
    ['Array'], // topics round-tripped
    true, // tour_done round-tripped
  )
})

test('anonymous persistStages updates state without a PUT', async () => {
  ;(updateSettings as jest.Mock).mockClear()
  const { getByTestId } = await render(
    <AuthProvider>
      <PersistProbe />
    </AuthProvider>,
  )
  await act(async () => {
    authState.callback('INITIAL_SESSION', null)
  })
  await act(async () => {
    getByTestId('set-stages').props.onPress()
  })
  expect(updateSettings).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/auth/auth-context.test.tsx`
Expected: FAIL — `conciseMode` / `persistConciseMode` undefined.

- [ ] **Step 3: Implement**

In `mobile/src/auth/auth-context.tsx`:

1. Import `updateSettings` and `NEETCODE_TOPICS`:

```ts
import { getSettings, updateSettings } from '../api/settings'
import { DEFAULT_STAGES, NEETCODE_TOPICS, type ActiveStage } from '../types'
```

2. Extend `AuthValue`:

```ts
interface AuthValue {
  session: Session | null
  authReady: boolean
  streak: number | null
  streakStatus: StreakStatus
  activeStages: ActiveStage[]
  hideTitle: boolean
  hideDifficulty: boolean
  conciseMode: boolean
  persistStages: (stages: ActiveStage[]) => void
  persistHideTitle: (value: boolean) => void
  persistHideDifficulty: (value: boolean) => void
  persistConciseMode: (value: boolean) => void
  signOut: () => Promise<void>
  refreshStreak: () => void
}
```

3. Add state after `hideDifficulty`:

```ts
const [conciseMode, setConciseMode] = useState(false)
const [activeTopics, setActiveTopics] = useState<string[]>(NEETCODE_TOPICS)
const [tourDone, setTourDone] = useState(false)
```

4. In the `getSettings().then((s) => {...})` block add:

```ts
setConciseMode(s.concise_mode)
setActiveTopics(s.active_topics ?? NEETCODE_TOPICS)
setTourDone(s.tour_done)
```

5. In the signed-out `else` branch add (after `setHideDifficulty(true)`):

```ts
setConciseMode(false)
setActiveTopics(NEETCODE_TOPICS)
setTourDone(false)
```

6. Add persist functions before the `return` (plain functions, not
`useCallback` — they close over current state each render, mirroring web
`useAuth`):

```ts
const persist = (
  stages: ActiveStage[],
  title: boolean,
  difficulty: boolean,
  concise: boolean,
) => {
  if (!session) return
  updateSettings(stages, title, difficulty, concise, activeTopics, tourDone)
    .catch(() => {})
}

const persistStages = (stages: ActiveStage[]) => {
  setActiveStages(stages)
  persist(stages, hideTitle, hideDifficulty, conciseMode)
}
const persistHideTitle = (value: boolean) => {
  setHideTitle(value)
  persist(activeStages, value, hideDifficulty, conciseMode)
}
const persistHideDifficulty = (value: boolean) => {
  setHideDifficulty(value)
  persist(activeStages, hideTitle, value, conciseMode)
}
const persistConciseMode = (value: boolean) => {
  setConciseMode(value)
  persist(activeStages, hideTitle, hideDifficulty, value)
}
```

7. Add `conciseMode` and the four persist functions to the provider `value`.

- [ ] **Step 4: Run the full suite**

Run: `npx jest && npx tsc --noEmit`
Expected: all suites PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth-context.tsx src/auth/auth-context.test.tsx
git commit -m "feat(mobile): add settings persist functions to AuthContext

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: ThemeContext — preference + AsyncStorage

**Files:**
- Modify: `mobile/src/theme/theme-context.tsx`
- Create: `mobile/src/theme/theme-context.test.tsx`

**Interfaces:**
- Consumes: `themes` from `./tokens`; `@react-native-async-storage/async-storage`.
- Produces:
  - `type ThemePreference = 'system' | 'light' | 'dark'` (exported)
  - `useThemePreference(): { preference: ThemePreference; setPreference: (p: ThemePreference) => void }`
  - `useTheme(): Theme` — unchanged signature; now resolves from preference.
  - AsyncStorage key: `leetgame_theme`.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/theme/theme-context.test.tsx`:

```tsx
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'
import { act, render, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'
import { ThemeProvider, useTheme, useThemePreference } from './theme-context'
import { themes } from './tokens'

function Probe() {
  const theme = useTheme()
  const { preference, setPreference } = useThemePreference()
  return (
    <>
      <Text testID="bg">{theme.background}</Text>
      <Text testID="pref">{preference}</Text>
      <Pressable testID="set-dark" onPress={() => setPreference('dark')} />
    </>
  )
}

test('setPreference overrides the OS scheme and persists to AsyncStorage', async () => {
  const { getByTestId } = await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  // jest-expo's useColorScheme mock returns 'light', so system → light bg
  expect(getByTestId('bg').children[0]).toBe(themes.light.background)

  await act(async () => {
    getByTestId('set-dark').props.onPress()
  })
  expect(getByTestId('pref').children[0]).toBe('dark')
  expect(getByTestId('bg').children[0]).toBe(themes.dark.background)
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('leetgame_theme', 'dark')
})

test('loads a stored preference on mount', async () => {
  await AsyncStorage.setItem('leetgame_theme', 'dark')
  const { getByTestId } = await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
  await waitFor(() =>
    expect(getByTestId('bg').children[0]).toBe(themes.dark.background),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/theme/theme-context.test.tsx`
Expected: FAIL — `useThemePreference` is not exported.

- [ ] **Step 3: Implement**

Replace the whole of `mobile/src/theme/theme-context.tsx` with:

```tsx
import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { themes, type Theme } from './tokens'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'leetgame_theme'

const ThemeCtx = createContext<Theme>(themes.light)
const ThemePrefCtx = createContext<{
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}>({ preference: 'system', setPreference: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'system' || v === 'light' || v === 'dark') {
          setPreferenceState(v)
        }
      })
      .catch(() => {})
  }, [])

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p)
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {})
  }

  const theme =
    preference === 'system'
      ? scheme === 'dark'
        ? themes.dark
        : themes.light
      : themes[preference]

  return (
    <ThemePrefCtx.Provider value={{ preference, setPreference }}>
      <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
    </ThemePrefCtx.Provider>
  )
}

export function useTheme(): Theme {
  return useContext(ThemeCtx)
}

export function useThemePreference() {
  return useContext(ThemePrefCtx)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/theme/theme-context.test.tsx && npx tsc --noEmit`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/theme/theme-context.tsx src/theme/theme-context.test.tsx
git commit -m "feat(mobile): add persisted theme preference to ThemeContext

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Stage toggle util

**Files:**
- Create: `mobile/src/practice/stage-toggle.ts`
- Create: `mobile/src/practice/stage-toggle.test.ts`

**Interfaces:**
- Consumes: `CANONICAL_STAGES`, `ActiveStage` from `../types`.
- Produces: `toggleStage(activeStages: ActiveStage[], stage: ActiveStage): ActiveStage[]` — pure; returns the input array unchanged when removal would empty the list.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/practice/stage-toggle.test.ts`:

```ts
import { toggleStage } from './stage-toggle'

test('removes an active stage', () => {
  expect(toggleStage(['pattern', 'algorithm'], 'algorithm')).toEqual([
    'pattern',
  ])
})

test('adding re-derives canonical order', () => {
  expect(toggleStage(['pattern', 'tc_sc'], 'edge_cases')).toEqual([
    'edge_cases',
    'pattern',
    'tc_sc',
  ])
})

test('refuses to remove the last active stage', () => {
  expect(toggleStage(['pattern'], 'pattern')).toEqual(['pattern'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/practice/stage-toggle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `mobile/src/practice/stage-toggle.ts` (logic copied from web
`StagesSettings.toggle`):

```ts
import { CANONICAL_STAGES, type ActiveStage } from '../types'

export function toggleStage(
  activeStages: ActiveStage[],
  stage: ActiveStage,
): ActiveStage[] {
  const isActive = activeStages.includes(stage)
  if (isActive && activeStages.length === 1) return activeStages
  return isActive
    ? activeStages.filter((s) => s !== stage)
    : CANONICAL_STAGES.filter((s) => activeStages.includes(s) || s === stage)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/practice/stage-toggle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/practice/stage-toggle.ts src/practice/stage-toggle.test.ts
git commit -m "feat(mobile): add pure stage toggle util

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Settings screen, SettingRow, gear button, route

**Files:**
- Create: `mobile/src/components/setting-row.tsx`
- Create: `mobile/src/app/settings.tsx`
- Modify: `mobile/src/app/_layout.tsx` (register route)
- Modify: `mobile/src/app/index.tsx` (gear button in header)

**Interfaces:**
- Consumes: `useAuth()` fields from Task 4, `useThemePreference()` from Task 5, `toggleStage` from Task 6.
- Produces: `/settings` route; `SettingRow` props `{ label: string; description: string; checked: boolean; disabled?: boolean; onPress: () => void; testID: string }`.

This task is presentational — no unit test (matches the existing convention:
screens and layout-only components in `mobile/src/app/` have no unit tests;
behavior is verified in Task 9 on the simulator).

- [ ] **Step 1: Create `SettingRow`**

Create `mobile/src/components/setting-row.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '@/theme/theme-context'

interface Props {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onPress: () => void
  testID: string
}

export function SettingRow({
  label,
  description,
  checked,
  disabled,
  onPress,
  testID,
}: Props) {
  const theme = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? theme.primary : theme.border,
          backgroundColor: checked ? theme.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <Text style={{ color: theme.primaryForeground, fontSize: 14 }}>
            ✓
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{ color: theme.foreground, fontSize: 15, fontWeight: '500' }}
        >
          {label}
        </Text>
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {description}
        </Text>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 2: Create the settings screen**

Create `mobile/src/app/settings.tsx` (copy mirrors web
`frontend/src/components/StagesSettings.tsx` structure and copy text):

```tsx
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useAuth } from '@/auth/auth-context'
import {
  useTheme,
  useThemePreference,
  type ThemePreference,
} from '@/theme/theme-context'
import { SettingRow } from '@/components/setting-row'
import { toggleStage } from '@/practice/stage-toggle'
import { CANONICAL_STAGES, type ActiveStage } from '@/types'

const STAGE_META: Record<ActiveStage, { label: string; description: string }> =
  {
    edge_cases: {
      label: 'Edge Cases',
      description: 'Identify boundary conditions and gotchas',
    },
    brute_force: {
      label: 'Brute Force',
      description: 'Describe the naive solution',
    },
    pattern: {
      label: 'Optimal Pattern',
      description: 'Identify the algorithm pattern',
    },
    algorithm: {
      label: 'Optimal Algorithm',
      description: 'Describe the optimal algorithm',
    },
    tc_sc: {
      label: 'Time & Space',
      description: 'State time and space complexity',
    },
  }

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark']

export default function SettingsScreen() {
  const theme = useTheme()
  const { preference, setPreference } = useThemePreference()
  const {
    activeStages,
    hideTitle,
    hideDifficulty,
    conciseMode,
    persistStages,
    persistHideTitle,
    persistHideDifficulty,
    persistConciseMode,
  } = useAuth()

  return (
    <ScrollView
      testID="settings-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingVertical: 12 }}
    >
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        Display
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text
          style={{ color: theme.foreground, fontSize: 15, fontWeight: '500' }}
        >
          Theme
        </Text>
        <View
          style={{
            flexDirection: 'row',
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          {THEME_OPTIONS.map((t) => (
            <Pressable
              key={t}
              testID={`settings-theme-${t}`}
              onPress={() => setPreference(t)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor:
                  preference === t ? theme.muted : 'transparent',
              }}
            >
              <Text
                style={{
                  color:
                    preference === t
                      ? theme.foreground
                      : theme.mutedForeground,
                  fontSize: 13,
                  fontWeight: preference === t ? '600' : '400',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <SettingRow
        testID="settings-hide-title"
        label="Hide problem title"
        description="Reveal on click to test recall"
        checked={hideTitle}
        onPress={() => persistHideTitle(!hideTitle)}
      />
      <SettingRow
        testID="settings-hide-difficulty"
        label="Hide difficulty"
        description="Reveal on click to test recall"
        checked={hideDifficulty}
        onPress={() => persistHideDifficulty(!hideDifficulty)}
      />
      <SettingRow
        testID="settings-concise-mode"
        label="Concise mode"
        description="Shorter interviewer replies"
        checked={conciseMode}
        onPress={() => persistConciseMode(!conciseMode)}
      />

      <View
        style={{
          borderTopWidth: 1,
          borderColor: theme.border,
          marginHorizontal: 16,
          marginVertical: 12,
        }}
      />
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 16,
          paddingBottom: 8,
        }}
      >
        Practice Stages
      </Text>
      {CANONICAL_STAGES.map((stage) => {
        const active = activeStages.includes(stage)
        const isLast = active && activeStages.length === 1
        return (
          <SettingRow
            key={stage}
            testID={`settings-stage-${stage}`}
            label={STAGE_META[stage].label}
            description={STAGE_META[stage].description}
            checked={active}
            disabled={isLast}
            onPress={() => persistStages(toggleStage(activeStages, stage))}
          />
        )
      })}
    </ScrollView>
  )
}
```

- [ ] **Step 3: Register the route**

In `mobile/src/app/_layout.tsx`, add inside the `<Stack>` after the
`account` screen:

```tsx
<Stack.Screen name="settings" options={{ title: 'Settings' }} />
```

- [ ] **Step 4: Add the gear button to the Practice header**

In `mobile/src/app/index.tsx`, inside the header `<View>` (the one with
`flexDirection: 'row'`), add **before** the streak indicator:

```tsx
<Link href="/settings" asChild>
  <Pressable testID="settings-button">
    <Text style={{ fontSize: 18 }}>⚙️</Text>
  </Pressable>
</Link>
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/setting-row.tsx src/app/settings.tsx src/app/_layout.tsx src/app/index.tsx
git commit -m "feat(mobile): add settings screen with stage, display, and theme controls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Thread `conciseMode` into the practice session

**Files:**
- Modify: `mobile/src/practice/use-practice-session.ts`
- Modify: `mobile/src/practice/use-practice-session.test.tsx`
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `streamChat` 8-arg signature (Task 3); `conciseMode` from `useAuth()` (Task 4).
- Produces: `usePracticeSession` `Opts` gains `conciseMode: boolean`.

- [ ] **Step 1: Write the failing test**

Append to `mobile/src/practice/use-practice-session.test.tsx`:

```tsx
test('submit passes conciseMode to streamChat', async () => {
  mockStreamScript.push({ type: 'done', stage: 'complete', message: 'ok' })
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: true,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('hi')
  })
  // streamChat(problemId, stage, activeStages, history, message, hint, answer, concise, signal)
  expect(mockStreamChat.mock.calls[0][7]).toBe(true)
})
```

Also add `conciseMode: false,` to the three existing `usePracticeSession({...})`
option objects in this file (the `Opts` type gains a required field).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/practice/use-practice-session.test.tsx`
Expected: FAIL — `mockStreamChat.mock.calls[0][7]` is `false` (the Task 3
placeholder), not `true`.

- [ ] **Step 3: Implement**

In `mobile/src/practice/use-practice-session.ts`:

1. `Opts` gains `conciseMode: boolean`; destructure it in the hook signature.
2. In `submit`, replace the `false` placeholder (added in Task 3) with
   `conciseMode`:

```ts
          answer,
          conciseMode,
          controller.signal,
```

3. Add `conciseMode` to the `submit` `useCallback` dependency array:
   `[problem, history, stage, conciseMode, onComplete]`.

In `mobile/src/app/index.tsx`:

1. Destructure `conciseMode` from `useAuth()`.
2. Pass it to `usePracticeSession`:

```ts
const practice = usePracticeSession({
  activeStages,
  activeTopics: NEETCODE_TOPICS,
  conciseMode,
  onComplete: () => {
    if (session) refreshStreak()
  },
})
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: all suites PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/practice/use-practice-session.ts src/practice/use-practice-session.test.tsx src/app/index.tsx
git commit -m "feat(mobile): pass concise mode through the practice session

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Manual E2E verification on iOS simulator

**Files:** none (verification only). Uses `rn-agentic-loop` / metro-mcp /
ios-simulator tooling, receipt-driven — declare each receipt before acting,
verify with runtime state (component props / network log), never a screenshot
alone.

- [ ] **Step 1: Launch**

`cd mobile && npx expo start`, then `xcrun simctl openurl booted "exp://127.0.0.1:8081"`
(avoids the Expo Go upgrade-download prompt that can time out).

- [ ] **Step 2: Navigation receipt**

Tap `settings-button` on the Practice header. Receipt: `get_current_route` →
`settings`; controls render with current AuthContext values (checked states
match `hideTitle`/`hideDifficulty`/`conciseMode`).

- [ ] **Step 3: Signed-in persistence receipt**

Sign in (dev account `leetgametest@gmail.com` / `leetgametest`, testIDs
`sign-in-email`, `sign-in-password`, `sign-in-submit`). In settings, toggle
Concise mode ON. Receipt: `PUT /api/settings → 200` fires with
`concise_mode: true` and the previously fetched `active_topics`/`tour_done`
intact in the body (check via `get_request_details`).

- [ ] **Step 4: Concise chat receipt**

Return to Practice, submit a message. Receipt: the `POST /api/chat` request
body contains `concise: true`.

- [ ] **Step 5: Stage toggle receipt**

In settings, disable a stage (e.g. Time & Space) → `PUT /api/settings` body
has the reduced `active_stages`. Back on Practice, tap Next Problem →
`StageBanner.props.sessionActiveStages` reflects the new list.

- [ ] **Step 6: Theme receipt**

Tap `settings-theme-dark`. Receipt: screen background flips to `#16171d`
(inspect a themed component's resolved style or screenshot for the visual
layer) AND relaunching the app (`xcrun simctl terminate` + `openurl`) still
shows dark (AsyncStorage receipt).

- [ ] **Step 7: Anonymous receipt**

Sign out. Toggle Hide difficulty in settings. Receipt: no `PUT /api/settings`
fires (clear the network buffer first); `ProblemView.props.hideDifficulty`
reflects the change on Practice.

- [ ] **Step 8: Document results + commit plan checkboxes**

Append a "Verification results" section to this plan, check off boxes, and
commit:

```bash
git add docs/superpowers/plans/2026-07-05-mobile-settings.md
git commit -m "docs: record mobile settings E2E verification results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
