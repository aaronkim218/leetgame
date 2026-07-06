# Mobile Search + Saved + Shuffled Playlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the web Search page to the RN app: filtered problem search with pagination, saved problems (star + saved view), and a shuffled playlist mode built on the practice session's `problemSource` machinery.

**Architecture:** New API functions (`searchProblems`, `getRandomProblemFiltered` with an `ApiError` carrying HTTP status, saved CRUD) feed a `/search` screen living in `src/screens/` (thin route re-export — expo-router bundles every file in `src/app/`). Selection crosses the route boundary via a one-shot `pending-playlist` module plus the proven `dismissTo` nonce pattern. The session hook gains a `'playlist'` source with exclude-current next-draws, 404 → end-of-set, and restart.

**Tech Stack:** Expo SDK 56 + expo-router 56.2.11, jest-expo + @testing-library/react-native v14 (`mobile/`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-06-mobile-search-saved-design.md`

## Global Constraints

- Work on branch `feat/mobile-search` (create from `main` before Task 1).
- Query params, verbatim (backend `types/search_query.go`): `q`, `difficulty` (comma-joined), `tags` (comma-joined), `tag_match` (only when tags present), `exclude_id`, `page`, `page_size`. Omit `q`/`difficulty`/`tags` when empty. Page size is 12.
- `GET /api/problems/random` returns **404 when no other problem matches** — that is end-of-set, never an error message.
- Exact testIDs: `search-button`, `search-screen`, `search-query`, `search-difficulty-all`, `search-difficulty-<Easy|Medium|Hard>`, `search-saved-toggle`, `search-tag-match-and`, `search-tag-match-or`, `search-tag-query`, `search-tag-selected-<name>`, `search-tag-option-<name>`, `search-enter-playlist`, `search-result-<id>`, `search-save-<id>`, `search-prev`, `search-next`, `search-error`, `search-empty`, `playlist-banner`, `playlist-exit`, `end-of-set`, `end-of-set-restart`, `end-of-set-random`.
- Saved (star, Saved view) renders signed-in only; search + playlist work anonymously.
- Copy, verbatim: end-of-set title "End of practice set", body "You reached the end of the current filtered set.", buttons "Restart set" / "Random problem"; search error "Search failed."; empty "No problems found." (+ " Try clearing your filters." when any filter active); saved-empty "No saved problems yet."; playlist button "Practice these".
- Screens live in `src/screens/` with a thin `src/app/<route>.tsx` re-export; tests co-located in `src/screens/`. NEVER put a test file under `src/app/` (expo-router bundles it as a route — this broke the app once already).
- A route string literal (e.g. `href="/search"`) must land in the same task that creates the route file, or typedRoutes fails typecheck.
- One `problemSource` at a time: entering random/smart clears playlist state; entering playlist clears smart.
- All loaders use the existing `loadSeqRef` sequence-guard pattern: capture `seq = ++loadSeqRef.current` at call start, re-check after every await before ANY state write (success and catch paths).
- RNTL v14: `fireEvent.press(...)`; some presses need `await` before subsequent synchronous queries see the re-render.
- Project style: single quotes, no semicolons (`mobile/.prettierrc`); run `npx prettier --write` from inside `mobile/` on touched files before committing.
- Test commands: `cd mobile && npx jest` and `cd mobile && npx tsc --noEmit`.

---

### Task 1: API — errors, search, filtered random, types

**Files:**
- Create: `mobile/src/api/errors.ts`
- Create: `mobile/src/api/errors.test.ts`
- Modify: `mobile/src/api/problems.ts` (add two functions + a shared helper)
- Modify: `mobile/src/api/problems.test.ts` (append tests)
- Modify: `mobile/src/types.ts` (add `ProblemSearchResponse`, `PlaylistFilters`, `EMPTY_FILTERS`)

**Interfaces:**
- Consumes: `API_URL`, `authHeaders` from `./client`; `Problem` from `../types`.
- Produces: `class ApiError extends Error { status: number }` (from `src/api/errors.ts`); `searchProblems(q: string, difficulties: string[], tags: string[], tagMatch: 'and' | 'or', page: number, pageSize: number, signal?: AbortSignal): Promise<ProblemSearchResponse>`; `getRandomProblemFiltered(q: string, difficulties: string[], tags: string[], tagMatch: 'and' | 'or', excludeId?: string): Promise<Problem>` (throws `ApiError`); `interface ProblemSearchResponse { problems: Problem[]; page: number; page_size: number; total: number }`; `interface PlaylistFilters { q: string; difficulties: string[]; tags: string[]; tagMatch: 'and' | 'or' }`; `const EMPTY_FILTERS: PlaylistFilters`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/aaronkim/projects/leetgame
git checkout -b feat/mobile-search
```

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/api/errors.test.ts`:

```ts
import { ApiError } from './errors'

test('ApiError carries status and is an Error', () => {
  const e = new ApiError('nope', 404)
  expect(e).toBeInstanceOf(Error)
  expect(e).toBeInstanceOf(ApiError)
  expect(e.status).toBe(404)
  expect(e.message).toBe('nope')
})
```

Append to `mobile/src/api/problems.test.ts` (merge the import into the existing `from './problems'` import line; add the `ApiError` import):

```ts
import { searchProblems, getRandomProblemFiltered } from './problems'
import { ApiError } from './errors'

test('searchProblems encodes all filters, page, and page_size', async () => {
  const response = { problems: [problem], page: 2, page_size: 12, total: 40 }
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => response,
  })) as unknown as typeof fetch
  const result = await searchProblems(
    'two sum',
    ['Easy', 'Medium'],
    ['Array', 'Hash Table'],
    'or',
    2,
    12,
  )
  expect(result).toEqual(response)
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems?')
  expect(url).toContain('q=two+sum')
  expect(url).toContain('difficulty=Easy%2CMedium')
  expect(url).toContain('tags=Array%2CHash+Table')
  expect(url).toContain('tag_match=or')
  expect(url).toContain('page=2')
  expect(url).toContain('page_size=12')
})

test('searchProblems omits empty filters and tag_match without tags', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ problems: [], page: 1, page_size: 12, total: 0 }),
  })) as unknown as typeof fetch
  await searchProblems('', [], [], 'and', 1, 12)
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).not.toContain('q=')
  expect(url).not.toContain('difficulty=')
  expect(url).not.toContain('tags=')
  expect(url).not.toContain('tag_match=')
  expect(url).toContain('page=1')
  expect(url).toContain('page_size=12')
})

test('searchProblems forwards the abort signal', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ problems: [], page: 1, page_size: 12, total: 0 }),
  })) as unknown as typeof fetch
  const controller = new AbortController()
  await searchProblems('', [], [], 'and', 1, 12, controller.signal)
  const init = (globalThis.fetch as jest.Mock).mock.calls[0][1] as {
    signal?: AbortSignal
  }
  expect(init.signal).toBe(controller.signal)
})

