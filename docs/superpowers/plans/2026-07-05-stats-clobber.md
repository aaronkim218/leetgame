# Settings-Clobber Fix + Mobile Stats Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the cross-platform settings-clobber bug (a failed `getSettings` load followed by any toggle wipes server settings via full-replace PUT), and port the web Stats page to the RN app: proficiency bars, topic picker, and sticky smart-practice mode.

**Architecture:** Part A adds a success-only `settingsLoaded` flag on both platforms; signed-in persist functions skip the network PUT until it is set (local state still updates). Part B adds a `/stats` expo-router screen fed by two new API functions, exposes `activeTopics`/`persistTopics` from the mobile AuthContext, and makes the practice session's problem source sticky (`'random' | 'smart'`) with a banner + exit.

**Tech Stack:** React 19 + vitest + @testing-library/react (web, `frontend/`); Expo SDK 56 + expo-router 56.2.11 + jest-expo + @testing-library/react-native v14 (mobile, `mobile/`).

**Spec:** `docs/superpowers/specs/2026-07-05-mobile-stats-clobber-design.md`

## Global Constraints

- Work on branch `feat/stats-clobber` (create from `main` before Task 1).
- `updateSettings` keeps its exact 6-arg positional contract on both platforms: `(activeStages, hideTitle, hideDifficulty, conciseMode, activeTopics, tourDone)`.
- Web's existing `settingsReady` flag MUST keep its current meaning (set `true` when the settings load finishes, success **or** failure) — `useTour` and the first-problem-load effect depend on it. `settingsLoaded` is a new, separate flag, set `true` only on success. Neither platform exposes `settingsLoaded` in its public return value/context (no consumer needs it).
- Bar color thresholds, verbatim from web: score ≥ 0.7 → `#22c55e` (green), ≥ 0.4 → `#eab308` (yellow), else `#ef4444` (red).
- Stage labels, verbatim: `edge_cases` → "Edge Cases", `brute_force` → "Brute Force", `pattern` → "Pattern", `algorithm` → "Algorithm", `tc_sc` → "Time & Space".
- Exact testIDs: `stats-button`, `stats-screen`, `stats-sign-in`, `stats-loading`, `stats-error`, `stats-empty`, `stats-smart-practice`, `stats-manage-topics`, `stats-topic-chip-<name>`, `stats-topic-card-<name>`, `smart-banner`, `smart-exit`.
- Topic rule (web parity): toggling removes/appends by name, appended topics go to the END of the list (no canonical reorder — unlike stages), minimum 1 active topic.
- RNTL v14: use `fireEvent.press(...)` — `getByTestId(...).props.onPress()` throws on host nodes.
- Run `npx prettier --write` on every touched file before committing (pre-commit hook enforces formatting).
- Test commands: mobile `cd mobile && npx jest` and `cd mobile && npx tsc --noEmit`; web `cd frontend && npm test`.
- RN components must not use web-only APIs (no `className`, no recharts). All styling via inline `style` objects reading `useTheme()` tokens, matching existing mobile components.

---

### Task 1: Web settings-clobber fix (`useAuth`)

**Files:**
- Modify: `frontend/src/hooks/useAuth.ts`
- Test: `frontend/src/hooks/useAuth.test.ts` (create)

**Interfaces:**
- Consumes: existing `getSettings`/`updateSettings` from `frontend/src/api.ts`; `supabase` from `frontend/src/lib/supabase.ts`.
- Produces: no public-interface change. `useAuth()`'s return value is unchanged; internally, all six persist functions (`persistStages`, `persistHideTitle`, `persistHideDifficulty`, `persistConciseMode`, `persistTopics`, `persistTourDone`) skip the PUT while `settingsLoaded` is false.

- [x] **Step 1: Create the branch**

```bash
cd /Users/aaronkim/projects/leetgame
git checkout -b feat/stats-clobber
```

- [x] **Step 2: Write the failing tests**

Create `frontend/src/hooks/useAuth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ActiveStage } from '../types'

const authState = {
  callback: (_event: string, _session: unknown) => {},
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authState.callback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signInWithPassword: vi.fn(async () => ({})),
    },
  },
}))

vi.mock('../api', () => ({
  getStreak: vi.fn(async () => ({ streak: 1, last_practiced_at: null })),
  recordStreak: vi.fn(async () => ({ streak: 1, last_practiced_at: null })),
  getSettings: vi.fn(),
  updateSettings: vi.fn(async () => {}),
}))

import { useAuth } from './useAuth'
import { getSettings, updateSettings } from '../api'

const fakeSession = { access_token: 't' }

beforeEach(() => {
  vi.mocked(updateSettings).mockClear()
  localStorage.clear()
})

describe('settings clobber gate', () => {
  it('failed settings load: toggle updates state but skips the PUT', async () => {
    vi.mocked(getSettings).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('SIGNED_IN', fakeSession)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(result.current.conciseMode).toBe(true)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('successful load: toggle PUTs the merged server values', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      active_stages: ['pattern', 'algorithm'] as ActiveStage[],
      hide_title: false,
      hide_difficulty: true,
      concise_mode: false,
      active_topics: ['Array'],
      tour_done: true,
    })
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('SIGNED_IN', fakeSession)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(result.current.conciseMode).toBe(true)
    expect(updateSettings).toHaveBeenCalledWith(
      ['pattern', 'algorithm'],
      false,
      true,
      true,
      ['Array'],
      true,
    )
  })

  it('anonymous toggle still writes localStorage and never PUTs', async () => {
    const { result } = renderHook(() => useAuth())
    act(() => {
      authState.callback('INITIAL_SESSION', null)
    })
    await waitFor(() => expect(result.current.settingsReady).toBe(true))

    act(() => {
      result.current.persistConciseMode(true)
    })
    expect(localStorage.getItem('leetgame_concise_mode')).toBe('true')
    expect(updateSettings).not.toHaveBeenCalled()
  })
})
```

