# Mobile Next-Problem Prefetching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Next" instant in the mobile app's random and playlist modes by prefetching the next problem into a context-keyed slot while the user works on the current one.

**Architecture:** Port the shipped web hook (`frontend/src/hooks/usePrefetchedProblem.ts`) to `mobile/src/practice/use-prefetched-problem.ts` with one deliberate difference — `prefetch`/`take`/`invalidate` are wrapped in `useCallback` with empty deps (they only touch refs) so they can appear in `usePracticeSession`'s `useCallback` dependency arrays without destabilizing them. `usePracticeSession` consumes the hook internally; the screen layer is untouched.

**Tech Stack:** React Native / Expo SDK 56, TypeScript, Jest + @testing-library/react-native (v14 — `renderHook` is awaited).

**Spec:** `docs/superpowers/specs/2026-07-06-mobile-prefetch-design.md`

## Global Constraints

- All commands run from `/Users/aaronkim/projects/leetgame/mobile` unless stated otherwise.
- Test runner: `npx jest <file>` for a single file; `npx jest` for the suite; type gate: `npx tsc --noEmit` (must stay clean).
- Code style: Prettier per `mobile/.prettierrc` (no semicolons, single quotes, trailing commas); run `npx prettier --write <files>` before committing.
- Mobile file naming is kebab-case (`use-practice-session.ts`), unlike web's camelCase.
- Do not modify: the smart-practice fetch body (only an `invalidate()` line at the top of `loadSmart`), `startSession`, `submit`, the screen layer (`src/app/`, `src/components/`, `src/screens/`), pending-playlist, or anything in `frontend/`.
- The repo pre-commit hook runs frontend lint/format/build plus backend checks on every commit; do not use `--no-verify`.
- `Problem` type (from `mobile/src/types.ts`): `{ id: string; slug: string; title: string; description: string; difficulty: 'Easy' | 'Medium' | 'Hard'; topic_tags: string[]; leetcode_id: number | null }`.
- `PlaylistFilters` (from `mobile/src/types.ts`): `{ q: string; difficulties: string[]; tags: string[]; tagMatch: 'and' | 'or' }`.
- `ApiError` (from `mobile/src/api/errors.ts`): `Error` subclass with `status: number`.
- `getRandomProblemFiltered(q, difficulties, tags, tagMatch, excludeId?)` (from `mobile/src/api/problems.ts`) throws `ApiError` on non-OK.
- End commit messages with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `use-prefetched-problem` hook

**Files:**
- Create: `mobile/src/practice/use-prefetched-problem.ts`
- Test: `mobile/src/practice/use-prefetched-problem.test.ts`

**Interfaces:**
- Consumes: `getRandomProblemFiltered` from `../api/problems`; `ApiError` from `../api/errors`; `Problem` from `../types`.
- Produces (Task 2 relies on these exact names):
  - `interface PrefetchContext { q: string; difficulties: string[]; tags: string[]; tagMatch: 'and' | 'or'; excludeId?: string }`
  - `type PrefetchResult = { problem: Problem } | { exhausted: true }`
  - `usePrefetchedProblem(): { prefetch: (ctx: PrefetchContext) => void; take: (ctx: PrefetchContext) => PrefetchResult | null; invalidate: () => void }` — all three functions referentially stable across renders.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/practice/use-prefetched-problem.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native'
import type { Problem } from '../types'
import { ApiError } from '../api/errors'

jest.mock('../api/problems', () => ({
  getRandomProblemFiltered: jest.fn(),
}))

import { getRandomProblemFiltered } from '../api/problems'
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './use-prefetched-problem'

const makeProblem = (id: string): Problem => ({
  id,
  slug: `slug-${id}`,
  title: `Problem ${id}`,
  description: 'desc',
  difficulty: 'Easy',
  topic_tags: [],
  leetcode_id: null,
})

const ctx = (excludeId?: string): PrefetchContext => ({
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
  excludeId,
})

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  ;(getRandomProblemFiltered as jest.Mock).mockReset()
})