test('getRandomProblemFiltered encodes filters and exclude_id', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => problem,
  })) as unknown as typeof fetch
  await getRandomProblemFiltered('sum', ['Hard'], ['Graph'], 'and', 'p9')
  const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems/random?')
  expect(url).toContain('q=sum')
  expect(url).toContain('difficulty=Hard')
  expect(url).toContain('tags=Graph')
  expect(url).toContain('tag_match=and')
  expect(url).toContain('exclude_id=p9')
})

test('getRandomProblemFiltered throws ApiError with status on non-OK', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
  })) as unknown as typeof fetch
  const err = await getRandomProblemFiltered('', [], [], 'and').catch(
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(ApiError)
  expect((err as ApiError).status).toBe(404)
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd mobile && npx jest src/api`
Expected: FAIL — `./errors` module and the two exports don't exist.

- [ ] **Step 4: Implement**

Create `mobile/src/api/errors.ts`:

```ts
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```

Add to `mobile/src/types.ts` (after `ProblemTag`):

```ts
export interface ProblemSearchResponse {
  problems: Problem[]
  page: number
  page_size: number
  total: number
}

export interface PlaylistFilters {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
}

export const EMPTY_FILTERS: PlaylistFilters = {
  q: '',
  difficulties: [],
  tags: [],
  tagMatch: 'and',
}
```

Add to `mobile/src/api/problems.ts` (extend the type import with `ProblemSearchResponse`; add `import { ApiError } from './errors'`):

```ts
function filterParams(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
): URLSearchParams {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (difficulties.length) params.set('difficulty', difficulties.join(','))
  if (tags.length) params.set('tags', tags.join(','))
  if (tags.length) params.set('tag_match', tagMatch)
  return params
}

export async function searchProblems(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<ProblemSearchResponse> {
  const params = filterParams(q, difficulties, tags, tagMatch)
  params.set('page', String(page))
  params.set('page_size', String(pageSize))
  const res = await fetch(`${API_URL}/api/problems?${params.toString()}`, {
    headers: await authHeaders(),
    signal,
  })
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  return res.json()
}

export async function getRandomProblemFiltered(
  q: string,
  difficulties: string[],
  tags: string[],
  tagMatch: 'and' | 'or',
  excludeId?: string,
): Promise<Problem> {
  const params = filterParams(q, difficulties, tags, tagMatch)
  if (excludeId) params.set('exclude_id', excludeId)
  const res = await fetch(
    `${API_URL}/api/problems/random?${params.toString()}`,
    { headers: await authHeaders() },
  )
  if (!res.ok)
    throw new ApiError(`Failed to fetch problem: ${res.status}`, res.status)
  return res.json()
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd mobile && npx jest src/api && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/api/errors.ts src/api/errors.test.ts src/api/problems.ts src/api/problems.test.ts src/types.ts
cd /Users/aaronkim/projects/leetgame
git add mobile/src/api mobile/src/types.ts
git commit -m "feat(mobile): search and filtered-random API with status-carrying ApiError"
```

---

### Task 2: Saved API + `useSaved` hook

**Files:**
- Create: `mobile/src/api/saved.ts`
- Create: `mobile/src/api/saved.test.ts`
- Create: `mobile/src/saved/use-saved.ts`
- Create: `mobile/src/saved/use-saved.test.tsx`

**Interfaces:**
- Consumes: `API_URL`, `authHeaders` from `../api/client`; `Problem` from `../types`; `Session` type from `@supabase/supabase-js`.
- Produces: `getSavedProblems(): Promise<Problem[]>`, `saveProblem(problemId: string): Promise<void>`, `unsaveProblem(problemId: string): Promise<void>`; `useSaved(session: Session | null): { savedProblems: Problem[]; savedIds: Set<string>; save: (problem: Problem) => Promise<void>; unsave: (problemId: string) => Promise<void>; isSaved: (problemId: string) => boolean }`. Task 6 consumes the hook.

- [ ] **Step 1: Write the failing API tests**

Create `mobile/src/api/saved.test.ts`:

```ts
jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import { getSavedProblems, saveProblem, unsaveProblem } from './saved'

const problem = {
  id: 'p1', slug: 's', title: 'T', description: 'D',
  difficulty: 'Easy', topic_tags: [], leetcode_id: 1,
}

beforeEach(() => {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [problem],
  })) as unknown as typeof fetch
})

test('getSavedProblems hits the saved endpoint with auth header', async () => {
  const result = await getSavedProblems()
  expect(result).toEqual([problem])
  expect(globalThis.fetch).toHaveBeenCalledWith('https://api.test/api/saved', {
    headers: { Authorization: 'Bearer t' },
  })
})

test('saveProblem POSTs to the problem-scoped route', async () => {
  await saveProblem('p1')
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/saved/p1',
    { method: 'POST', headers: { Authorization: 'Bearer t' } },
  )
})

test('unsaveProblem DELETEs the problem-scoped route', async () => {
  await unsaveProblem('p1')
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/api/saved/p1',
    { method: 'DELETE', headers: { Authorization: 'Bearer t' } },
  )
})