Note: if `vi.mocked(getSettings).mockResolvedValue(...)` produces a type error because the real `getSettings` return type has a different field order or extra fields, match the mock object to the real `Settings` response type declared in `frontend/src/api.ts` — do not loosen types with `any`.

- [x] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npm test -- src/hooks/useAuth.test.ts`
Expected: the "failed settings load" test FAILS (updateSettings IS called today); the other two PASS (they document existing behavior and guard against regression).

- [x] **Step 4: Implement the gate in `useAuth.ts`**

Four edits:

4a. Add the flag next to `settingsReady` (line ~43):

```ts
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
```

4b. In the `onAuthStateChange` handler, the signed-in branch resets the flag before fetching and sets it only on success:

```ts
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
          setSettingsLoaded(false)
          getStreak()
            .then(({ streak, last_practiced_at }) => {
              setStreak(streak)
              setLastPracticedAt(last_practiced_at)
            })
            .catch(() => {})
          getSettings()
            .then(
              ({
                active_stages,
                hide_title,
                hide_difficulty,
                concise_mode,
                active_topics,
                tour_done,
              }) => {
                setActiveStages(active_stages)
                setHideTitle(hide_title)
                setHideDifficulty(hide_difficulty)
                setConciseMode(concise_mode)
                setActiveTopics(active_topics ?? NEETCODE_TOPICS)
                setTourDone(tour_done)
                setSettingsLoaded(true)
              },
            )
            .catch(() => {})
            .finally(() => setSettingsReady(true))
        } else {
```

4c. Add `setSettingsLoaded(false)` to the two signed-out paths (the `else` branch of the session check, and the `SIGNED_OUT` branch), next to their existing `applyLocalSettings()` calls.

4d. Gate every signed-in PUT. In each of `persistStages`, `persistHideTitle`, `persistHideDifficulty`, `persistConciseMode`, change the `if (session)` body to start with the guard — for example `persistStages` becomes:

```ts
  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    if (session) {
      if (!settingsLoaded) return
      updateSettings(
        stages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        tourDone,
      ).catch(() => {})
    } else {
      try {
        localStorage.setItem('leetgame_active_stages', JSON.stringify(stages))
      } catch {
        /* ignore */
      }
    }
  }
```

Apply the same `if (!settingsLoaded) return` first line inside `if (session)` to the other three (their localStorage `else` branches are unchanged). `persistTopics` and `persistTourDone` have no `else` branch; they become:

```ts
  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    if (session && settingsLoaded) {
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        topics,
        tourDone,
      ).catch(() => {})
    }
  }

  const persistTourDone = () => {
    setTourDone(true)
    if (session && settingsLoaded) {
      updateSettings(
        activeStages,
        hideTitle,
        hideDifficulty,
        conciseMode,
        activeTopics,
        true,
      ).catch(() => {})
    }
  }
```

Do NOT add `settingsLoaded` to the hook's return object.

- [x] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all tests PASS (including the pre-existing `useSessionStack` suite).

- [x] **Step 6: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write frontend/src/hooks/useAuth.ts frontend/src/hooks/useAuth.test.ts
git add frontend/src/hooks/useAuth.ts frontend/src/hooks/useAuth.test.ts
git commit -m "fix(web): gate settings PUT on successful load to prevent clobbering server settings"
```

---

### Task 2: Mobile settings-clobber fix + expose topics (`auth-context`)

**Files:**
- Modify: `mobile/src/auth/auth-context.tsx`
- Test: `mobile/src/auth/auth-context.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `getSettings`/`updateSettings` from `mobile/src/api/settings.ts`.
- Produces: `AuthValue` gains `activeTopics: string[]` and `persistTopics: (topics: string[]) => void`. All persist functions now skip the PUT until the internal `settingsLoaded` flag is set. Tasks 5 and 6 consume `activeTopics`/`persistTopics`.

- [x] **Step 1: Write the failing tests**

Append to `mobile/src/auth/auth-context.test.tsx`. First extend `PersistProbe` (replace the existing component definition) so it can drive topics:

```tsx
function PersistProbe() {
  const { conciseMode, activeTopics, persistConciseMode, persistStages, persistTopics } =
    useAuth()
  return (
    <>
      <Text testID="concise">{String(conciseMode)}</Text>
      <Text testID="topics">{activeTopics.join(',')}</Text>
      <Pressable
        testID="toggle-concise"
        onPress={() => persistConciseMode(true)}
      />
      <Pressable
        testID="set-stages"
        onPress={() => persistStages(['pattern'])}
      />
      <Pressable
        testID="set-topics"
        onPress={() => persistTopics(['Array', 'Graph'])}
      />
    </>
  )
}
```

Then append the new tests at the end of the file:

```tsx
test('failed settings load: toggle updates state but skips the PUT', async () => {
  ;(updateSettings as jest.Mock).mockClear()
  ;(getSettings as jest.Mock).mockRejectedValue(new Error('network'))
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
  await act(async () => {
    fireEvent.press(getByTestId('toggle-concise'))
  })
  expect(getByTestId('concise').children[0]).toBe('true')
  expect(updateSettings).not.toHaveBeenCalled()
})

