# Back Button Playlist Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix back navigation so it is always scoped to the current playlist context — random mode, search playlist, or smart practice — and cannot cross context boundaries.

**Architecture:** Extract the session stack into a generic `useSessionStack<T>` hook that exposes `push`, `pop`, `clear`, and `canGoBack`. App.tsx uses this hook: context-entry functions (`loadRandomProblem`, `enterPlaylistFromSearch`, `selectProblem`, smart practice first load) call `clear()` after a successful load; within-context navigation calls `push(captureSnapshot())` before updating state, only on success. `goBack` calls `pop()`. The old `playlistEntryDepthRef` and `pushSnapshot` are removed entirely.

**Tech Stack:** React 19, TypeScript 6, Vitest, @testing-library/react, jsdom

---

### Task 1: Install and configure Vitest

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/user-event jsdom
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add test script to package.json**

Open `frontend/package.json` and add `"test": "vitest run"` to `scripts`:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Configure Vitest in vite.config.ts**

Replace the entire file with:

```ts
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:42069",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 4: Verify setup with a trivial test**

Create `frontend/src/hooks/useSessionStack.test.ts` with just:

```ts
import { describe, it, expect } from 'vitest'

describe('setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `cd frontend && npm test`

Expected output: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/src/hooks/useSessionStack.test.ts frontend/package-lock.json
git commit -m "chore: add vitest and @testing-library/react for frontend unit tests"
```

---

### Task 2: TDD — `useSessionStack` hook

**Files:**
- Modify: `frontend/src/hooks/useSessionStack.test.ts` (replace placeholder)
- Create: `frontend/src/hooks/useSessionStack.ts`

- [ ] **Step 1: Write the full test suite (replace placeholder)**

Replace `frontend/src/hooks/useSessionStack.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionStack } from './useSessionStack'