test('saveProblem throws on non-OK', async () => {
  globalThis.fetch = jest.fn(async () => ({
    ok: false,
    status: 401,
  })) as unknown as typeof fetch
  await expect(saveProblem('p1')).rejects.toThrow('401')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/api/saved`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `mobile/src/api/saved.ts`**

```ts
import type { Problem } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSavedProblems(): Promise<Problem[]> {
  const res = await fetch(`${API_URL}/api/saved`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch saved problems: ${res.status}`)
  return res.json()
}

export async function saveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to save problem: ${res.status}`)
}

export async function unsaveProblem(problemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/saved/${problemId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to unsave problem: ${res.status}`)
}
```

Run: `cd mobile && npx jest src/api/saved`
Expected: PASS.

- [ ] **Step 4: Write the failing hook tests**

Create `mobile/src/saved/use-saved.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react-native'
import type { Session } from '@supabase/supabase-js'
import { useSaved } from './use-saved'

const problem = {
  id: 'p1', slug: 's', title: 'T', description: 'D',
  difficulty: 'Easy' as const, topic_tags: [], leetcode_id: 1,
}

jest.mock('../api/saved', () => ({
  getSavedProblems: jest.fn(),
  saveProblem: jest.fn(async () => {}),
  unsaveProblem: jest.fn(async () => {}),
}))

import { getSavedProblems, saveProblem, unsaveProblem } from '../api/saved'

const session = { user: { id: 'u1' } } as unknown as Session

beforeEach(() => {
  ;(getSavedProblems as jest.Mock).mockReset().mockResolvedValue([problem])
  ;(saveProblem as jest.Mock).mockClear().mockResolvedValue(undefined)
  ;(unsaveProblem as jest.Mock).mockClear().mockResolvedValue(undefined)
})

test('anonymous: no fetch, empty saved list', async () => {
  const { result } = await renderHook(() => useSaved(null))
  expect(result.current.savedProblems).toEqual([])
  expect(getSavedProblems).not.toHaveBeenCalled()
})

test('signed in: fetches saved problems and exposes ids', async () => {
  const { result } = await renderHook(() => useSaved(session))
  await waitFor(() => expect(result.current.savedProblems).toEqual([problem]))
  expect(result.current.savedIds.has('p1')).toBe(true)
  expect(result.current.isSaved('p1')).toBe(true)
})

test('save is optimistic and calls the API', async () => {
  ;(getSavedProblems as jest.Mock).mockResolvedValue([])
  const { result } = await renderHook(() => useSaved(session))
  const p2 = { ...problem, id: 'p2' }
  await act(async () => {
    await result.current.save(p2)
  })
  expect(result.current.isSaved('p2')).toBe(true)
  expect(saveProblem).toHaveBeenCalledWith('p2')
})

test('unsave removes optimistically and calls the API', async () => {
  const { result } = await renderHook(() => useSaved(session))
  await waitFor(() => expect(result.current.isSaved('p1')).toBe(true))
  await act(async () => {
    await result.current.unsave('p1')
  })
  expect(result.current.isSaved('p1')).toBe(false)
  expect(unsaveProblem).toHaveBeenCalledWith('p1')
})

test('failed save refetches the authoritative list', async () => {
  ;(getSavedProblems as jest.Mock).mockResolvedValue([])
  ;(saveProblem as jest.Mock).mockRejectedValue(new Error('boom'))
  const { result } = await renderHook(() => useSaved(session))
  await act(async () => {
    await result.current.save(problem)
  })
  // initial fetch + recovery refetch
  await waitFor(() => expect(getSavedProblems).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(result.current.savedProblems).toEqual([]))
})
```

- [ ] **Step 5: Run to verify they fail**

Run: `cd mobile && npx jest src/saved`
Expected: FAIL — module does not exist.

- [ ] **Step 6: Create `mobile/src/saved/use-saved.ts`**

```ts
import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Problem } from '../types'
import { getSavedProblems, saveProblem, unsaveProblem } from '../api/saved'

export function useSaved(session: Session | null): {
  savedProblems: Problem[]
  savedIds: Set<string>
  save: (problem: Problem) => Promise<void>
  unsave: (problemId: string) => Promise<void>
  isSaved: (problemId: string) => boolean
} {
  const [savedProblems, setSavedProblems] = useState<Problem[]>([])
  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
      setSavedProblems([])
      return
    }
    getSavedProblems()
      .then(setSavedProblems)
      .catch(() => {})
  }, [userId])

  const savedIds = useMemo(
    () => new Set(savedProblems.map((p) => p.id)),
    [savedProblems],
  )

  const save = async (problem: Problem) => {
    setSavedProblems((prev) =>
      prev.some((p) => p.id === problem.id) ? prev : [...prev, problem],
    )
    await saveProblem(problem.id).catch(() => {
      getSavedProblems()
        .then(setSavedProblems)
        .catch(() => {})
    })
  }

  const unsave = async (problemId: string) => {
    setSavedProblems((prev) => prev.filter((p) => p.id !== problemId))
    await unsaveProblem(problemId).catch(() => {
      getSavedProblems()
        .then(setSavedProblems)
        .catch(() => {})
    })
  }

  const isSaved = (problemId: string) => savedIds.has(problemId)

  return { savedProblems, savedIds, save, unsave, isSaved }
}
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/api/saved.ts src/api/saved.test.ts src/saved/use-saved.ts src/saved/use-saved.test.tsx
cd /Users/aaronkim/projects/leetgame
git add mobile/src/api/saved.ts mobile/src/api/saved.test.ts mobile/src/saved
git commit -m "feat(mobile): saved-problems API and useSaved hook"
```

---

### Task 3: Playlist mode in the practice session

**Files:**
- Modify: `mobile/src/practice/use-practice-session.ts`
- Test: `mobile/src/practice/use-practice-session.test.tsx` (extend)

**Interfaces:**
- Consumes: `getRandomProblemFiltered` (Task 1), `ApiError` from `../api/errors` (Task 1), `PlaylistFilters` from `../types`.
- Produces: hook return gains `exhausted: boolean`, `playlistFilters: PlaylistFilters | null`, `startPlaylist(filters: PlaylistFilters, initialProblem?: Problem): Promise<void>`, `restartPlaylist(): Promise<void>`; `problemSource` type widens to `'random' | 'smart' | 'playlist'`; `loadNext()` in playlist mode draws another match excluding the current problem. Tasks 5–6 consume these.

- [ ] **Step 1: Write the failing tests**

In `mobile/src/practice/use-practice-session.test.tsx`: extend the `jest.mock('../api/problems', ...)` factory with `getRandomProblemFiltered: jest.fn(async () => problem)`, add it to the mocked import line, and add `;(getRandomProblemFiltered as jest.Mock).mockClear()` plus `.mockImplementation(async () => problem)` reset in `beforeEach` (the reject-based tests below change it). Then append:

```tsx
import { ApiError } from '../api/errors'

const FILTERS = {
  q: 'sum',
  difficulties: ['Easy'],
  tags: ['Array'],
  tagMatch: 'and' as const,
}

test('startPlaylist with an initial problem starts there without fetching', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  const initial = { ...problem, id: 'p-init' }
  await act(async () => {
    await result.current.startPlaylist(FILTERS, initial)
  })
  expect(result.current.problem?.id).toBe('p-init')
  expect(result.current.problemSource).toBe('playlist')
  expect(result.current.playlistFilters).toEqual(FILTERS)
  expect(getRandomProblemFiltered).not.toHaveBeenCalled()
})

test('startPlaylist without a problem fetches a filtered random one', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS)
  })
  expect(result.current.problemSource).toBe('playlist')
  expect(getRandomProblemFiltered).toHaveBeenCalledWith(
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    undefined,
  )
})

test('loadNext in playlist mode excludes the current problem', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadNext()
  })
  expect(getRandomProblemFiltered).toHaveBeenLastCalledWith(
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    'p-cur',
  )
  expect(result.current.problemSource).toBe('playlist')
})

test('a 404 on next marks the set exhausted without an error', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValueOnce(
    new ApiError('no match', 404),
  )
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  expect(result.current.error).toBeNull()
  expect(result.current.problem?.id).toBe('p-cur')
})

test('restartPlaylist refetches without exclude and clears exhausted', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  ;(getRandomProblemFiltered as jest.Mock).mockRejectedValueOnce(
    new ApiError('no match', 404),
  )
  await act(async () => {
    await result.current.loadNext()
  })
  expect(result.current.exhausted).toBe(true)
  await act(async () => {
    await result.current.restartPlaylist()
  })
  expect(result.current.exhausted).toBe(false)
  expect(getRandomProblemFiltered).toHaveBeenLastCalledWith(
    'sum',
    ['Easy'],
    ['Array'],
    'and',
    undefined,
  )
})

test('loadRandom exits the playlist and clears its state', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problemSource).toBe('random')
  expect(result.current.playlistFilters).toBeNull()
  await act(async () => {
    await result.current.loadNext()
  })
  expect(getRandomProblem).toHaveBeenCalledTimes(2)
})

test('entering smart mode clears playlist state', async () => {
  const { result } = await renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      conciseMode: false,
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.startPlaylist(FILTERS, { ...problem, id: 'p-cur' })
  })
  await act(async () => {
    await result.current.loadSmart()
  })
  expect(result.current.problemSource).toBe('smart')
  expect(result.current.playlistFilters).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/practice/use-practice-session`
Expected: FAIL — `startPlaylist`, `restartPlaylist`, `exhausted`, `playlistFilters` are undefined.

- [ ] **Step 3: Implement**

In `mobile/src/practice/use-practice-session.ts`:

3a. Imports:

```ts
import {
  getRandomProblem,
  getSmartPracticeProblem,
  getRandomProblemFiltered,
} from '../api/problems'
import { ApiError } from '../api/errors'
import type {
  Problem,
  ChatMessage,
  Stage,
  ActiveStage,
  PlaylistFilters,
} from '../types'
```

3b. State (replace the `problemSource` declaration; add the two below it):

```ts
  const [problemSource, setProblemSource] = useState<
    'random' | 'smart' | 'playlist'
  >('random')
  const [exhausted, setExhausted] = useState(false)
  const playlistFiltersRef = useRef<PlaylistFilters | null>(null)
```

3c. `loadRandom` and `loadSmart` clear playlist state in their success paths — after the existing `setProblemSource(...)` line in each, add:

```ts
      playlistFiltersRef.current = null
      setExhausted(false)
```

3d. Add the playlist loaders after `loadSmart` (before `loadNext`):

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
      } catch (e) {
        if (seq !== loadSeqRef.current) return
        if (e instanceof ApiError && e.status === 404) {
          setExhausted(true)
        } else {
          setError('Failed to load a problem. Is the backend running?')
        }
      }
    },
    [startSession],
  )

  const startPlaylist = useCallback(
    (filters: PlaylistFilters, initialProblem?: Problem) => {
      playlistFiltersRef.current = filters
      setExhausted(false)
      if (initialProblem) {
        ++loadSeqRef.current
        startSession(initialProblem)
        setProblemSource('playlist')
        return Promise.resolve()
      }
      return loadPlaylistProblem()
    },
    [startSession, loadPlaylistProblem],
  )

  const restartPlaylist = useCallback(
    () => loadPlaylistProblem(),
    [loadPlaylistProblem],
  )
```

3e. Replace `loadNext`:

```ts
  const loadNext = useCallback(
    () =>
      problemSource === 'smart'
        ? loadSmart()
        : problemSource === 'playlist'
          ? loadPlaylistProblem(problem?.id)
          : loadRandom(),
    [problemSource, loadSmart, loadRandom, loadPlaylistProblem, problem],
  )
```

3f. Return object additions (after `problemSource`):

```ts
    exhausted,
    playlistFilters: playlistFiltersRef.current,
    startPlaylist,
    restartPlaylist,
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest src/practice && npx tsc --noEmit`
Expected: PASS (including all pre-existing smart-mode and race tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/practice/use-practice-session.ts src/practice/use-practice-session.test.tsx
cd /Users/aaronkim/projects/leetgame
git add mobile/src/practice
git commit -m "feat(mobile): playlist problem source with exclude-current draws and end-of-set"
```

---

### Task 4: Pending-playlist handoff + PlaylistBanner + EndOfSet components

**Files:**
- Create: `mobile/src/practice/pending-playlist.ts`
- Create: `mobile/src/practice/pending-playlist.test.ts`
- Create: `mobile/src/components/playlist-banner.tsx`
- Create: `mobile/src/components/playlist-banner.test.tsx`
- Create: `mobile/src/components/end-of-set.tsx`
- Create: `mobile/src/components/end-of-set.test.tsx`

**Interfaces:**
- Consumes: `PlaylistFilters`, `Problem` from `../types`; `useTheme` from `../theme/theme-context`.
- Produces: `setPendingPlaylist(p: { filters: PlaylistFilters; problem?: Problem }): void` and `takePendingPlaylist(): { filters: PlaylistFilters; problem?: Problem } | null` (one-shot); `playlistSummary(filters: PlaylistFilters): string`; `PlaylistBanner({ filters, onExit }: { filters: PlaylistFilters; onExit: () => void })`; `EndOfSet({ onRestart, onRandom }: { onRestart: () => void; onRandom: () => void })`. Tasks 5–6 consume these.

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/practice/pending-playlist.test.ts`:

```ts
import { setPendingPlaylist, takePendingPlaylist } from './pending-playlist'

const filters = {
  q: 'x', difficulties: [], tags: [], tagMatch: 'and' as const,
}

test('take returns what was set, then null (one-shot)', () => {
  setPendingPlaylist({ filters })
  expect(takePendingPlaylist()).toEqual({ filters })
  expect(takePendingPlaylist()).toBeNull()
})

test('take returns null when nothing was set', () => {
  expect(takePendingPlaylist()).toBeNull()
})
```

Create `mobile/src/components/playlist-banner.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { PlaylistBanner, playlistSummary } from './playlist-banner'

test('playlistSummary formats query, difficulties, and tags', () => {
  expect(
    playlistSummary({
      q: 'two sum',
      difficulties: ['Easy', 'Medium'],
      tags: ['Array', 'Graph'],
      tagMatch: 'and',
    }),
  ).toBe('"two sum" · Easy/Medium · Array+Graph')
  expect(
    playlistSummary({
      q: '',
      difficulties: [],
      tags: ['Array', 'Graph'],
      tagMatch: 'or',
    }),
  ).toBe('Array, Graph')
  expect(
    playlistSummary({ q: '', difficulties: [], tags: [], tagMatch: 'and' }),
  ).toBe('Playlist')
})

test('renders the summary and fires onExit', async () => {
  const onExit = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <PlaylistBanner
        filters={{
          q: 'sum', difficulties: [], tags: [], tagMatch: 'and',
        }}
        onExit={onExit}
      />
    </ThemeProvider>,
  )
  expect(getByText('"sum"')).toBeTruthy()
  fireEvent.press(getByTestId('playlist-exit'))
  expect(onExit).toHaveBeenCalledTimes(1)
})
```

Create `mobile/src/components/end-of-set.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { EndOfSet } from './end-of-set'