test('persistTopics PUTs the new topics with other settings round-tripped', async () => {
  ;(updateSettings as jest.Mock).mockClear()
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
  await waitFor(() => expect(getByTestId('topics').children[0]).toBe('Array'))

  await act(async () => {
    fireEvent.press(getByTestId('set-topics'))
  })
  expect(getByTestId('topics').children[0]).toBe('Array,Graph')
  expect(updateSettings).toHaveBeenCalledWith(
    ['pattern', 'algorithm'],
    false,
    true,
    false,
    ['Array', 'Graph'],
    true,
  )
})
```

- [x] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/auth`
Expected: FAIL — `persistTopics`/`activeTopics` do not exist on the context (TypeScript/render error), and the failed-load test fails because `updateSettings` IS called.

- [x] **Step 3: Implement in `auth-context.tsx`**

3a. `AuthValue` interface — add after `conciseMode: boolean`:

```ts
  activeTopics: string[]
```

and after `persistConciseMode: (value: boolean) => void`:

```ts
  persistTopics: (topics: string[]) => void
```

3b. Add state after the `tourDone` line:

```ts
  const [settingsLoaded, setSettingsLoaded] = useState(false)
```

3c. In the `onAuthStateChange` handler: the `if (sess)` branch gains `setSettingsLoaded(false)` as its first statement, and the `getSettings().then(...)` callback gains `setSettingsLoaded(true)` as its last statement. The `else` branch gains `setSettingsLoaded(false)` next to its other resets.

3d. Replace the `persist` helper and add `persistTopics`:

```ts
  const persist = (
    stages: ActiveStage[],
    title: boolean,
    difficulty: boolean,
    concise: boolean,
    topics: string[],
  ) => {
    if (!session || !settingsLoaded) return
    updateSettings(stages, title, difficulty, concise, topics, tourDone)
      .catch(() => {})
  }

  const persistStages = (stages: ActiveStage[]) => {
    setActiveStages(stages)
    persist(stages, hideTitle, hideDifficulty, conciseMode, activeTopics)
  }
  const persistHideTitle = (value: boolean) => {
    setHideTitle(value)
    persist(activeStages, value, hideDifficulty, conciseMode, activeTopics)
  }
  const persistHideDifficulty = (value: boolean) => {
    setHideDifficulty(value)
    persist(activeStages, hideTitle, value, conciseMode, activeTopics)
  }
  const persistConciseMode = (value: boolean) => {
    setConciseMode(value)
    persist(activeStages, hideTitle, hideDifficulty, value, activeTopics)
  }
  const persistTopics = (topics: string[]) => {
    setActiveTopics(topics)
    persist(activeStages, hideTitle, hideDifficulty, conciseMode, topics)
  }
```

3e. Provider value — add `activeTopics` (after `conciseMode`) and `persistTopics` (after `persistConciseMode`).

- [x] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: full suite PASS, tsc clean.

- [x] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write mobile/src/auth/auth-context.tsx mobile/src/auth/auth-context.test.tsx
git add mobile/src/auth
git commit -m "fix(mobile): gate settings PUT on successful load; expose activeTopics/persistTopics"
```

---

### Task 3: Mobile API — proficiency + problem tags

**Files:**
- Create: `mobile/src/api/proficiency.ts`
- Create: `mobile/src/api/proficiency.test.ts`
- Modify: `mobile/src/api/problems.ts` (add `getProblemTags`)
- Modify: `mobile/src/api/problems.test.ts` (add tags tests)
- Modify: `mobile/src/types.ts` (add `ProblemTag`)

**Interfaces:**
- Consumes: `API_URL`, `authHeaders` from `mobile/src/api/client.ts`; `TopicProficiency` from `mobile/src/types.ts` (already exists: `{ user_id, topic, stage, score, updated_at }`).
- Produces: `getProficiency(): Promise<TopicProficiency[]>`, `getProblemTags(): Promise<ProblemTag[]>`, `interface ProblemTag { name: string; count: number }`. Task 6 consumes all three. (`getSmartPracticeProblem` already exists — do not touch it.)

- [x] **Step 1: Write the failing tests**

Create `mobile/src/api/proficiency.test.ts`:

```ts
jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import { getProficiency } from './proficiency'

const rows = [
  {
    user_id: 'u1', topic: 'Array', stage: 'pattern',
    score: 0.5, updated_at: '2026-07-01T00:00:00Z',
  },
]

test('getProficiency hits the proficiency endpoint with auth header', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => rows,
  })) as unknown as typeof fetch
  const result = await getProficiency()
  expect(result).toEqual(rows)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/proficiency',
    { headers: { Authorization: 'Bearer t' } },
  )
})

test('getProficiency throws on non-OK response', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
  })) as unknown as typeof fetch
  await expect(getProficiency()).rejects.toThrow('401')
})
```

Append to `mobile/src/api/problems.test.ts`:

```ts
import { getProblemTags } from './problems'

