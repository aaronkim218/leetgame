# Next-Problem Prefetching (Web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Next" instant in random mode and shuffled-playlist mode by prefetching the next problem in the background while the user works on the current one.

**Architecture:** A new `usePrefetchedProblem` hook owns a single prefetch slot keyed by the exact fetch context (filters + excludeId); stale or mismatched slots are never consumed. App.tsx consults the slot in its two network-bound "Next" paths and falls back to today's fetch-on-click on any miss.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react (jsdom), existing `getRandomProblemFiltered` API client.

**Spec:** `docs/superpowers/specs/2026-07-06-next-problem-prefetch-design.md`

## Global Constraints

- All commands run from `/Users/aaronkim/projects/leetgame/frontend` unless stated otherwise.
- Test runner: `npx vitest run <file>` for a single file; `npm test` for the suite.
- The repo pre-commit hook runs frontend lint, prettier check, and build plus backend checks — a commit failing any of these is rejected. Code style is Prettier's (no semicolons, single quotes); run `npx prettier --write <files>` before committing.
- Hook files use camelCase names (matching `useSessionStack.ts` etc.), not kebab-case.
- Do not modify: backend, mobile, non-shuffle playlist advance (`loadNextSearchProblem`'s in-memory path), smart practice fetch logic, back-stack mechanics.
- `Problem` type (from `src/types.ts`): `{ id: string; slug: string; title: string; description: string; difficulty: 'Easy' | 'Medium' | 'Hard'; topic_tags: string[]; leetcode_id: number | null }`.
- `ApiError` (from `src/api.ts`): `Error` subclass with readonly `status: number`.

---

### Task 1: `usePrefetchedProblem` hook

**Files:**
- Create: `frontend/src/hooks/usePrefetchedProblem.ts`
- Test: `frontend/src/hooks/usePrefetchedProblem.test.ts`

**Interfaces:**
- Consumes: `getRandomProblemFiltered(q: string, difficulties: string[], tags: string[], tagMatch: 'and' | 'or', excludeId?: string): Promise<Problem>` and `ApiError` from `../api`.
- Produces (Task 2 relies on these exact names):
  - `interface PrefetchContext { q: string; difficulties: string[]; tags: string[]; tagMatch: 'and' | 'or'; excludeId?: string }`
  - `type PrefetchResult = { problem: Problem } | { exhausted: true }`
  - `usePrefetchedProblem(): { prefetch: (ctx: PrefetchContext) => void; take: (ctx: PrefetchContext) => PrefetchResult | null; invalidate: () => void }`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/usePrefetchedProblem.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { Problem } from '../types'

vi.mock('../api', () => {
  class ApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return { ApiError, getRandomProblemFiltered: vi.fn() }
})

import { ApiError, getRandomProblemFiltered } from '../api'
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './usePrefetchedProblem'

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
  vi.mocked(getRandomProblemFiltered).mockReset()
})