test('renders copy and fires both callbacks', async () => {
  const onRestart = jest.fn()
  const onRandom = jest.fn()
  const { getByTestId, getByText } = await render(
    <ThemeProvider>
      <EndOfSet onRestart={onRestart} onRandom={onRandom} />
    </ThemeProvider>,
  )
  expect(getByText('End of practice set')).toBeTruthy()
  expect(
    getByText('You reached the end of the current filtered set.'),
  ).toBeTruthy()
  fireEvent.press(getByTestId('end-of-set-restart'))
  expect(onRestart).toHaveBeenCalledTimes(1)
  fireEvent.press(getByTestId('end-of-set-random'))
  expect(onRandom).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/practice/pending-playlist src/components/playlist-banner src/components/end-of-set`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

Create `mobile/src/practice/pending-playlist.ts`:

```ts
import type { PlaylistFilters, Problem } from '../types'

export interface PendingPlaylist {
  filters: PlaylistFilters
  problem?: Problem
}

let pending: PendingPlaylist | null = null

export function setPendingPlaylist(p: PendingPlaylist): void {
  pending = p
}

export function takePendingPlaylist(): PendingPlaylist | null {
  const p = pending
  pending = null
  return p
}
```

Create `mobile/src/components/playlist-banner.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'
import type { PlaylistFilters } from '../types'

export function playlistSummary(filters: PlaylistFilters): string {
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.difficulties.length) parts.push(filters.difficulties.join('/'))
  if (filters.tags.length)
    parts.push(filters.tags.join(filters.tagMatch === 'and' ? '+' : ', '))
  return parts.length ? parts.join(' · ') : 'Playlist'
}

export function PlaylistBanner({
  filters,
  onExit,
}: {
  filters: PlaylistFilters
  onExit: () => void
}) {
  const theme = useTheme()
  return (
    <View
      testID="playlist-banner"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
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
        numberOfLines={1}
        style={{
          flex: 1,
          color: theme.mutedForeground,
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.5,
        }}
      >
        {playlistSummary(filters)}
      </Text>
      <Pressable
        testID="playlist-exit"
        accessibilityLabel="Exit playlist"
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

Create `mobile/src/components/end-of-set.tsx`:

```tsx
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function EndOfSet({
  onRestart,
  onRandom,
}: {
  onRestart: () => void
  onRandom: () => void
}) {
  const theme = useTheme()
  return (
    <View
      testID="end-of-set"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
    >
      <Text
        style={{ color: theme.foreground, fontSize: 22, fontWeight: '600' }}
      >
        End of practice set
      </Text>
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 14,
          textAlign: 'center',
        }}
      >
        You reached the end of the current filtered set.
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          testID="end-of-set-restart"
          accessibilityRole="button"
          onPress={onRestart}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Restart set
          </Text>
        </Pressable>
        <Pressable
          testID="end-of-set-random"
          accessibilityRole="button"
          onPress={onRandom}
          style={{
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Text style={{ color: theme.foreground, fontWeight: '600' }}>
            Random problem
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd mobile && npx jest src/practice/pending-playlist src/components/playlist-banner src/components/end-of-set && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/practice/pending-playlist.ts src/practice/pending-playlist.test.ts src/components/playlist-banner.tsx src/components/playlist-banner.test.tsx src/components/end-of-set.tsx src/components/end-of-set.test.tsx
cd /Users/aaronkim/projects/leetgame
git add mobile/src/practice/pending-playlist.ts mobile/src/practice/pending-playlist.test.ts mobile/src/components/playlist-banner.tsx mobile/src/components/playlist-banner.test.tsx mobile/src/components/end-of-set.tsx mobile/src/components/end-of-set.test.tsx
git commit -m "feat(mobile): pending-playlist handoff, playlist banner, end-of-set components"
```

---

### Task 5: Practice screen playlist wiring

**Files:**
- Modify: `mobile/src/app/index.tsx`

**Interfaces:**
- Consumes: `takePendingPlaylist` (Task 4), `PlaylistBanner`/`EndOfSet` (Task 4), `startPlaylist`/`restartPlaylist`/`exhausted`/`playlistFilters` (Task 3).
- Produces: the Practice screen reacts to a `playlist` route param nonce (set by Task 6's Search screen). NO `/search` header button in this task — that route doesn't exist yet and typedRoutes would reject the literal (Task 6 adds it with the route file).

- [ ] **Step 1: Implement the wiring**

Edit `mobile/src/app/index.tsx`:

1a. Add imports:

```tsx
import { PlaylistBanner } from '@/components/playlist-banner'
import { EndOfSet } from '@/components/end-of-set'
import { takePendingPlaylist } from '@/practice/pending-playlist'
```

1b. Replace the param destructure and add the playlist effect after the existing smart effect (note the initial-load effect gains `&& !playlistValue`):

```tsx
  const { smart, playlist } = useLocalSearchParams<{
    smart?: string
    playlist?: string
  }>()
  const smartValue = Array.isArray(smart) ? smart[0] : smart
  const playlistValue = Array.isArray(playlist) ? playlist[0] : playlist
  const lastSmartRef = useRef<string | null>(null)
  const lastPlaylistRef = useRef<string | null>(null)
  useEffect(() => {
    if (authReady && smartValue && smartValue !== lastSmartRef.current) {
      lastSmartRef.current = smartValue
      void practice.loadSmart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartValue, authReady])

  useEffect(() => {
    if (
      authReady &&
      playlistValue &&
      playlistValue !== lastPlaylistRef.current
    ) {
      lastPlaylistRef.current = playlistValue
      const pending = takePendingPlaylist()
      if (pending) {
        void practice.startPlaylist(pending.filters, pending.problem)
      } else if (!practice.problem) {
        void practice.loadRandom()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistValue, authReady])

  useEffect(() => {
    if (authReady && !practice.problem && !smartValue && !playlistValue)
      void practice.loadRandom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady])
```

1c. In the main return, add the playlist banner directly below the smart banner block (first children of the ScrollView):

```tsx
        {practice.problemSource === 'playlist' && practice.playlistFilters && (
          <PlaylistBanner
            filters={practice.playlistFilters}
            onExit={() => void practice.loadRandom()}
          />
        )}
```

1d. End-of-set replaces the content area. Wrap the existing `<ScrollView>…</ScrollView>` plus the `{isComplete ? … : …}` footer block in a conditional:

```tsx
      {practice.exhausted ? (
        <EndOfSet
          onRestart={() => void practice.restartPlaylist()}
          onRandom={() => void practice.loadRandom()}
        />
      ) : (
        <>
          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* existing children unchanged */}
          </ScrollView>

          {isComplete ? (
            <CompletionFooter
              onNext={() => void practice.loadNext()}
              onSmart={() => void practice.loadSmart()}
            />
          ) : (
            <InputBar
              disabled={practice.loading}
              placeholder={
                STAGE_PLACEHOLDER[practice.stage as ActiveStage] ??
                'Describe your approach…'
              }
              onSubmit={(text) => void practice.submit(text)}
              onHint={() =>
                void practice.submit('Give me a hint', { hint: true })
              }
              onAnswer={() =>
                void practice.submit('Give me the answer', { answer: true })
              }
            />
          )}
        </>
      )}
```

(The header row stays outside this conditional. "existing children unchanged" means: keep the SmartBanner block, the new PlaylistBanner block, ProblemView, StageBanner, ChatThread exactly as they are — only the wrapper moves.)

- [ ] **Step 2: Run the full suite + typecheck**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: all PASS, tsc clean. (index.tsx has no unit test — simulator-verified in Task 7.)

- [ ] **Step 3: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/app/index.tsx
cd /Users/aaronkim/projects/leetgame
git add mobile/src/app/index.tsx
git commit -m "feat(mobile): practice screen playlist wiring with banner and end-of-set"
```

---

### Task 6: Search screen + route + header button

**Files:**
- Create: `mobile/src/screens/search-screen.tsx`
- Create: `mobile/src/screens/search-screen.test.tsx`
- Create: `mobile/src/app/search.tsx` (thin re-export)
- Modify: `mobile/src/app/_layout.tsx` (register the route)
- Modify: `mobile/src/app/index.tsx` (add the header search button — the route now exists, so the literal typechecks)

**Interfaces:**
- Consumes: `searchProblems`/`getProblemTags` (`@/api/problems`), `useSaved` (`@/saved/use-saved`), `setPendingPlaylist` (`@/practice/pending-playlist`), `DifficultyBadge` (`@/components/difficulty-badge`), `EMPTY_FILTERS`/`PlaylistFilters`/`Problem`/`ProblemTag` (`@/types`), `useAuth`, `useTheme`, `useRouter`.
- Produces: the `/search` route; selection hands off via `setPendingPlaylist` + `router.dismissTo({ pathname: '/', params: { playlist: String(Date.now()) } })` (consumed by Task 5's effect).

- [ ] **Step 1: Write the failing tests**

Create `mobile/src/screens/search-screen.test.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { ThemeProvider } from '@/theme/theme-context'
import { takePendingPlaylist } from '@/practice/pending-playlist'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
}))

const mockAuth = { session: { access_token: 't' } as unknown }
jest.mock('@/auth/auth-context', () => ({ useAuth: () => mockAuth }))

jest.mock('@/api/problems', () => ({
  searchProblems: jest.fn(),
  getProblemTags: jest.fn(),
}))

const mockSaved = {
  savedProblems: [] as unknown[],
  savedIds: new Set<string>(),
  save: jest.fn(),
  unsave: jest.fn(),
  isSaved: (id: string) => mockSaved.savedIds.has(id),
}
jest.mock('@/saved/use-saved', () => ({ useSaved: () => mockSaved }))

import SearchScreen from './search-screen'
import { searchProblems, getProblemTags } from '@/api/problems'

const problems = [
  {
    id: 'p1', slug: 'two-sum', title: 'Two Sum', description: 'D',
    difficulty: 'Easy', topic_tags: ['Array'], leetcode_id: 1,
  },
  {
    id: 'p2', slug: 'lru', title: 'LRU Cache', description: 'D',
    difficulty: 'Hard', topic_tags: ['Design'], leetcode_id: 146,
  },
]

function renderScreen() {
  return render(
    <ThemeProvider>
      <SearchScreen />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  mockDismissTo.mockClear()
  mockAuth.session = { access_token: 't' }
  mockSaved.savedProblems = []
  mockSaved.savedIds = new Set()
  mockSaved.save.mockClear()
  mockSaved.unsave.mockClear()
  takePendingPlaylist() // drain any leftover pending value
  ;(searchProblems as jest.Mock)
    .mockReset()
    .mockResolvedValue({ problems, page: 1, page_size: 12, total: 2 })
  ;(getProblemTags as jest.Mock)
    .mockReset()
    .mockResolvedValue([
      { name: 'Array', count: 5 },
      { name: 'Graph', count: 3 },
    ])
})

test('renders results after the debounced search', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(getByTestId('search-result-p2')).toBeTruthy()
})