test('take on empty slot returns null', async () => {
  const { result } = await renderHook(() => usePrefetchedProblem())
  expect(result.current.take(ctx('a'))).toBeNull()
})

test('prefetch then take with matching context returns the problem and empties the slot', async () => {
  const p = makeProblem('next')
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(p)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ problem: p })
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('passes the context through to getRandomProblemFiltered', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(makeProblem('x'))
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch({
    q: 'two',
    difficulties: ['Easy', 'Medium'],
    tags: ['array'],
    tagMatch: 'or',
    excludeId: 'cur',
  })
  await tick()

  expect(getRandomProblemFiltered).toHaveBeenCalledWith(
    'two',
    ['Easy', 'Medium'],
    ['array'],
    'or',
    'cur',
  )
})

test('take with a mismatched context returns null and does not consume the slot', async () => {
  const p = makeProblem('next')
  ;(getRandomProblemFiltered as jest.Mock).mockResolvedValue(p)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('other'))).toBeNull()
  expect(result.current.take(ctx('current'))).toEqual({ problem: p })
})

test('take while the fetch is in flight returns null', async () => {
  const d = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock).mockReturnValue(d.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a 404 is stored as exhausted', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new ApiError('not found', 404),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
})

test('an exhausted result is consumed by take: second take returns null', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new ApiError('not found', 404),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a non-404 failure clears the slot', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValue(
    new Error('network down'),
  )
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  await tick()

  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a response arriving after invalidate is dropped', async () => {
  const d = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock).mockReturnValue(d.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('current'))
  result.current.invalidate()
  d.resolve(makeProblem('late'))
  await tick()

  expect(result.current.take(ctx('current'))).toBeNull()
})