describe('useSessionStack', () => {
  it('initial state: empty stack, canGoBack false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('push: adds item, canGoBack becomes true', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => { result.current.push('a') })
    expect(result.current.stack).toEqual(['a'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('push multiple: stack grows in FIFO order', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
      result.current.push('c')
    })
    expect(result.current.stack).toEqual(['a', 'b', 'c'])
  })

  it('pop on empty: returns undefined, stack stays empty, canGoBack stays false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    let popped: string | undefined
    act(() => { popped = result.current.pop() })
    expect(popped).toBeUndefined()
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('pop: returns top item and removes it', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    let popped: string | undefined
    act(() => { popped = result.current.pop() })
    expect(popped).toBe('b')
    expect(result.current.stack).toEqual(['a'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('pop until empty: canGoBack becomes false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => { result.current.push('a') })
    act(() => { result.current.pop() })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('clear: empties the stack, canGoBack becomes false', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    act(() => { result.current.clear() })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('clear on empty stack: no-op', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => { result.current.clear() })
    expect(result.current.stack).toEqual([])
    expect(result.current.canGoBack).toBe(false)
  })

  it('push after clear: stack has only the new item', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('a')
      result.current.push('b')
    })
    act(() => { result.current.clear() })
    act(() => { result.current.push('c') })
    expect(result.current.stack).toEqual(['c'])
    expect(result.current.canGoBack).toBe(true)
  })

  it('pop returns items in LIFO order', () => {
    const { result } = renderHook(() => useSessionStack<string>())
    act(() => {
      result.current.push('first')
      result.current.push('second')
      result.current.push('third')
    })
    const results: (string | undefined)[] = []
    act(() => { results.push(result.current.pop()) })
    act(() => { results.push(result.current.pop()) })
    act(() => { results.push(result.current.pop()) })
    expect(results).toEqual(['third', 'second', 'first'])
    expect(result.current.canGoBack).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd frontend && npm test
```

Expected: `Cannot find module './useSessionStack'`

- [ ] **Step 3: Implement `useSessionStack`**

Create `frontend/src/hooks/useSessionStack.ts`:

```ts
import { useState } from 'react'

export interface SessionStack<T> {
  stack: T[]
  canGoBack: boolean
  push: (item: T) => void
  pop: () => T | undefined
  clear: () => void
}

export function useSessionStack<T>(): SessionStack<T> {
  const [stack, setStack] = useState<T[]>([])

  const push = (item: T) => setStack(s => [...s, item])

  const pop = (): T | undefined => {
    if (stack.length === 0) return undefined
    const top = stack[stack.length - 1]
    setStack(s => s.slice(0, -1))
    return top
  }

  const clear = () => setStack([])

  return { stack, canGoBack: stack.length > 0, push, pop, clear }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd frontend && npm test
```

Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSessionStack.ts frontend/src/hooks/useSessionStack.test.ts
git commit -m "feat: add useSessionStack hook with full test coverage"
```

---

### Task 3: Update App.tsx — wire hook, fix all navigation logic

**Files:**
- Modify: `frontend/src/App.tsx` (lines 23-30, 82, 88-117, 132-240, 258-306, 331-364, 409-439)

This task touches many parts of App.tsx. Each step is a targeted change. Read the file before starting.

**Background:** The current approach pushes a snapshot before every async load and uses `playlistEntryDepthRef` to track where a playlist started. Both are replaced: the hook is used directly, context-entry functions call `clear()`, within-context navigation calls `push(captureSnapshot())` only on success.

- [ ] **Step 1: Add `stageBannerDismissed` to `PracticeSnapshot` (line 23)**

Find and replace the `PracticeSnapshot` interface at the top of App.tsx:

```ts
interface PracticeSnapshot {
  problem: Problem
  stage: Stage
  history: ChatMessage[]
  searchPlaylist: SearchPlaylist | null
  problemSource: ProblemSource
  shuffle: boolean
  stageBannerDismissed: boolean
}
```

- [ ] **Step 2: Replace stack state and ref with hook**

Find the two lines:
```ts
const [sessionStack, setSessionStack] = useState<PracticeSnapshot[]>([])
```
and
```ts
const playlistEntryDepthRef = useRef<number>(0)
```

Replace them with:
```ts
const { stack: sessionStack, canGoBack, push: pushToStack, pop: popFromStack, clear: clearStack } = useSessionStack<PracticeSnapshot>()
```

Add the import at the top of the file:
```ts
import { useSessionStack } from './hooks/useSessionStack'
```

Also remove `useRef` from the React import if it's no longer used elsewhere (check — `streamAbortRef` still uses it, so keep `useRef`).

- [ ] **Step 3: Add `captureSnapshot` helper and update `goBack`**

Delete the old `pushSnapshot` function entirely:
```ts
// DELETE THIS ENTIRE FUNCTION:
const pushSnapshot = () => {
  if (!problem) return
  setSessionStack(s => [...s, { problem, stage, history, searchPlaylist, problemSource, shuffle }])
}
```

Replace `goBack` with:
```ts
const captureSnapshot = (): PracticeSnapshot | null => {
  if (!problem) return null
  return { problem, stage, history, searchPlaylist, problemSource, shuffle, stageBannerDismissed }
}

const goBack = () => {
  const snap = popFromStack()
  if (!snap) return
  setProblem(snap.problem)
  setStage(snap.stage)
  setHistory(snap.history)
  setSearchPlaylist(snap.searchPlaylist)
  setProblemSource(snap.problemSource)
  setShuffle(snap.shuffle)
  setStageBannerDismissed(snap.stageBannerDismissed)
  setPlaylistExhausted(false)
  setError(null)
  setStreamingMessage('')
}
```

- [ ] **Step 4: Update `loadRandomProblem` — context entry, clears stack**

Replace the entire `loadRandomProblem` function:

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
  } catch {
    setError('Failed to load problem. Is the backend running?')
  }
}
```

- [ ] **Step 5: Update `loadNextSearchProblem` — push after success**

Replace the entire `loadNextSearchProblem` function:

```ts
const loadNextSearchProblem = async () => {
  if (!searchPlaylist) {
    await loadRandomProblem()
    return
  }

  const nextIndex = searchPlaylist.selectedIndex + 1
  if (nextIndex < searchPlaylist.results.length) {
    const snap = captureSnapshot()
    if (snap) pushToStack(snap)
    setProblem(searchPlaylist.results[nextIndex])
    setSearchPlaylist({ ...searchPlaylist, selectedIndex: nextIndex })
    resetPracticeState()
    setPlaylistExhausted(false)
    setError(null)
    return
  }

  const nextPage = searchPlaylist.page + 1
  const snap = captureSnapshot()
  try {
    setError(null)
    const res = await searchProblems(
      searchPlaylist.q,
      searchPlaylist.difficulties,
      searchPlaylist.tags,
      searchPlaylist.tagMatch,
      nextPage,
      searchPlaylist.pageSize,
    )

    if (res.problems.length === 0) {
      setPlaylistExhausted(true)
      setError(null)
      return
    }

    if (snap) pushToStack(snap)
    setProblem(res.problems[0])
    setSearchPlaylist({
      ...searchPlaylist,
      page: res.page,
      pageSize: res.page_size,
      results: res.problems,
      selectedIndex: 0,
    })
    resetPracticeState()
    setPlaylistExhausted(false)
  } catch {
    setError('Failed to load the next filtered problem. Is the backend running?')
  }
}
```

- [ ] **Step 6: Update `loadNextProblem` — handle random mode inline**

Replace the entire `loadNextProblem` function:

```ts
const loadNextProblem = async () => {
  if (problemSource === 'search') {
    if (shuffle) {
      await loadRandomNextProblem()
    } else {
      await loadNextSearchProblem()
    }
    return
  }
  if (problemSource === 'smart') {
    await loadSmartPracticeProblem()
    return
  }
  // random mode: push current state, then load next
  const snap = captureSnapshot()
  try {
    setError(null)
    setPlaylistExhausted(false)
    const p = await getRandomProblem()
    if (snap) pushToStack(snap)
    setProblem(p)
    setProblemSource('random')
    setSearchPlaylist(null)
    resetPracticeState()
  } catch {
    setError('Failed to load problem. Is the backend running?')
  }
}
```

- [ ] **Step 7: Update `loadRandomNextProblem` — push after success, remove fallback**

Replace the entire `loadRandomNextProblem` function:

```ts
const loadRandomNextProblem = async () => {
  if (!searchPlaylist) return
  const snap = captureSnapshot()
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
  } catch {
    setError('Failed to load a random filtered problem. Is the backend running?')
  }
}
```

- [ ] **Step 8: Update `loadSmartPracticeProblem` — clear on entry, push within**

Replace the entire `loadSmartPracticeProblem` function:

```ts
const loadSmartPracticeProblem = async () => {
  const isNextInSmartMode = problemSource === 'smart'
  const snap = captureSnapshot()
  try {
    setError(null)
    setPlaylistExhausted(false)
    const p = await getSmartPracticeProblem(activeStages, activeTopics)
    if (isNextInSmartMode && snap) {
      pushToStack(snap)
    } else {
      clearStack()
    }
    setProblem(p)
    setProblemSource('smart')
    setSearchPlaylist(null)
    resetPracticeState()
  } catch {
    setError('Failed to load smart practice problem. Is the backend running?')
  }
}
```

- [ ] **Step 9: Update `enterPlaylistFromSearch` — clear on entry, remove depth ref**

Replace the entire `enterPlaylistFromSearch` function:

```ts
const enterPlaylistFromSearch = async () => {
  const { q, difficulties, tags, tagMatch } = searchState
  try {
    setError(null)
    setPlaylistExhausted(false)
    setShuffle(true)
    const p = await getRandomProblemFiltered(q, difficulties, tags, tagMatch)
    clearStack()
    setProblem(p)
    setProblemSource('search')
    setSearchPlaylist({
      q,
      difficulties,
      tags,
      tagMatch,
      page: 0,
      pageSize: SEARCH_PAGE_SIZE,
      results: [],
      selectedIndex: -1,
    })
    resetPracticeState()
    setView('practice')
  } catch {
    setError('Failed to load a problem with those filters. Is the backend running?')
  }
}
```

- [ ] **Step 10: Update `selectProblem` — clear on entry, remove depth ref**

Replace the entire `selectProblem` function:

```ts
const selectProblem = (p: Problem, context: SearchSelectionContext) => {
  clearStack()
  setShuffle(false)
  setProblem(p)
  setProblemSource('search')
  setPlaylistExhausted(false)
  setSearchPlaylist({
    q: context.q,
    difficulties: context.difficulties,
    tags: context.tags,
    tagMatch: context.tagMatch,
    page: context.page,
    pageSize: context.pageSize,
    results: context.results,
    selectedIndex: context.selectedIndex,
  })
  resetPracticeState()
  setError(null)
  setView('practice')
}
```

- [ ] **Step 11: Update `restartSearchSet` — clear stack, no push**

Replace the entire `restartSearchSet` function:

```ts
const restartSearchSet = async () => {
  if (!searchPlaylist) return

  try {
    setError(null)
    const res = await searchProblems(
      searchPlaylist.q,
      searchPlaylist.difficulties,
      searchPlaylist.tags,
      searchPlaylist.tagMatch,
      1,
      searchPlaylist.pageSize,
    )

    if (res.problems.length === 0) {
      setError('No problems match the current practice set.')
      return
    }

    clearStack()
    setProblem(res.problems[0])
    setSearchPlaylist({
      ...searchPlaylist,
      page: 1,
      pageSize: res.page_size,
      results: res.problems,
      selectedIndex: 0,
    })
    setPlaylistExhausted(false)
    resetPracticeState()
  } catch {
    setError('Failed to restart the practice set. Is the backend running?')
  }
}
```

- [ ] **Step 12: Update `exitPlaylist` and `exitSmartPractice` — remove manual stack clears**

Find `exitSmartPractice` and `exitPlaylist` inside `practiceView()`:

Replace:
```ts
const exitSmartPractice = () => {
  setSessionStack([])
  void loadRandomProblem()
}
```
with:
```ts
const exitSmartPractice = () => {
  void loadRandomProblem()
}
```

Replace:
```ts
const exitPlaylist = () => {
  playlistEntryDepthRef.current = 0
  setSessionStack([])
  void loadRandomProblem()
}
```
with:
```ts
const exitPlaylist = () => {
  void loadRandomProblem()
}
```

- [ ] **Step 13: Remove the old `canGoBack` calculation**

Find the line:
```ts
const canGoBack = problemSource === 'search'
  ? sessionStack.length > playlistEntryDepthRef.current
  : sessionStack.length > 0
```

Delete it. `canGoBack` is now provided directly by the `useSessionStack` hook (already destructured in Step 2).

- [ ] **Step 14: Verify the build passes**

```bash
cd frontend && npm run build
```

Expected: clean build with no TypeScript errors.

- [ ] **Step 15: Run all tests**

```bash
cd frontend && npm test
```

Expected: `10 passed`

- [ ] **Step 16: Commit**

```bash
git add frontend/src/App.tsx frontend/src/hooks/useSessionStack.ts frontend/src/hooks/useSessionStack.test.ts
git commit -m "fix: scope back button to current playlist context

Replace playlistEntryDepthRef depth-fence with a clear-on-entry approach.
Context-entry functions (random, search playlist, smart practice first load)
clear the stack after a successful load. Within-context navigation pushes
only on success. Back is always scoped to the current session.

Also adds stageBannerDismissed to PracticeSnapshot so goBack fully restores
session state, and extracts stack logic into useSessionStack hook."
```