test('tapping a result hands off a pending playlist and dismisses home', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  fireEvent.press(getByTestId('search-result-p1'))
  expect(mockDismissTo).toHaveBeenCalledWith({
    pathname: '/',
    params: { playlist: expect.any(String) },
  })
  const pending = takePendingPlaylist()
  expect(pending?.problem?.id).toBe('p1')
  expect(pending?.filters).toEqual({
    q: '', difficulties: [], tags: [], tagMatch: 'and',
  })
})

test('difficulty filter resets to page 1 and is sent to the API', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(searchProblems).toHaveBeenCalled(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-difficulty-Easy'))
  await waitFor(
    () =>
      expect(
        (searchProblems as jest.Mock).mock.calls.at(-1)?.slice(0, 5),
      ).toEqual(['', ['Easy'], [], 'and', 1]),
    { timeout: 3000 },
  )
})

test('practice-these hands off the current filters without a problem', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-difficulty-Hard'))
  fireEvent.press(getByTestId('search-enter-playlist'))
  const pending = takePendingPlaylist()
  expect(pending?.problem).toBeUndefined()
  expect(pending?.filters.difficulties).toEqual(['Hard'])
  expect(mockDismissTo).toHaveBeenCalled()
})

test('star toggles saved state without navigating', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-save-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  fireEvent.press(getByTestId('search-save-p1'))
  expect(mockSaved.save).toHaveBeenCalledWith(problems[0])
  expect(mockDismissTo).not.toHaveBeenCalled()
})