test('a response arriving after a re-targeting prefetch is dropped', async () => {
  const first = deferred<Problem>()
  const second = deferred<Problem>()
  ;(getRandomProblemFiltered as jest.Mock)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
  const { result } = await renderHook(() => usePrefetchedProblem())

  result.current.prefetch(ctx('a'))
  result.current.prefetch(ctx('b'))
  first.resolve(makeProblem('stale'))
  const fresh = makeProblem('fresh')
  second.resolve(fresh)
  await tick()

  expect(result.current.take(ctx('a'))).toBeNull()
  expect(result.current.take(ctx('b'))).toEqual({ problem: fresh })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/practice/use-prefetched-problem.test.ts`
Expected: FAIL — cannot resolve `./use-prefetched-problem`.

- [ ] **Step 3: Write the implementation**

Create `mobile/src/practice/use-prefetched-problem.ts`:

```ts
import { useCallback, useRef } from 'react'
import type { Problem } from '../types'
import { getRandomProblemFiltered } from '../api/problems'
import { ApiError } from '../api/errors'

export interface PrefetchContext {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  excludeId?: string
}

export type PrefetchResult = { problem: Problem } | { exhausted: true }

function contextKey(ctx: PrefetchContext): string {
  return JSON.stringify([
    ctx.q,
    [...ctx.difficulties].sort(),
    [...ctx.tags].sort(),
    ctx.tagMatch,
    ctx.excludeId ?? '',
  ])
}

interface Slot {
  key: string
  result: PrefetchResult | null // null while the fetch is in flight
}

export function usePrefetchedProblem() {
  const slotRef = useRef<Slot | null>(null)

  const prefetch = useCallback((ctx: PrefetchContext) => {
    const key = contextKey(ctx)
    slotRef.current = { key, result: null }
    void getRandomProblemFiltered(
      ctx.q,
      ctx.difficulties,
      ctx.tags,
      ctx.tagMatch,
      ctx.excludeId,
    )
      .then((problem) => {
        if (slotRef.current?.key !== key) return
        slotRef.current = { key, result: { problem } }
      })
      .catch((e: unknown) => {
        if (slotRef.current?.key !== key) return
        if (e instanceof ApiError && e.status === 404) {
          slotRef.current = { key, result: { exhausted: true } }
        } else {
          slotRef.current = null
        }
      })
  }, [])

  const take = useCallback((ctx: PrefetchContext): PrefetchResult | null => {
    const slot = slotRef.current
    if (!slot || slot.key !== contextKey(ctx) || !slot.result) return null
    slotRef.current = null
    return slot.result
  }, [])

  const invalidate = useCallback(() => {
    slotRef.current = null
  }, [])

  return { prefetch, take, invalidate }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/practice/use-prefetched-problem.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Type-check, full suite, format, commit**

```bash
npx tsc --noEmit
npx jest
npx prettier --write src/practice/use-prefetched-problem.ts src/practice/use-prefetched-problem.test.ts
git add src/practice/use-prefetched-problem.ts src/practice/use-prefetched-problem.test.ts
git commit -m "feat(mobile): add use-prefetched-problem hook with key-matched slot"
```

---

### Task 2: Wire prefetching into `usePracticeSession`

**Files:**
- Modify: `mobile/src/practice/use-practice-session.ts` (imports; hook instantiation; `loadRandom`, `loadSmart`, `loadPlaylistProblem`, `startPlaylist`, `loadNext`)
- Test: `mobile/src/practice/use-practice-session.test.tsx` (append four tests)

**Interfaces:**
- Consumes from Task 1: `usePrefetchedProblem()` → stable `{ prefetch, take, invalidate }`; `PrefetchContext`; result variants `{ problem }` / `{ exhausted: true }`.
- Produces: no new exports; `usePracticeSession`'s public return shape is unchanged.

- [ ] **Step 1: Append the failing tests**

Append to `mobile/src/practice/use-practice-session.test.tsx` (the file already imports `getRandomProblem`, `getRandomProblemFiltered`, `ApiError`, `renderHook`, `act`; `problem` is the module-level fixture with id `'p1'`):

```tsx
const problem2 = { ...problem, id: 'p2', title: 'T2' }
const problem3 = { ...problem, id: 'p3', title: 'T3' }

const sessionOpts = {
  activeTopics: [],
  conciseMode: false,
}

test('loadNext consumes the prefetched problem without a second getRandomProblem call', async () => {
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem2)
    .mockResolvedValueOnce(problem3)
  const { result } = await renderHook(() =>
    usePracticeSession({ ...sessionOpts, activeStages: ['pattern'], onComplete: jest.fn() }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {}) // flush the background prefetch
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.problem?.id).toBe('p2')
  expect(getRandomProblem).toHaveBeenCalledTimes(1)
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    1,
    '',
    [],
    [],
    'and',
    'p1',
  )
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    2,
    '',
    [],
    [],
    'and',
    'p2',
  )
})

test('loadNext falls back to the network while the prefetch is still in flight', async () => {
  ;(getRandomProblemFiltered as jest.Mock).mockImplementation(
    () => new Promise(() => {}),
  )
  const { result } = await renderHook(() =>
    usePracticeSession({ ...sessionOpts, activeStages: ['pattern'], onComplete: jest.fn() }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.loadNext()
  })
  expect(getRandomProblem).toHaveBeenCalledTimes(2)
})

test('playlist loadNext consumes the prefetched problem with filters intact', async () => {
  const filters = {
    q: 'x',
    difficulties: [],
    tags: [],
    tagMatch: 'and' as const,
  }
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem) // startPlaylist load
    .mockResolvedValueOnce(problem2) // prefetch excluding p1
    .mockResolvedValueOnce(problem3) // successor prefetch excluding p2
  const { result } = await renderHook(() =>
    usePracticeSession({ ...sessionOpts, activeStages: ['pattern'], onComplete: jest.fn() }),
  )
  await act(async () => {
    await result.current.startPlaylist(filters)
  })
  await act(async () => {}) // flush prefetch
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.problem?.id).toBe('p2')
  expect(result.current.problemSource).toBe('playlist')
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    2,
    'x',
    [],
    [],
    'and',
    'p1',
  )
  expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
    3,
    'x',
    [],
    [],
    'and',
    'p2',
  )
})

test('playlist loadNext shows end-of-set instantly from a cached 404', async () => {
  const filters = {
    q: 'only-one',
    difficulties: [],
    tags: [],
    tagMatch: 'and' as const,
  }
  ;(getRandomProblemFiltered as jest.Mock)
    .mockResolvedValueOnce(problem) // startPlaylist load
    .mockRejectedValueOnce(new ApiError('not found', 404)) // prefetch 404s
  const { result } = await renderHook(() =>
    usePracticeSession({ ...sessionOpts, activeStages: ['pattern'], onComplete: jest.fn() }),
  )
  await act(async () => {
    await result.current.startPlaylist(filters)
  })
  await act(async () => {}) // flush prefetch rejection
  ;(getRandomProblemFiltered as jest.Mock).mockClear()
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  expect(getRandomProblemFiltered).not.toHaveBeenCalled()
})
```

Note: the existing `beforeEach` re-arms `getRandomProblemFiltered` with `mockImplementation(async () => problem)`; `mockResolvedValueOnce` queues take precedence over it, so the `Once` chains above work without clearing.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx jest src/practice/use-practice-session.test.tsx`
Expected: the first new test FAILS (no prefetch exists, so `getRandomProblemFiltered` is never called and `loadNext` calls `getRandomProblem` again → `problem?.id` is `'p1'`, nth-call assertions fail). The in-flight-fallback test may pass already (fallback is today's behavior); the two playlist tests FAIL. All pre-existing tests still pass.

- [ ] **Step 3: Wire the hook into `use-practice-session.ts`**

3a. Add imports (after the `streamChat` import):

```ts
import { usePrefetchedProblem } from './use-prefetched-problem'
import type { PrefetchContext } from './use-prefetched-problem'
```

3b. Add module-scope context builders (above `interface Opts`), and note `PlaylistFilters` is already imported:

```ts
function randomCtx(excludeId?: string): PrefetchContext {
  return { q: '', difficulties: [], tags: [], tagMatch: 'and', excludeId }
}

function playlistCtx(
  filters: PlaylistFilters,
  excludeId?: string,
): PrefetchContext {
  return { ...filters, excludeId }
}
```

3c. Instantiate inside `usePracticeSession` (after `playlistFiltersRef`):

```ts
const { prefetch, take, invalidate } = usePrefetchedProblem()
```

3d. `loadRandom` — prefetch the successor after a successful load:

```ts
const loadRandom = useCallback(async () => {
  const seq = ++loadSeqRef.current
  setError(null)
  try {
    const p = await getRandomProblem()
    if (seq !== loadSeqRef.current) return
    startSession(p)
    setProblemSource('random')
    playlistFiltersRef.current = null
    setExhausted(false)
    prefetch(randomCtx(p.id))
  } catch {
    if (seq !== loadSeqRef.current) return
    setError('Failed to load a problem. Is the backend running?')
  }
}, [startSession, prefetch])
```

3e. `loadSmart` — invalidate on entry (source switch); body otherwise unchanged:

```ts
const loadSmart = useCallback(async () => {
  invalidate()
  const seq = ++loadSeqRef.current
  setError(null)
  try {
    const p = await getSmartPracticeProblem(activeStages, activeTopics)
    if (seq !== loadSeqRef.current) return
    startSession(p)
    setProblemSource('smart')
    playlistFiltersRef.current = null
    setExhausted(false)
  } catch {
    if (seq !== loadSeqRef.current) return
    setError('Failed to load a problem. Is the backend running?')
  }
}, [startSession, activeStages, activeTopics, invalidate])
```

3f. `loadPlaylistProblem` — prefetch the successor after a successful load:

```ts
const loadPlaylistProblem = useCallback(
  async (excludeId?: string) => {
    const filters = playlistFiltersRef.current
    if (!filters) return
    const seq = ++loadSeqRef.current
    setError(null)
    try {
      const p = await getRandomProblemFiltered(
        filters.q,
        filters.difficulties,
        filters.tags,
        filters.tagMatch,
        excludeId,
      )
      if (seq !== loadSeqRef.current) return
      startSession(p)
      setProblemSource('playlist')
      setExhausted(false)
      prefetch(playlistCtx(filters, p.id))
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      if (e instanceof ApiError && e.status === 404) {
        setExhausted(true)
      } else {
        setError('Failed to load a problem. Is the backend running?')
      }
    }
  },
  [startSession, prefetch],
)
```

3g. `startPlaylist` — prefetch when entering with an initial problem:

```ts
const startPlaylist = useCallback(
  (filters: PlaylistFilters, initialProblem?: Problem) => {
    playlistFiltersRef.current = filters
    setExhausted(false)
    if (initialProblem) {
      ++loadSeqRef.current
      startSession(initialProblem)
      setProblemSource('playlist')
      prefetch(playlistCtx(filters, initialProblem.id))
      return Promise.resolve()
    }
    return loadPlaylistProblem()
  },
  [startSession, loadPlaylistProblem, prefetch],
)
```

3h. `loadNext` — take-then-fallback for random and playlist; smart untouched. A take-hit is synchronous, so bump `loadSeqRef` to discard any in-flight older load (the same trick `startPlaylist`'s `initialProblem` path uses). An exhausted hit in random mode fails the `'problem' in cached` check and falls back to `loadRandom()`:

```ts
const loadNext = useCallback(() => {
  if (problemSource === 'smart') return loadSmart()
  if (problemSource === 'playlist') {
    const filters = playlistFiltersRef.current
    if (filters) {
      const cached = take(playlistCtx(filters, problem?.id))
      if (cached) {
        if ('exhausted' in cached) {
          setExhausted(true)
          return Promise.resolve()
        }
        ++loadSeqRef.current
        startSession(cached.problem)
        setProblemSource('playlist')
        setExhausted(false)
        prefetch(playlistCtx(filters, cached.problem.id))
        return Promise.resolve()
      }
    }
    return loadPlaylistProblem(problem?.id)
  }
  const cached = take(randomCtx(problem?.id))
  if (cached && 'problem' in cached) {
    ++loadSeqRef.current
    startSession(cached.problem)
    setProblemSource('random')
    playlistFiltersRef.current = null
    setExhausted(false)
    prefetch(randomCtx(cached.problem.id))
    return Promise.resolve()
  }
  return loadRandom()
}, [
  problemSource,
  loadSmart,
  loadRandom,
  loadPlaylistProblem,
  problem,
  take,
  prefetch,
  startSession,
])
```

- [ ] **Step 4: Run the session tests to verify they pass**

Run: `npx jest src/practice/use-practice-session.test.tsx`
Expected: PASS, including the four new tests.

- [ ] **Step 5: Type-check, full suite, format, commit**

```bash
npx tsc --noEmit
npx jest
npx prettier --write src/practice/use-practice-session.ts src/practice/use-practice-session.test.tsx
git add src/practice/use-practice-session.ts src/practice/use-practice-session.test.tsx
git commit -m "feat(mobile): prefetch the next problem in random and playlist modes"
```

---

### Task 3: Live simulator verification

**Files:** none modified — verification only (rn-agentic-loop style, run by the controller).

**Interfaces:** n/a.

- [ ] **Step 1: Start the stack**

Backend: `cd backend && go run ./cmd/server` (loads `backend/.env` via godotenv). Metro: `cd mobile && npx expo start` with the iOS simulator (Expo Go launch per the established sim workflow).

- [ ] **Step 2: Receipts (observe via metro-mcp network inspection)**

1. App boots to Practice → one GET `/api/problems/random`, immediately followed by GET `/api/problems/random?exclude_id=<current>` (the prefetch).
2. Tap Next Problem (or Skip) in random mode → the problem swaps instantly; the only new request is the successor prefetch with the new `exclude_id`.
3. Enter a playlist from Search → filtered random + filtered prefetch with `exclude_id`; Next consumes the slot and fires one successor prefetch with filters intact.
4. Narrow filters to a single problem, enter playlist → prefetch 404s; Next shows end-of-set instantly with zero new requests.

- [ ] **Step 3: Record results**

Append PASS/FAIL per receipt to the progress ledger. Any FAIL returns to Task 2 — do not paper over.