test('getProblemTags hits the tags endpoint with auth header', async () => {
  const tags = [{ name: 'Array', count: 12 }]
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => tags,
  })) as unknown as typeof fetch
  const result = await getProblemTags()
  expect(result).toEqual(tags)
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/problems/tags',
    { headers: { Authorization: 'Bearer t' } },
  )
})
```

(Put the extra `import` at the top of the file merged into the existing import from `'./problems'`.)

- [x] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/api`
Expected: FAIL — `./proficiency` module and `getProblemTags` export don't exist.

- [x] **Step 3: Implement**

Add to `mobile/src/types.ts` (after `TopicProficiency`):

```ts
export interface ProblemTag {
  name: string
  count: number
}
```

Create `mobile/src/api/proficiency.ts`:

```ts
import type { TopicProficiency } from '../types'
import { API_URL, authHeaders } from './client'

export async function getProficiency(): Promise<TopicProficiency[]> {
  const res = await fetch(`${API_URL}/api/proficiency`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch proficiency: ${res.status}`)
  return res.json()
}
```

Add to `mobile/src/api/problems.ts` (import `ProblemTag` in the existing type import):

```ts
export async function getProblemTags(): Promise<ProblemTag[]> {
  const res = await fetch(`${API_URL}/api/problems/tags`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.status}`)
  return res.json()
}
```

- [x] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest src/api && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [x] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write mobile/src/api/proficiency.ts mobile/src/api/proficiency.test.ts mobile/src/api/problems.ts mobile/src/api/problems.test.ts mobile/src/types.ts
git add mobile/src/api mobile/src/types.ts
git commit -m "feat(mobile): add proficiency and problem-tags API functions"
```

---

### Task 4: Sticky smart mode in the practice session

**Files:**
- Modify: `mobile/src/practice/use-practice-session.ts`
- Test: `mobile/src/practice/use-practice-session.test.tsx` (extend)

**Interfaces:**
- Consumes: existing `getRandomProblem`, `getSmartPracticeProblem` from `mobile/src/api/problems.ts`.
- Produces: hook return gains `problemSource: 'random' | 'smart'` and `loadNext: () => Promise<void>`. `loadSmart()` marks the session smart; `loadNext()` re-fetches from the current source; `loadRandom()` returns it to random. Task 5 consumes all three.

- [x] **Step 1: Write the failing tests**

In `mobile/src/practice/use-practice-session.test.tsx`, first extend the existing `beforeEach` to also clear the problem mocks. Add this import line under the existing `jest.mock('../api/problems', ...)` block:

```ts
import { getRandomProblem, getSmartPracticeProblem } from '../api/problems'
```

and inside `beforeEach`, after `mockStreamChat.mockClear()`:

```ts
  ;(getRandomProblem as jest.Mock).mockClear()
  ;(getSmartPracticeProblem as jest.Mock).mockClear()
```

Then append the new tests:

```tsx
test('loadSmart marks the session smart and loadNext stays smart', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: ['Array'],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadSmart()
  })
  expect(result.current.problemSource).toBe('smart')

  await act(async () => {
    await result.current.loadNext()
  })
  expect(getSmartPracticeProblem).toHaveBeenCalledTimes(2)
  expect(getSmartPracticeProblem).toHaveBeenLastCalledWith(
    ['pattern', 'algorithm'],
    ['Array'],
  )
  expect(getRandomProblem).not.toHaveBeenCalled()
})

test('loadRandom returns the session to random mode', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadSmart()
  })
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problemSource).toBe('random')

  await act(async () => {
    await result.current.loadNext()
  })
  expect(getRandomProblem).toHaveBeenCalledTimes(2)
})
```

- [x] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/practice/use-practice-session`
Expected: FAIL — `problemSource` and `loadNext` are undefined.

- [x] **Step 3: Implement**

In `mobile/src/practice/use-practice-session.ts`:

3a. Add state after the `error` state line:

```ts
  const [problemSource, setProblemSource] = useState<'random' | 'smart'>(
    'random',
  )
```

3b. Replace `loadRandom` and `loadSmart`, and add `loadNext`:

```ts
  const loadRandom = useCallback(async () => {
    setError(null)
    try {
      startSession(await getRandomProblem())
      setProblemSource('random')
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession])

  const loadSmart = useCallback(async () => {
    setError(null)
    try {
      startSession(await getSmartPracticeProblem(activeStages, activeTopics))
      setProblemSource('smart')
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession, activeStages, activeTopics])

  const loadNext = useCallback(
    () => (problemSource === 'smart' ? loadSmart() : loadRandom()),
    [problemSource, loadSmart, loadRandom],
  )
```

3c. Add `problemSource` and `loadNext` to the returned object (after `sessionActiveStages`).

- [x] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest src/practice && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [x] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write mobile/src/practice/use-practice-session.ts mobile/src/practice/use-practice-session.test.tsx
git add mobile/src/practice
git commit -m "feat(mobile): sticky smart-practice mode with source-aware loadNext"
```

---

### Task 5: Smart banner + Practice screen wiring

**Files:**
- Create: `mobile/src/components/smart-banner.tsx`
- Create: `mobile/src/components/smart-banner.test.tsx`
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `problemSource`, `loadNext`, `loadSmart`, `loadRandom` from Task 4; `activeTopics` from Task 2's `useAuth()`; `useLocalSearchParams` from expo-router.
- Produces: Practice screen reads the `smart` route param (a nonce string set by the Stats screen in Task 6) and enters smart mode when it changes; header gains a `stats-button` linking to `/stats`; `SmartBanner({ onExit }: { onExit: () => void })` component.

- [x] **Step 1: Write the failing component test**

Create `mobile/src/components/smart-banner.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { SmartBanner } from './smart-banner'