test('saved view lists saved problems and hands off empty filters', async () => {
  mockSaved.savedProblems = [problems[1]]
  mockSaved.savedIds = new Set(['p2'])
  const { getByTestId, queryByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-saved-toggle')).toBeTruthy())
  await fireEvent.press(getByTestId('search-saved-toggle'))
  await waitFor(() => expect(getByTestId('search-result-p2')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(queryByTestId('search-enter-playlist')).toBeNull()
  fireEvent.press(getByTestId('search-result-p2'))
  const pending = takePendingPlaylist()
  expect(pending?.problem?.id).toBe('p2')
  expect(pending?.filters).toEqual({
    q: '', difficulties: [], tags: [], tagMatch: 'and',
  })
})

test('anonymous users see no stars and no saved toggle', async () => {
  mockAuth.session = null
  const { getByTestId, queryByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-result-p1')).toBeTruthy(), {
    timeout: 3000,
  })
  expect(queryByTestId('search-saved-toggle')).toBeNull()
  expect(queryByTestId('search-save-p1')).toBeNull()
})

test('pagination requests the next page', async () => {
  ;(searchProblems as jest.Mock).mockResolvedValue({
    problems, page: 1, page_size: 12, total: 30,
  })
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-next')).toBeTruthy(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-next'))
  await waitFor(
    () =>
      expect((searchProblems as jest.Mock).mock.calls.at(-1)?.[4]).toBe(2),
    { timeout: 3000 },
  )
})

test('search failure shows the error state', async () => {
  ;(searchProblems as jest.Mock).mockRejectedValue(new Error('boom'))
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-error')).toBeTruthy(), {
    timeout: 3000,
  })
})