describe('usePrefetchedProblem', () => {
  it('take on empty slot returns null', () => {
    const { result } = renderHook(() => usePrefetchedProblem())
    expect(result.current.take(ctx('a'))).toBeNull()
  })

  it('prefetch then take with matching context returns the problem and empties the slot', async () => {
    const p = makeProblem('next')
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(p)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toEqual({ problem: p })
    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('passes the context through to getRandomProblemFiltered', async () => {
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(makeProblem('x'))
    const { result } = renderHook(() => usePrefetchedProblem())

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

  it('take with a mismatched context returns null and does not consume the slot', async () => {
    const p = makeProblem('next')
    vi.mocked(getRandomProblemFiltered).mockResolvedValue(p)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('other'))).toBeNull()
    expect(result.current.take(ctx('current'))).toEqual({ problem: p })
  })

  it('take while the fetch is in flight returns null', () => {
    const d = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered).mockReturnValue(d.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a 404 is stored as exhausted', async () => {
    vi.mocked(getRandomProblemFiltered).mockRejectedValue(
      new ApiError('not found', 404),
    )
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toEqual({ exhausted: true })
  })

  it('a non-404 failure clears the slot', async () => {
    vi.mocked(getRandomProblemFiltered).mockRejectedValue(
      new Error('network down'),
    )
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    await tick()

    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a response arriving after invalidate is dropped', async () => {
    const d = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered).mockReturnValue(d.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('current'))
    result.current.invalidate()
    d.resolve(makeProblem('late'))
    await tick()

    expect(result.current.take(ctx('current'))).toBeNull()
  })

  it('a response arriving after a re-targeting prefetch is dropped', async () => {
    const first = deferred<Problem>()
    const second = deferred<Problem>()
    vi.mocked(getRandomProblemFiltered)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => usePrefetchedProblem())

    result.current.prefetch(ctx('a'))
    result.current.prefetch(ctx('b'))
    first.resolve(makeProblem('stale'))
    const fresh = makeProblem('fresh')
    second.resolve(fresh)
    await tick()

    expect(result.current.take(ctx('a'))).toBeNull()
    expect(result.current.take(ctx('b'))).toEqual({ problem: fresh })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePrefetchedProblem.test.ts`
Expected: FAIL — cannot resolve `./usePrefetchedProblem`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/hooks/usePrefetchedProblem.ts`:

```ts
import { useRef } from 'react'
import type { Problem } from '../types'
import { ApiError, getRandomProblemFiltered } from '../api'

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

  const prefetch = (ctx: PrefetchContext) => {
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
  }

  const take = (ctx: PrefetchContext): PrefetchResult | null => {
    const slot = slotRef.current
    if (!slot || slot.key !== contextKey(ctx) || !slot.result) return null
    slotRef.current = null
    return slot.result
  }

  const invalidate = () => {
    slotRef.current = null
  }

  return { prefetch, take, invalidate }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePrefetchedProblem.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite, format, and commit**

```bash
npm test
npx prettier --write src/hooks/usePrefetchedProblem.ts src/hooks/usePrefetchedProblem.test.ts
git add src/hooks/usePrefetchedProblem.ts src/hooks/usePrefetchedProblem.test.ts
git commit -m "feat(web): add usePrefetchedProblem hook with key-matched slot"
```

---

### Task 2: Wire prefetching into App.tsx

**Files:**
- Modify: `frontend/src/App.tsx` (functions `loadRandomProblem` ~line 204, `loadNextProblem` ~line 281, `loadRandomNextProblem` ~line 310, `loadNextSearchProblem` ~line 219, `loadSmartPracticeProblem` ~line 339, `enterPlaylistFromSearch` ~line 360, `selectProblem` ~line 394, `goBack` ~line 172, `restartSearchSet` ~line 440, the `onToggleShuffle` prop ~line 628)
- Test: `frontend/src/App.test.tsx` (new)

**Interfaces:**
- Consumes from Task 1: `usePrefetchedProblem()` returning `{ prefetch, take, invalidate }`, `PrefetchContext`, result shapes `{ problem }` / `{ exhausted: true }`.
- Produces: no new exports; behavior change only.

- [ ] **Step 1: Write the failing integration test**

Create `frontend/src/App.test.tsx`. It stubs the auth/tags/saved/tour hooks and the heavy child components, leaving App's own state machinery (including `useSessionStack`, `useSearch`, `useTheme`) real:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Problem } from './types'

vi.mock('./api', () => {
  class ApiError extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  }
  return {
    ApiError,
    getRandomProblem: vi.fn(),
    getRandomProblemFiltered: vi.fn(),
    searchProblems: vi.fn(async () => ({
      problems: [],
      page: 1,
      page_size: 20,
      total: 0,
    })),
    streamChat: vi.fn(),
    getSmartPracticeProblem: vi.fn(),
  }
})

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    authLoading: false,
    streak: 0,
    streakStatus: null,
    activeStages: ['pattern'],
    hideTitle: false,
    hideDifficulty: false,
    conciseMode: false,
    activeTopics: [],
    tourDone: true,
    settingsReady: true,
    persistStages: vi.fn(),
    persistHideTitle: vi.fn(),
    persistHideDifficulty: vi.fn(),
    persistConciseMode: vi.fn(),
    persistTopics: vi.fn(),
    persistTourDone: vi.fn(),
    recordAndUpdateStreak: vi.fn(),
  }),
}))

vi.mock('./hooks/useTags', () => ({
  useTags: () => ({ availableTags: [], tagsLoading: false, tagsError: null }),
}))

vi.mock('./hooks/useSaved', () => ({
  useSaved: () => ({
    savedProblems: [],
    savedIds: new Set(),
    save: vi.fn(),
    unsave: vi.fn(),
    isSaved: () => false,
  }),
}))

vi.mock('./hooks/useTour', () => ({
  useTour: () => ({ showBanner: false, dismiss: vi.fn(), markDone: vi.fn() }),
}))

vi.mock('./components/NavBar', () => ({ NavBar: () => <nav /> }))

vi.mock('./components/ProblemView', () => ({
  ProblemView: ({
    problem,
    onSkip,
  }: {
    problem: Problem
    onSkip: () => void
  }) => (
    <div>
      <h1>{problem.title}</h1>
      <button onClick={onSkip}>Skip</button>
    </div>
  ),
}))

vi.mock('./components/ChatView', () => ({ ChatView: () => <div /> }))

import App from './App'
import { getRandomProblem, getRandomProblemFiltered } from './api'

const makeProblem = (id: string, title: string): Problem => ({
  id,
  slug: id,
  title,
  description: 'desc',
  difficulty: 'Easy',
  topic_tags: [],
  leetcode_id: null,
})

beforeEach(() => {
  vi.mocked(getRandomProblem).mockReset()
  vi.mocked(getRandomProblemFiltered).mockReset()
})

describe('next-problem prefetching (random mode)', () => {
  it('Next consumes the prefetched problem without another fetch, then prefetches the successor', async () => {
    const p1 = makeProblem('p1', 'Two Sum')
    const p2 = makeProblem('p2', 'Prefetched Problem')
    const p3 = makeProblem('p3', 'Second Prefetch')
    vi.mocked(getRandomProblem).mockResolvedValue(p1)
    vi.mocked(getRandomProblemFiltered)
      .mockResolvedValueOnce(p2)
      .mockResolvedValueOnce(p3)

    render(<App />)

    await screen.findByText('Two Sum')
    // initial load fired a background prefetch excluding the current problem
    await waitFor(() =>
      expect(getRandomProblemFiltered).toHaveBeenCalledTimes(1),
    )
    expect(getRandomProblemFiltered).toHaveBeenNthCalledWith(
      1,
      '',
      [],
      [],
      'and',
      'p1',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    // the prefetched problem rendered without a second getRandomProblem call
    await screen.findByText('Prefetched Problem')
    expect(getRandomProblem).toHaveBeenCalledTimes(1)
    // and the successor prefetch fired, excluding the new current problem
    await waitFor(() =>
      expect(getRandomProblemFiltered).toHaveBeenCalledTimes(2),
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

  it('falls back to the network when the slot is empty', async () => {
    const p1 = makeProblem('p1', 'Two Sum')
    const p2 = makeProblem('p2', 'Fallback Problem')
    vi.mocked(getRandomProblem)
      .mockResolvedValueOnce(p1)
      .mockResolvedValueOnce(p2)
    // prefetches never resolve — slot stays in flight
    vi.mocked(getRandomProblemFiltered).mockReturnValue(
      new Promise<Problem>(() => {}),
    )

    render(<App />)
    await screen.findByText('Two Sum')

    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await screen.findByText('Fallback Problem')
    expect(getRandomProblem).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — the first test times out on `getRandomProblemFiltered` never being called (no prefetch exists yet). The fallback test may pass already; that's fine.

- [ ] **Step 3: Wire the hook into App.tsx**

All edits are within `frontend/src/App.tsx`.

3a. Add the import (after the `useSessionStack` import, ~line 24):

```ts
import {
  usePrefetchedProblem,
  type PrefetchContext,
} from './hooks/usePrefetchedProblem'
```

3b. Instantiate the hook and context builders (after the `useSessionStack` destructuring, ~line 139):

```ts
const { prefetch, take, invalidate } = usePrefetchedProblem()

const randomCtx = (excludeId?: string): PrefetchContext => ({
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
  excludeId,
})

const playlistCtx = (
  pl: SearchPlaylist,
  excludeId?: string,
): PrefetchContext => ({
  q: pl.q,
  difficulties: pl.difficulties,
  tags: pl.tags,
  tagMatch: pl.tagMatch,
  excludeId,
})
```

3c. `loadRandomProblem` — prefetch the successor after a successful load:

```ts
const loadRandomProblem = async () => {
  try {
    setError(null)
    setPlaylistExhausted(false)
    const p = await getRandomProblem()
    clearStack()
    setProblem(p)
    setProblemSource('random')
    setSearchPlaylist(null)
    resetPracticeState()
    prefetch(randomCtx(p.id))
  } catch {
    setError('Failed to load problem. Is the backend running?')
  }
}
```

3d. `loadNextProblem` — replace the random-mode branch (everything after the `smart` early return) with a take-then-fallback flow. An `exhausted` slot in plain random mode (single-problem catalog) fails the `'problem' in cached` check and falls through to the network path, matching today's behavior:

```ts
// random mode: push current state, then load next
const snap = captureSnapshot()
const cached = take(randomCtx(problem?.id))
if (cached && 'problem' in cached) {
  setError(null)
  setPlaylistExhausted(false)
  if (snap) pushToStack(snap)
  setProblem(cached.problem)
  setProblemSource('random')
  setSearchPlaylist(null)
  resetPracticeState()
  prefetch(randomCtx(cached.problem.id))
  return
}
try {
  setError(null)
  setPlaylistExhausted(false)
  const p = await getRandomProblem()
  if (snap) pushToStack(snap)
  setProblem(p)
  setProblemSource('random')
  setSearchPlaylist(null)
  resetPracticeState()
  prefetch(randomCtx(p.id))
} catch {
  setError('Failed to load problem. Is the backend running?')
}
```

3e. `loadRandomNextProblem` (shuffle mode) — same pattern, honoring a cached `exhausted`:

```ts
const loadRandomNextProblem = async () => {
  if (!searchPlaylist) return
  const snap = captureSnapshot()
  const cached = take(playlistCtx(searchPlaylist, problem?.id))
  if (cached) {
    if ('exhausted' in cached) {
      setPlaylistExhausted(true)
      setError(null)
      return
    }
    setError(null)
    setPlaylistExhausted(false)
    if (snap) pushToStack(snap)
    setProblem(cached.problem)
    resetPracticeState()
    prefetch(playlistCtx(searchPlaylist, cached.problem.id))
    return
  }
  try {
    setError(null)
    const p = await getRandomProblemFiltered(
      searchPlaylist.q,
      searchPlaylist.difficulties,
      searchPlaylist.tags,
      searchPlaylist.tagMatch,
      problem?.id,
    )
    if (snap) pushToStack(snap)
    setProblem(p)
    resetPracticeState()
    setPlaylistExhausted(false)
    prefetch(playlistCtx(searchPlaylist, p.id))
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      // no other problem matches the filters — the set is done
      setPlaylistExhausted(true)
      setError(null)
      return
    }
    setError(
      'Failed to load a random filtered problem. Is the backend running?',
    )
  }
}
```

3f. `enterPlaylistFromSearch` — prefetch the shuffled successor after entering (insert before `setView('practice')`; the playlist state isn't committed yet, so build the context from the local variables):

```ts
prefetch({ q, difficulties, tags, tagMatch, excludeId: p.id })
```

3g. Hygiene invalidation — add a single `invalidate()` call at the top of each of these (correctness comes from key-matching; this just drops dead data):
- `goBack` (first line after the `if (!snap) return` guard)
- `selectProblem` (first line)
- `loadSmartPracticeProblem` (first line)
- `loadNextSearchProblem` (first line — non-shuffle advance changes the current problem, so the slot's `excludeId` is stale)
- `restartSearchSet` (first line after the `if (!searchPlaylist) return` guard)

3h. Shuffle toggle (~line 628) — invalidate when the mode flips:

```ts
onToggleShuffle={
  problemSource === 'search'
    ? () => {
        invalidate()
        setShuffle((s) => !s)
      }
    : undefined
}
```

- [ ] **Step 4: Run the integration test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite and build**

```bash
npm test
npm run build
```
Expected: all tests pass; `tsc -b && vite build` succeeds with no new errors (the three pre-existing eslint warnings in App.tsx are acceptable).

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/App.tsx src/App.test.tsx
git add src/App.tsx src/App.test.tsx
git commit -m "feat(web): prefetch the next problem in random and shuffle modes"
```

---

### Task 3: End-to-end verification in the running app

**Files:** none modified — verification only.

**Interfaces:** n/a.

- [ ] **Step 1: Run the app against the local backend**

Start the backend: `cd backend && go run ./cmd/server` (it loads `backend/.env` via godotenv — no extra env setup needed). Start the web app: `cd frontend && npm run dev` (Vite proxies `/api` to `localhost:42069`).

- [ ] **Step 2: Verify prefetch behavior in the browser**

With devtools' Network tab open on `localhost:5173`:
1. Load the app — expect one `/api/problems/random` request for the initial problem and a second one with `exclude_id=<current>` fired immediately after (the prefetch).
2. Click Skip — the next problem must render with no new request at click time (the follow-up prefetch request fires right after the swap).
3. Enter a playlist from Search with shuffle on and repeat — same pattern with the filter params present.
4. Toggle shuffle off, click Next through the in-memory playlist — no prefetch requests fire.
5. Narrow filters to a single problem, enter playlist, click Next — end-of-set appears instantly on the second Next (cached 404).

- [ ] **Step 3: Report results**

Record what was observed (request timing, any surprises) in the session before claiming completion. If any check fails, return to Task 2 rather than papering over it.