test('renders the label and fires onExit', async () => {
  const onExit = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <SmartBanner onExit={onExit} />
    </ThemeProvider>,
  )
  expect(getByText('Smart Practice')).toBeTruthy()
  fireEvent.press(getByTestId('smart-exit'))
  expect(onExit).toHaveBeenCalledTimes(1)
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd mobile && npx jest src/components/smart-banner`
Expected: FAIL — module `./smart-banner` does not exist.

- [x] **Step 3: Create `mobile/src/components/smart-banner.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function SmartBanner({ onExit }: { onExit: () => void }) {
  const theme = useTheme()
  return (
    <View
      testID="smart-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        backgroundColor: theme.muted,
      }}
    >
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        Smart Practice
      </Text>
      <Pressable
        testID="smart-exit"
        accessibilityLabel="Exit Smart Practice"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onExit}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>×</Text>
      </Pressable>
    </View>
  )
}
```

- [x] **Step 4: Run to verify it passes**

Run: `cd mobile && npx jest src/components/smart-banner`
Expected: PASS. (The uppercase label is styled via `textTransform`, so `getByText('Smart Practice')` matches the source text.)

- [x] **Step 5: Wire the Practice screen**

Edit `mobile/src/app/index.tsx`:

5a. Imports — change the react and expo-router imports, add SmartBanner, drop `NEETCODE_TOPICS`:

```tsx
import { useEffect, useRef } from 'react'
```

```tsx
import { Link, useLocalSearchParams } from 'expo-router'
```

```tsx
import { SmartBanner } from '@/components/smart-banner'
```

```tsx
import { type ActiveStage } from '@/types'
```

5b. Destructure `activeTopics` from `useAuth()` (add after `conciseMode`), and pass it to the session hook:

```tsx
  const practice = usePracticeSession({
    activeStages,
    activeTopics,
    conciseMode,
    onComplete: () => {
      if (session) refreshStreak()
    },
  })
```

5c. After the `usePracticeSession` call, add the smart-param effect:

```tsx
  const { smart } = useLocalSearchParams<{ smart?: string }>()
  const lastSmartRef = useRef<string | null>(null)
  useEffect(() => {
    const value = Array.isArray(smart) ? smart[0] : smart
    if (value && value !== lastSmartRef.current) {
      lastSmartRef.current = value
      void practice.loadSmart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smart])
```

5d. In the header row, add the stats button immediately BEFORE the settings `<Link>`:

```tsx
        <Link href="/stats" asChild>
          <Pressable
            testID="stats-button"
            accessibilityLabel="Stats"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 18 }}>📊</Text>
          </Pressable>
        </Link>
```

5e. Inside the `<ScrollView>`, add the banner as the FIRST child, above `<ProblemView>`:

```tsx
        {practice.problemSource === 'smart' && (
          <SmartBanner onExit={() => void practice.loadRandom()} />
        )}
```

5f. Change the completion footer's next handler to be source-aware:

```tsx
        <CompletionFooter
          onNext={() => void practice.loadNext()}
          onSmart={() => void practice.loadSmart()}
        />
```

- [x] **Step 6: Full suite + typecheck**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: PASS, tsc clean. (index.tsx has no unit test — it is verified on the simulator in Task 7.)

- [x] **Step 7: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write mobile/src/components/smart-banner.tsx mobile/src/components/smart-banner.test.tsx mobile/src/app/index.tsx
git add mobile/src/components/smart-banner.tsx mobile/src/components/smart-banner.test.tsx mobile/src/app/index.tsx
git commit -m "feat(mobile): smart-practice banner, stats header button, user topics in session"
```

---

### Task 6: Topic toggle + Stats screen + route

**Files:**
- Create: `mobile/src/practice/topic-toggle.ts`
- Create: `mobile/src/practice/topic-toggle.test.ts`
- Create: `mobile/src/app/stats.tsx`
- Create: `mobile/src/app/stats.test.tsx`
- Modify: `mobile/src/app/_layout.tsx` (register the route)
- Modify: `mobile/jest.config.js` (add `@/` moduleNameMapper so the screen test can resolve alias imports)

**Interfaces:**
- Consumes: `getProficiency` (Task 3), `getProblemTags` (Task 3), `ProblemTag`/`TopicProficiency` types, `activeTopics`/`persistTopics` from `useAuth()` (Task 2), `router.dismissTo` (expo-router), `useTheme()`.
- Produces: `toggleTopic(activeTopics: string[], name: string): string[]`; the `/stats` screen; the Stats screen sets the `smart` param consumed by Task 5's effect.

- [x] **Step 1: Write the failing topic-toggle tests**

Create `mobile/src/practice/topic-toggle.test.ts`:

```ts
import { toggleTopic } from './topic-toggle'

test('removes an active topic', () => {
  expect(toggleTopic(['Array', 'Graph'], 'Array')).toEqual(['Graph'])
})

test('appends an inactive topic at the end (no reorder)', () => {
  expect(toggleTopic(['Graph', 'Array'], 'Tree')).toEqual([
    'Graph',
    'Array',
    'Tree',
  ])
})

test('refuses to remove the last active topic', () => {
  const topics = ['Array']
  expect(toggleTopic(topics, 'Array')).toBe(topics)
})
```