test('adding a tag from the options sends it to the API', async () => {
  const { getByTestId } = await renderScreen()
  await waitFor(() => expect(getByTestId('search-tag-option-Array')).toBeTruthy(), {
    timeout: 3000,
  })
  await fireEvent.press(getByTestId('search-tag-option-Array'))
  await waitFor(
    () =>
      expect(
        (searchProblems as jest.Mock).mock.calls.at(-1)?.slice(2, 4),
      ).toEqual([['Array'], 'and']),
    { timeout: 3000 },
  )
  expect(getByTestId('search-tag-selected-Array')).toBeTruthy()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd mobile && npx jest src/screens/search-screen`
Expected: FAIL — `./search-screen` module does not exist.

- [ ] **Step 3: Create `mobile/src/screens/search-screen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '@/auth/auth-context'
import { useTheme } from '@/theme/theme-context'
import { getProblemTags, searchProblems } from '@/api/problems'
import { useSaved } from '@/saved/use-saved'
import { setPendingPlaylist } from '@/practice/pending-playlist'
import { DifficultyBadge } from '@/components/difficulty-badge'
import {
  EMPTY_FILTERS,
  type PlaylistFilters,
  type Problem,
  type ProblemTag,
} from '@/types'

const SEARCH_PAGE_SIZE = 12
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const
const DIFFICULTY_KEY = { Easy: 'easy', Medium: 'medium', Hard: 'hard' } as const

export default function SearchScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session } = useAuth()
  const { savedProblems, savedIds, save, unsave } = useSaved(session)

  const [q, setQ] = useState('')
  const [difficulties, setDifficulties] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [tagMatch, setTagMatch] = useState<'and' | 'or'>('and')
  const [page, setPage] = useState(1)
  const [results, setResults] = useState<Problem[]>([])
  const [total, setTotal] = useState(0)
  const [hasSearched, setHasSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tagQuery, setTagQuery] = useState('')
  const [showSaved, setShowSaved] = useState(false)
  const [allTags, setAllTags] = useState<ProblemTag[]>([])

  useEffect(() => {
    getProblemTags()
      .then(setAllTags)
      .catch(() => {})
  }, [])

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => {
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError(null)
      try {
        const res = await searchProblems(
          q,
          difficulties,
          tags,
          tagMatch,
          page,
          SEARCH_PAGE_SIZE,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setResults(res.problems)
        setTotal(res.total)
        setHasSearched(true)
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        if (!controller.signal.aborted) setError('Search failed.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, difficulties.join(','), tags.join(','), tagMatch, page])

  const startPractice = (problem?: Problem, filters?: PlaylistFilters) => {
    setPendingPlaylist({
      filters: filters ?? { q, difficulties, tags, tagMatch },
      problem,
    })
    router.dismissTo({
      pathname: '/',
      params: { playlist: String(Date.now()) },
    })
  }

  const setQuery = (v: string) => {
    setQ(v)
    setPage(1)
  }
  const toggleDifficulty = (d: string) => {
    setDifficulties((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    )
    setPage(1)
  }
  const clearDifficulties = () => {
    setDifficulties([])
    setPage(1)
  }
  const addTag = (name: string) => {
    if (!tags.includes(name)) setTags([...tags, name])
    setTagQuery('')
    setPage(1)
  }
  const removeTag = (name: string) => {
    setTags(tags.filter((t) => t !== name))
    setPage(1)
  }
  const changeTagMatch = (v: 'and' | 'or') => {
    setTagMatch(v)
    setPage(1)
  }

  const filteredTags = allTags
    .filter(
      (tag) =>
        !tags.includes(tag.name) &&
        tag.name.toLowerCase().includes(tagQuery.toLowerCase()),
    )
    .slice(0, 12)
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  const showingFrom = total === 0 ? 0 : (page - 1) * SEARCH_PAGE_SIZE + 1
  const showingTo = Math.min(page * SEARCH_PAGE_SIZE, total)
  const listed = showSaved ? savedProblems : results

  const chipStyle = (active: boolean, activeColor?: string) => ({
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderColor: active ? (activeColor ?? theme.foreground) : theme.border,
    backgroundColor:
      active && !activeColor ? theme.foreground : 'transparent',
  })
  const chipText = (active: boolean, activeColor?: string) => ({
    fontSize: 13,
    fontWeight: '500' as const,
    color: active
      ? (activeColor ?? theme.background)
      : theme.mutedForeground,
  })

  return (
    <ScrollView
      testID="search-screen"
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <TextInput
        testID="search-query"
        value={q}
        onChangeText={setQuery}
        placeholder="Search by title..."
        placeholderTextColor={theme.mutedForeground}
        style={{
          color: theme.foreground,
          backgroundColor: theme.secondary,
          borderRadius: 10,
          padding: 10,
          fontSize: 14,
        }}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          testID="search-difficulty-all"
          accessibilityRole="button"
          onPress={clearDifficulties}
          style={chipStyle(difficulties.length === 0)}
        >
          <Text style={chipText(difficulties.length === 0)}>All</Text>
        </Pressable>
        {DIFFICULTIES.map((d) => {
          const active = difficulties.includes(d)
          const color = theme[DIFFICULTY_KEY[d]]
          return (
            <Pressable
              key={d}
              testID={`search-difficulty-${d}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => toggleDifficulty(d)}
              style={chipStyle(active, color)}
            >
              <Text style={chipText(active, color)}>{d}</Text>
            </Pressable>
          )
        })}
      </View>

      {session !== null && (
        <View style={{ flexDirection: 'row' }}>
          <Pressable
            testID="search-saved-toggle"
            accessibilityRole="button"
            accessibilityState={{ selected: showSaved }}
            onPress={() => setShowSaved((s) => !s)}
            style={chipStyle(showSaved)}
          >
            <Text style={chipText(showSaved)}>★ Saved</Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text
          style={{ color: theme.foreground, fontSize: 14, fontWeight: '500' }}
        >
          Tags
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            testID="search-tag-match-and"
            accessibilityRole="button"
            onPress={() => changeTagMatch('and')}
            style={chipStyle(tagMatch === 'and')}
          >
            <Text style={chipText(tagMatch === 'and')}>Match all</Text>
          </Pressable>
          <Pressable
            testID="search-tag-match-or"
            accessibilityRole="button"
            onPress={() => changeTagMatch('or')}
            style={chipStyle(tagMatch === 'or')}
          >
            <Text style={chipText(tagMatch === 'or')}>Match any</Text>
          </Pressable>
        </View>
        <TextInput
          testID="search-tag-query"
          value={tagQuery}
          onChangeText={setTagQuery}
          placeholder="Search available tags..."
          placeholderTextColor={theme.mutedForeground}
          style={{
            color: theme.foreground,
            backgroundColor: theme.secondary,
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
          }}
        />
        {tags.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                testID={`search-tag-selected-${tag}`}
                accessibilityLabel={`Remove ${tag}`}
                accessibilityRole="button"
                onPress={() => removeTag(tag)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.secondary,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: theme.foreground, fontSize: 12 }}>
                  {tag}
                </Text>
                <Text
                  style={{ color: theme.mutedForeground, fontSize: 12 }}
                >
                  ×
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.muted,
            borderRadius: 8,
            padding: 8,
          }}
        >
          {filteredTags.length === 0 ? (
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
              No matching tags.
            </Text>
          ) : (
            filteredTags.map((tag) => (
              <Pressable
                key={tag.name}
                testID={`search-tag-option-${tag.name}`}
                accessibilityRole="button"
                onPress={() => addTag(tag.name)}
                style={{
                  flexDirection: 'row',
                  gap: 5,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: theme.foreground, fontSize: 13 }}>
                  {tag.name}
                </Text>
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
                  {tag.count}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </View>

      {!showSaved && (
        <Pressable
          testID="search-enter-playlist"
          accessibilityRole="button"
          onPress={() => startPractice()}
          style={{
            backgroundColor: theme.primary,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
            Practice these
            {hasSearched && total > 0
              ? ` · ${total} problem${total !== 1 ? 's' : ''}`
              : ''}
          </Text>
        </Pressable>
      )}

      {showSaved && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {savedProblems.length} saved problem
          {savedProblems.length !== 1 ? 's' : ''}
        </Text>
      )}
      {!showSaved && error && (
        <Text
          testID="search-error"
          style={{ color: theme.destructive, fontSize: 13 }}
        >
          {error}
        </Text>
      )}
      {!showSaved && !error && hasSearched && total > 0 && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          {loading
            ? 'Searching...'
            : `Showing ${showingFrom}-${showingTo} of ${total} · Page ${page} of ${totalPages}`}
        </Text>
      )}
      {!showSaved && loading && !hasSearched && (
        <ActivityIndicator testID="search-loading" color={theme.primary} />
      )}
      {!showSaved && !loading && !error && hasSearched && total === 0 && (
        <Text
          testID="search-empty"
          style={{ color: theme.mutedForeground, fontSize: 13 }}
        >
          No problems found.
          {difficulties.length > 0 || tags.length > 0
            ? ' Try clearing your filters.'
            : ''}
        </Text>
      )}
      {showSaved && savedProblems.length === 0 && (
        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
          No saved problems yet.
        </Text>
      )}

      {(showSaved || (!loading && !error)) &&
        listed.map((p) => (
          <Pressable
            key={p.id}
            testID={`search-result-${p.id}`}
            accessibilityRole="button"
            onPress={() =>
              startPractice(p, showSaved ? EMPTY_FILTERS : undefined)
            }
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.muted,
              borderRadius: 8,
              padding: 14,
              gap: 8,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              {p.leetcode_id != null && (
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
                  #{p.leetcode_id}
                </Text>
              )}
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: theme.foreground,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {p.title}
              </Text>
              <DifficultyBadge difficulty={p.difficulty} />
              {session !== null && (
                <Pressable
                  testID={`search-save-${p.id}`}
                  accessibilityLabel={
                    savedIds.has(p.id) ? 'Remove bookmark' : 'Save for later'
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() =>
                    savedIds.has(p.id) ? void unsave(p.id) : void save(p)
                  }
                >
                  <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>
                    {savedIds.has(p.id) ? '★' : '☆'}
                  </Text>
                </Pressable>
              )}
            </View>
            {p.topic_tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {p.topic_tags.map((tag) => (
                  <Text
                    key={tag}
                    style={{
                      color: theme.mutedForeground,
                      fontSize: 11,
                      backgroundColor: theme.secondary,
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            )}
          </Pressable>
        ))}

      {!showSaved && !error && totalPages > 1 && (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          <Pressable
            testID="search-prev"
            accessibilityRole="button"
            disabled={page === 1}
            onPress={() => setPage(Math.max(1, page - 1))}
            style={{
              ...chipStyle(false),
              opacity: page === 1 ? 0.5 : 1,
            }}
          >
            <Text style={chipText(false)}>Previous</Text>
          </Pressable>
          <Pressable
            testID="search-next"
            accessibilityRole="button"
            disabled={page === totalPages}
            onPress={() => setPage(Math.min(totalPages, page + 1))}
            style={{
              ...chipStyle(false),
              opacity: page === totalPages ? 0.5 : 1,
            }}
          >
            <Text style={chipText(false)}>Next</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  )
}
```

- [ ] **Step 4: Create the route and register it**

Create `mobile/src/app/search.tsx`:

```tsx
export { default } from '@/screens/search-screen'
```

In `mobile/src/app/_layout.tsx`, add after the `stats` screen line:

```tsx
      <Stack.Screen name="search" options={{ title: 'Search' }} />
```

- [ ] **Step 5: Add the header search button**

In `mobile/src/app/index.tsx`, add immediately BEFORE the stats `<Link>` in the header row:

```tsx
        <Link href="/search" asChild>
          <Pressable
            testID="search-button"
            accessibilityLabel="Search"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 18 }}>🔍</Text>
          </Pressable>
        </Link>
```

- [ ] **Step 6: Run the tests, full suite, and typecheck**

Run: `cd mobile && npx jest src/screens/search-screen && npx jest && npx tsc --noEmit`
Expected: all PASS, tsc clean (the `/search` literal typechecks because the route file exists).

- [ ] **Step 7: Commit**

```bash
cd /Users/aaronkim/projects/leetgame/mobile
npx prettier --write src/screens/search-screen.tsx src/screens/search-screen.test.tsx src/app/search.tsx src/app/_layout.tsx src/app/index.tsx
cd /Users/aaronkim/projects/leetgame
git add mobile/src/screens/search-screen.tsx mobile/src/screens/search-screen.test.tsx mobile/src/app/search.tsx mobile/src/app/_layout.tsx mobile/src/app/index.tsx
git commit -m "feat(mobile): search screen with filters, saved view, and playlist entry"
```

---

### Task 7: E2E verification on the iOS simulator (main session — NOT a subagent)

**Files:** none (verification only; append results to this plan).

Executed by the controller in the main session using the `rn-agentic-loop` skill (one simulator; app-driving is serial). Metro: `npx expo start` in `mobile/`, then `xcrun simctl openurl booted "exp://127.0.0.1:8081"`. Dev sign-in credentials in `frontend/.env.local`. Declare each receipt BEFORE acting; runtime state, never screenshots alone.

- [ ] **Freshness:** `search-button` (new in this branch) mounted in the fiber tree.
- [ ] **Search:** tap `search-button` → route `/search`; typing in `search-query` fires ONE debounced `GET /api/problems?q=…` (network receipt; observer double-logs each request); difficulty/tag filters appear in the query string; pagination fires `page=2`.
- [ ] **Selection → playlist:** tapping a result lands on Practice with THAT problem (fiber receipt: problem title/slug in session state — no network fetch for the problem itself), `playlist-banner` mounted with the filter summary, route params carry a `playlist` nonce.
- [ ] **Next-in-playlist:** complete or skip to next (completion footer "Next Problem") → `GET /api/problems/random?…&exclude_id=<current>` fires with the playlist filters.
- [ ] **End of set:** filter down to a 1-problem set (narrow q), enter it, next → NO error, `end-of-set` mounts; `end-of-set-restart` re-fetches without `exclude_id` and stays in playlist; `end-of-set-random` → unfiltered `GET /api/problems/random` + banner unmounts.
- [ ] **Saved round-trip:** star a problem → `POST /api/saved/<id>` (server receipt: curl `GET /api/saved` with dev token shows it); appears in the Saved view; tapping it practices it with the "Playlist" (empty-filters) banner; unstar → `DELETE` + gone from server. Restore the account's saved list to its pre-test state.
- [ ] **Anonymous:** sign out → search + playlist still work; no stars, no Saved toggle in the fiber tree; no `/api/saved` requests fire.
- [ ] Append verification results to this plan file and commit.

---

## Execution notes

- Task order matters: 1 → 2 → 3 → 4 → 5 → 6 → 7. Task 5 must NOT reference `/search` (route arrives in Task 6). Task 6 adds the header button together with the route file.
- Tasks 1–6 are subagent-friendly; Task 7 is app-driving and runs serially in the main session.
- The search-screen tests use real timers with generous `waitFor` timeouts around the 300 ms debounce; if they flake, prefer raising the timeout over switching to fake timers (fake timers fight RNTL's internal async handling).