- [x] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/practice/topic-toggle`
Expected: FAIL — module does not exist.

- [x] **Step 3: Create `mobile/src/practice/topic-toggle.ts`**

```ts
export function toggleTopic(activeTopics: string[], name: string): string[] {
  const next = activeTopics.includes(name)
    ? activeTopics.filter((t) => t !== name)
    : [...activeTopics, name]
  return next.length > 0 ? next : activeTopics
}
```

Run: `cd mobile && npx jest src/practice/topic-toggle`
Expected: PASS.

- [x] **Step 4: Add the `@/` alias to jest**

In `mobile/jest.config.js`, add inside `module.exports`:

```js
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
```

Run: `cd mobile && npx jest`
Expected: full suite still PASS (mapper is additive).

- [x] **Step 5: Write the failing Stats screen tests**

Create `mobile/src/app/stats.test.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '@/theme/theme-context'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn() }),
}))

const mockAuth = {
  session: { access_token: 't' } as unknown,
  activeTopics: ['Array', 'Graph'],
  persistTopics: jest.fn(),
}
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }))
jest.mock('@/api/proficiency', () => ({ getProficiency: jest.fn() }))
jest.mock('@/api/problems', () => ({ getProblemTags: jest.fn() }))

import StatsScreen from './stats'
import { getProficiency } from '@/api/proficiency'
import { getProblemTags } from '@/api/problems'

const proficiencyRows = [
  // Graph avg 0.8 (strong), Array avg 0.3 (weak) → Array card first
  { user_id: 'u', topic: 'Graph', stage: 'pattern', score: 0.8, updated_at: '' },
  { user_id: 'u', topic: 'Array', stage: 'pattern', score: 0.2, updated_at: '' },
  { user_id: 'u', topic: 'Array', stage: 'algorithm', score: 0.4, updated_at: '' },
]
const tags = [
  { name: 'Array', count: 5 },
  { name: 'Graph', count: 3 },
  { name: 'Tree', count: 2 },
]

function renderScreen() {
  return render(
    <ThemeProvider>
      <StatsScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  mockDismissTo.mockClear()
  mockAuth.session = { access_token: 't' }
  mockAuth.activeTopics = ['Array', 'Graph']
  mockAuth.persistTopics.mockClear()
  ;(getProficiency as jest.Mock).mockResolvedValue(proficiencyRows)
  ;(getProblemTags as jest.Mock).mockResolvedValue(tags)
})

test('signed out shows the sign-in prompt and fetches nothing', async () => {
  mockAuth.session = null
  const { getByTestId } = await renderScreen()
  expect(getByTestId('stats-sign-in')).toBeTruthy()
  expect(getProficiency).not.toHaveBeenCalled()
})

test('renders topic cards weakest-first with stage rows', async () => {
  const { getAllByTestId, getByText } = await renderScreen()
  await waitFor(() =>
    expect(getAllByTestId(/^stats-topic-card-/)).toHaveLength(2),
  )
  const cards = getAllByTestId(/^stats-topic-card-/)
  expect(cards[0].props.testID).toBe('stats-topic-card-Array')
  expect(cards[1].props.testID).toBe('stats-topic-card-Graph')
  expect(getByText('20%')).toBeTruthy()
  expect(getByText('Algorithm')).toBeTruthy()
})

test('toggling a topic chip persists the new topic list', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-manage-topics')).toBeTruthy())
  fireEvent.press(getByTestId('stats-manage-topics'))
  fireEvent.press(getByTestId('stats-topic-chip-Tree'))
  expect(mockAuth.persistTopics).toHaveBeenCalledWith([
    'Array',
    'Graph',
    'Tree',
  ])
})

test('the last active topic chip is disabled', async () => {
  mockAuth.activeTopics = ['Array']
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-manage-topics')).toBeTruthy())
  fireEvent.press(getByTestId('stats-manage-topics'))
  fireEvent.press(getByTestId('stats-topic-chip-Array'))
  expect(mockAuth.persistTopics).not.toHaveBeenCalled()
})

test('smart practice button dismisses to the practice screen with a nonce', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() =>
    expect(getByTestId('stats-smart-practice')).toBeTruthy(),
  )
  fireEvent.press(getByTestId('stats-smart-practice'))
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: { smart: expect.any(String) },
  })
})

test('empty proficiency shows the practice prompt', async () => {
  ;(getProficiency as jest.Mock).mockResolvedValue([])
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-empty')).toBeTruthy())
})

test('fetch failure shows the error state', async () => {
  ;(getProficiency as jest.Mock).mockRejectedValue(new Error('boom'))
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('stats-error')).toBeTruthy())
})
```

- [x] **Step 6: Run to verify they fail**

Run: `cd mobile && npx jest src/app/stats`
Expected: FAIL — `./stats` module does not exist.

- [x] **Step 7: Create `mobile/src/app/stats.tsx`**

```tsx
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { getProficiency } from '@/api/proficiency'
import { getProblemTags } from '@/api/problems'
import { toggleTopic } from '@/practice/topic-toggle'
import type { ProblemTag, TopicProficiency } from '@/types'

const STAGE_LABEL: Record<string, string> = {
  edge_cases: 'Edge Cases',
  brute_force: 'Brute Force',
  pattern: 'Pattern',
  algorithm: 'Algorithm',
  tc_sc: 'Time & Space',
}

function barColor(score: number): string {
  if (score >= 0.7) return '#22c55e'
  if (score >= 0.4) return '#eab308'
  return '#ef4444'
}

export default function StatsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session, activeTopics, persistTopics } = useAuth()
  const [proficiencies, setProficiencies] = useState<TopicProficiency[]>([])
  const [allTags, setAllTags] = useState<ProblemTag[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const signedIn = session !== null

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    Promise.all([getProficiency(), getProblemTags()])
      .then(([prof, tags]) => {
        if (cancelled) return
        setProficiencies(prof)
        setAllTags(tags)
        setFetchError(false)
      })
      .catch(() => {
        if (!cancelled) setFetchError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (!signedIn) {
    return (
      <View
        testID="stats-screen"
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 12,
        }}
      >
        <Text style={{ color: theme.mutedForeground, textAlign: 'center' }}>
          Sign in to track proficiency
        </Text>
        <Pressable
          testID="stats-sign-in"
          accessibilityLabel="Sign in"
          accessibilityRole="button"
          onPress={() => router.push('/sign-in')}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Sign in
          </Text>
        </Pressable>
      </View>
    )
  }

  if (loading) {
    return (
      <View
        testID="stats-screen"
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator testID="stats-loading" color={theme.primary} />
      </View>
    )
  }

  if (fetchError) {
    return (
      <View
        testID="stats-screen"
        style={{ flex: 1, backgroundColor: theme.background, padding: 24 }}
      >
        <Text
          testID="stats-error"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          Failed to load stats.
        </Text>
      </View>
    )
  }

  const activeSet = new Set(activeTopics)
  const filtered = proficiencies.filter((p) => activeSet.has(p.topic))
  const topicMap = new Map<string, TopicProficiency[]>()
  for (const p of filtered) {
    topicMap.set(p.topic, [...(topicMap.get(p.topic) ?? []), p])
  }
  const topics = Array.from(topicMap.entries())
    .map(([topic, rows]) => ({
      topic,
      rows,
      avg: rows.reduce((sum, r) => sum + r.score, 0) / rows.length,
    }))
    .sort((a, b) => a.avg - b.avg)

  const topicPicker = (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        testID="stats-manage-topics"
        accessibilityRole="button"
        accessibilityState={{ expanded: pickerOpen }}
        onPress={() => setPickerOpen((o) => !o)}
      >
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {pickerOpen ? '▾' : '▸'} Manage topics ({activeTopics.length} of{' '}
          {allTags.length} active)
        </Text>
      </Pressable>
      {pickerOpen && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
          }}
        >
          {allTags.map((tag) => {
            const active = activeSet.has(tag.name)
            const isLast = active && activeTopics.length === 1
            return (
              <Pressable
                key={tag.name}
                testID={`stats-topic-chip-${tag.name}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: isLast }}
                disabled={isLast}
                onPress={() => persistTopics(toggleTopic(activeTopics, tag.name))}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderColor: active ? theme.foreground : theme.border,
                  backgroundColor: active ? theme.foreground : 'transparent',
                  opacity: isLast ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: active ? theme.background : theme.mutedForeground,
                  }}
                >
                  {tag.name}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )

  return (
    <ScrollView
      testID="stats-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <Text
          style={{ color: theme.foreground, fontSize: 18, fontWeight: '600' }}
        >
          Topic Proficiency
        </Text>
        <Pressable
          testID="stats-smart-practice"
          accessibilityLabel="Practice Weakest Topics"
          accessibilityRole="button"
          onPress={() =>
            router.dismissTo({
              pathname: '/',
              params: { smart: String(Date.now()) },
            })
          }
          style={{
            backgroundColor: theme.primary,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              color: theme.primaryForeground,
              fontSize: 12,
              fontWeight: '600',
            }}
          >
            Practice Weakest Topics
          </Text>
        </Pressable>
      </View>
      {topicPicker}
      {topics.length === 0 ? (
        <Text
          testID="stats-empty"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          Complete a practice session to see your scores.
        </Text>
      ) : (
        topics.map(({ topic, rows }) => (
          <View
            key={topic}
            testID={`stats-topic-card-${topic}`}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: theme.foreground,
                fontSize: 14,
                fontWeight: '600',
                marginBottom: 10,
              }}
            >
              {topic}
            </Text>
            {rows.map((row) => (
              <View
                key={row.stage}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    color: theme.mutedForeground,
                    fontSize: 12,
                    width: 88,
                  }}
                >
                  {STAGE_LABEL[row.stage] ?? row.stage}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: theme.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      height: '100%',
                      borderRadius: 999,
                      width: `${Math.round(row.score * 100)}%`,
                      backgroundColor: barColor(row.score),
                    }}
                  />
                </View>
                <Text
                  style={{
                    color: theme.mutedForeground,
                    fontSize: 12,
                    width: 34,
                    textAlign: 'right',
                  }}
                >
                  {Math.round(row.score * 100)}%
                </Text>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  )
}
```

- [x] **Step 8: Register the route**

In `mobile/src/app/_layout.tsx`, add after the `settings` screen line:

```tsx
      <Stack.Screen name="stats" options={{ title: 'Stats' }} />
```

- [x] **Step 9: Run the full suite + typecheck**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [x] **Step 10: Commit**

```bash
cd /Users/aaronkim/projects/leetgame
npx prettier --write mobile/src/practice/topic-toggle.ts mobile/src/practice/topic-toggle.test.ts mobile/src/app/stats.tsx mobile/src/app/stats.test.tsx mobile/src/app/_layout.tsx mobile/jest.config.js
git add mobile/src/practice/topic-toggle.ts mobile/src/practice/topic-toggle.test.ts mobile/src/app/stats.tsx mobile/src/app/stats.test.tsx mobile/src/app/_layout.tsx mobile/jest.config.js
git commit -m "feat(mobile): stats screen with proficiency bars, topic picker, smart practice entry"
```

---

### Task 7: E2E verification on the iOS simulator (main session — NOT a subagent)

**Files:** none (verification only; append results to this plan).

This task is executed by the controller in the main session using the `rn-agentic-loop` skill (one simulator — app-driving must not be parallelized). Metro: `npx expo start` in `mobile/`, then `xcrun simctl openurl booted "exp://127.0.0.1:8081"`. Dev sign-in credentials are in `frontend/.env.local`.

Receipts to collect (declare each BEFORE acting; runtime state, not screenshots):

- [x] **Navigation:** tapping `stats-button` → route becomes `/stats`; bars render with real account data (fiber tree shows `stats-topic-card-*`).
- [x] **Topics round-trip:** toggling a chip fires `PUT /api/settings`; server GET afterwards shows the edited `active_topics` AND unchanged `active_stages`/`hide_title`/`hide_difficulty`/`concise_mode`/`tour_done`. Restore the account's original topics afterwards.
- [x] **Smart practice:** tapping `stats-smart-practice` dismisses to Practice; `GET /api/problems/smart` fires with the account's stages/topics (network receipt); `smart-banner` mounts. "Next Problem" on completion fires the smart endpoint again (source stickiness), `smart-exit` loads a random problem and unmounts the banner.
- [x] **Clobber-fix receipts:** the failed-load → no-PUT case is carried by the Task 1/Task 2 unit tests (forcing a settings-only fetch failure on the simulator has no low-effort, non-flaky setup). On-sim, verify the positive path: a settings toggle after a normal load produces exactly one `PUT /api/settings` whose body round-trips the loaded `active_topics`/`tour_done`. Record in the results that the negative control lives in the unit tests.
- [x] **Web sanity:** `cd frontend && npm test` green on the branch; optional quick browser check that the settings dropdown still persists after sign-in.
- [x] Append verification results to this plan file and commit.

---

## Execution notes

- Tasks 1–6 are subagent-friendly (stateless, fully specified). Task 7 is app-driving and runs serially in the main session.
- Task order: 1 and 3 are independent; 2 must precede 5 and 6; 4 must precede 5. Run them in numeric order — they are small.
- Task 5 and 6 both assume Task 2's `useAuth()` shape (`activeTopics`, `persistTopics`) and Task 4's session shape (`problemSource`, `loadNext`).

---

## Task 7 verification results (2026-07-06, iPhone 17 Pro sim / Expo Go, LIVE Render backend, dev account)

- **Freshness (R0):** PASS — `stats-button` (new in this branch) mounted in the fiber tree after relaunch. First launch attempt surfaced a REAL bug: `stats.test.tsx` inside `src/app/` was bundled as a route by expo-router (context regex in `_ctx.ios.js` excludes only `+api`/`+html`/`+middleware`), pulling `@testing-library/react-native` into the app bundle → "Unable to resolve module console". Fixed structurally in b2b9d22: screen moved to `src/screens/stats-screen.tsx`, `src/app/stats.tsx` is a thin re-export, test co-located in `src/screens/`.
- **Navigation (R1):** PASS — tap `stats-button` → `get_current_route` = `stats`; `GET /api/proficiency` (4.6 KB) + `GET /api/problems/tags` both 200; cards render weakest-first (0% topics above 20% topics), stage labels and red (<40%) bars correct; "Manage topics (23 of 63 active)".
- **Topics round-trip (R2):** PASS — chip toggle fired exactly one `PUT /api/settings` (observer logs each request twice: start+completion); server GET showed Array removed (22 topics) with active_stages/hide_title/hide_difficulty/concise_mode/tour_done ALL unchanged (tour_done stayed `true` — clobber positive receipt). Re-add appended Array at END (position 22) — web-parity order rule. Stage toggles in Settings (3→1 stages) likewise round-tripped topics/tour_done intact.
- **Clobber negative control:** carried by unit tests (web `useAuth.test.ts`: failed load → toggle → no PUT; mobile `auth-context.test.tsx` same) — no low-effort non-flaky way to fail only the settings GET on-sim.
- **Smart practice (R3):** PASS — `stats-smart-practice` → `dismissTo` landed on `index` with `params.smart = "1783325247803"` (nonce); `GET /api/problems/smart?active_stages=pattern&active_topics=<all 23>` 200; `smart-banner` mounted (absent at baseline). Answer-request completed the 1-stage session (chat 200 → streak POST → CompletionFooter). "Next Problem" fired the smart endpoint AGAIN (stickiness; no random request). `smart-exit` → `GET /api/problems/random` 200 + SmartBanner unmounted.
- **Web (R5):** PASS — `npm test` 13/13 on final HEAD; mobile suite 47/47 + tsc clean at b2b9d22.
- **Account restored:** server settings PUT back to the pre-test snapshot; verified byte-equal via GET.
