# Shuffle Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing "Next" / "Random Problem" split with a Spotify-style shuffle toggle and a "Random" mode chip so users always know what "Next →" will do.

**Architecture:** Add a `shuffle` boolean to `App.tsx` that is set automatically on playlist entry (`enterPlaylistFromSearch` → true, `selectProblem` → false) and is togglable by the user. `loadNextProblem` routes through `loadRandomNextProblem` or `loadNextSearchProblem` based on `shuffle`. A `Shuffle` lucide icon in `ProblemView` (only in playlist mode) shows the current state. A "Random" mode chip in `ProblemView` shows when in pure random mode. The separate `onRandom` prop is removed from `ChatView` and `CompleteView`.

**Tech Stack:** React, TypeScript, lucide-react (already installed), Tailwind CSS

---

### Task 1: Add shuffle state to App.tsx

**Context:** `frontend/src/App.tsx` manages all problem-loading logic. Currently `loadNextProblem` always calls `loadNextSearchProblem` for search-source problems (sequential). We're adding `shuffle` state and making `loadNextProblem` shuffle-aware. We're also removing the `onRandom` prop from both `ChatView` and `ProblemView` call sites since the shuffle toggle replaces it.

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add shuffle state**

After line 76 (`const [playlistExhausted, setPlaylistExhausted] = useState(false)`), add:

```tsx
const [shuffle, setShuffle] = useState(false)
```

- [ ] **Step 2: Set shuffle=true in enterPlaylistFromSearch**

Find `enterPlaylistFromSearch`. After `setPlaylistExhausted(false)`, add `setShuffle(true)`:

```tsx
const enterPlaylistFromSearch = async () => {
  const { q, difficulty, tags, tagMatch } = searchState
  try {
    pushSnapshot()
    setError(null)
    setPlaylistExhausted(false)
    setShuffle(true)
    playlistEntryDepthRef.current = sessionStack.length + (problem ? 1 : 0)
    const p = await getRandomProblemFiltered(q, difficulty, tags, tagMatch)
    setProblem(p)
    setProblemSource('search')
    setSearchPlaylist({
      q,
      difficulty,
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

- [ ] **Step 3: Set shuffle=false in selectProblem**

Find `selectProblem`. After `playlistEntryDepthRef.current = ...`, add `setShuffle(false)`:

```tsx
const selectProblem = (p: Problem, context: SearchSelectionContext) => {
  pushSnapshot()
  playlistEntryDepthRef.current = sessionStack.length + (problem ? 1 : 0)
  setShuffle(false)
  setProblem(p)
  setProblemSource('search')
  setPlaylistExhausted(false)
  setSearchPlaylist({
    q: context.q,
    difficulty: context.difficulty,
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

- [ ] **Step 4: Make loadNextProblem shuffle-aware**

Replace the existing `loadNextProblem` function:

```tsx
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
  await loadRandomProblem()
}
```

- [ ] **Step 5: Update ProblemView call site — add shuffle props, remove onRandom from overflow**

Find the `<ProblemView` JSX block in `practiceView()`. Add `shuffle` and `onToggleShuffle` props, and remove the `onRandom` prop (it was never passed to ProblemView directly — `onRandom` only lives in the overflow menu which we're removing in Task 2, so no prop change needed here). Add the two new props:

```tsx
<ProblemView
  key={problem.id}
  problem={problem}
  onSkip={() => void loadNextProblem()}
  onBack={canGoBack ? goBack : undefined}
  onExitPlaylist={problemSource === 'search' ? exitPlaylist : problemSource === 'smart' ? exitSmartPractice : undefined}
  smartMode={problemSource === 'smart'}
  playlistSummary={problemSource === 'search' ? getPlaylistSummary(searchPlaylist) : null}
  hideTitle={hideTitle}
  isSaved={isSaved(problem.id)}
  onToggleSave={session ? () => { if (isSaved(problem.id)) { void unsave(problem.id) } else { void save(problem) } } : undefined}
  onSmartPractice={session ? () => void loadSmartPracticeProblem() : undefined}
  shuffle={problemSource === 'search' ? shuffle : undefined}
  onToggleShuffle={problemSource === 'search' ? () => setShuffle(s => !s) : undefined}
/>
```

- [ ] **Step 6: Update ChatView call site — remove onRandom**

Find the `<ChatView` JSX block. Remove the `onRandom` line:

```tsx
<ChatView
  history={history}
  stage={stage}
  sessionActiveStages={sessionActiveStages}
  loading={loading}
  error={error}
  onSubmit={handleSubmit}
  streamingMessage={streamingMessage}
  onNext={stage === 'complete' ? () => void loadNextProblem() : undefined}
  onSmartPractice={stage === 'complete' && !!session ? () => void loadSmartPracticeProblem() : undefined}
  onBack={stage === 'complete' && canGoBack ? goBack : undefined}
  onHint={stage !== 'complete' ? () => void handleSubmit('Give me a hint', true, false) : undefined}
  onAnswer={stage !== 'complete' ? () => void handleSubmit('Give me the answer', false, true) : undefined}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors about `onRandom` referenced in `ChatView` and `CompleteView` (since App.tsx no longer passes it but the components still declare it) — that's fine, we fix those in Task 2. If there are other unexpected errors, fix them before continuing.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add shuffle state and shuffle-aware loadNextProblem"
```

---

### Task 2: Update ProblemView, CompleteView, and ChatView

**Context:** Three component changes:
1. `ProblemView` — add shuffle icon toggle next to "Next →", add "Random" mode chip, remove "Random problem" overflow item
2. `CompleteView` — remove `onRandom` prop and button
3. `ChatView` — remove `onRandom` prop and button

After this task, the codebase compiles cleanly and the full feature works end-to-end.

**Files:**
- Modify: `frontend/src/components/ProblemView.tsx`
- Modify: `frontend/src/components/CompleteView.tsx`
- Modify: `frontend/src/components/ChatView.tsx`

- [ ] **Step 1: Update ProblemView props interface**

At the top of `ProblemView.tsx`, add the `Shuffle` icon import from lucide-react alongside any existing lucide imports. If there are no lucide imports yet, add a new import line:

```tsx
import { Shuffle } from 'lucide-react'
```

Update the props interface (the `{` block after `export function ProblemView(`). Remove `onRandom` (it was never in ProblemView's interface — double-check). Add `shuffle` and `onToggleShuffle`:

```tsx
export function ProblemView({
  problem,
  onSkip,
  onBack,
  onExitPlaylist,
  onSmartPractice,
  smartMode = false,
  playlistSummary,
  hideTitle = true,
  isSaved = false,
  onToggleSave,
  shuffle,
  onToggleShuffle,
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
})
```

- [ ] **Step 2: Update hasOverflow — remove onRandom**

Find the line:
```tsx
const hasOverflow = !!(onRandom || onExitPlaylist || onSmartPractice)
```

Replace with:
```tsx
const hasOverflow = !!(onExitPlaylist || onSmartPractice)
```

- [ ] **Step 3: Add "Random" mode chip**

Find the mode chip block:
```tsx
{smartMode ? (
  ...
) : playlistSummary ? (
  ...
) : (
  <div className="mb-3">
    <span className={cn("text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-muted-foreground')}>
      {problem.difficulty}
    </span>
  </div>
)}
```

Replace the final `else` branch to add a "Random" chip when not in a search playlist (`onToggleShuffle` is undefined, meaning `problemSource !== 'search'`) and not in smart mode:

```tsx
{smartMode ? (
  <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
        Smart Practice
      </span>
      <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
        {problem.difficulty}
      </span>
    </div>
  </div>
) : playlistSummary ? (
  <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
        Playlist
      </span>
      <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
        {problem.difficulty}
      </span>
      {playlistSummary.q && (
        <span className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
          {playlistSummary.q}
        </span>
      )}
      {playlistSummary.tags.map(tag => (
        <span key={tag} className="rounded-sm bg-background px-2 py-0.5 text-xs text-foreground">
          {tag}
        </span>
      ))}
    </div>
  </div>
) : !onToggleShuffle ? (
  <div className="mb-4 rounded-md border border-border bg-muted px-3.5 py-2.5">
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground mr-1">
        Random
      </span>
      <span className={cn("rounded-sm bg-background px-2 py-0.5 text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-foreground')}>
        {problem.difficulty}
      </span>
    </div>
  </div>
) : (
  <div className="mb-3">
    <span className={cn("text-xs font-semibold", difficultyColor[problem.difficulty] ?? 'text-muted-foreground')}>
      {problem.difficulty}
    </span>
  </div>
)}
```

The last `else` branch (just difficulty) covers the case where the user is in a search playlist with no active filters — `onToggleShuffle` is defined but `playlistSummary` is null.

- [ ] **Step 4: Add shuffle icon next to "Next →"**

Find this button in the header row:
```tsx
<Button variant="outline" size="sm" onClick={onSkip} className="shrink-0 text-muted-foreground">
  Next →
</Button>
```

Add the shuffle icon button immediately before it:
```tsx
{onToggleShuffle && (
  <button
    onClick={onToggleShuffle}
    className={cn(
      "shrink-0 p-1 rounded transition-colors",
      shuffle ? "text-foreground" : "text-muted-foreground hover:text-foreground"
    )}
    title={shuffle ? "Shuffle on — click to go sequential" : "Shuffle off — click to shuffle"}
    aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
  >
    <Shuffle size={16} />
  </button>
)}
<Button variant="outline" size="sm" onClick={onSkip} className="shrink-0 text-muted-foreground">
  Next →
</Button>
```

- [ ] **Step 5: Remove "Random problem" from overflow menu**

Find and delete this block inside the overflow dropdown:
```tsx
{onRandom && (
  <button
    onClick={() => { onRandom(); setOverflowOpen(false) }}
    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
  >
    Random problem
  </button>
)}
```

- [ ] **Step 6: Update CompleteView — remove onRandom**

Replace the entire contents of `frontend/src/components/CompleteView.tsx` with:

```tsx
import { Button } from './ui/button'

interface Props {
  onNext: () => void
  onBack?: () => void
}

export function CompleteView({ onNext, onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-screen font-sans gap-6">
      <h1 className="m-0 text-3xl font-medium">Nice work!</h1>
      <p className="m-0 text-muted-foreground text-base">
        You nailed the algorithm and complexity.
      </p>
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="lg" onClick={onBack}>← Back</Button>
        )}
        <Button size="lg" onClick={onNext}>Next Problem</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update ChatView — remove onRandom**

In `frontend/src/components/ChatView.tsx`:

Remove `onRandom?: () => void` from the `Props` interface.

Remove `onRandom` from the destructured props in the function signature.

Remove the `onRandom` button from the complete-stage footer:
```tsx
{stage === 'complete' ? (
  <div className="p-4 border-t border-border flex items-center gap-2">
    {onBack && (
      <Button variant="ghost" onClick={onBack}>← Back</Button>
    )}
    {onNext && (
      <Button onClick={onNext} className="ml-auto">Next Problem</Button>
    )}
    {onSmartPractice && (
      <Button variant="outline" onClick={onSmartPractice}>Smart Practice</Button>
    )}
  </div>
) : (
```

- [ ] **Step 8: Verify TypeScript compiles cleanly**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Manual smoke test**

Start the dev server:
```bash
cd frontend && npm run dev
```

Test these cases:
1. **Pure random mode** (default on load) — "Random" chip appears in problem header with difficulty badge. Shuffle icon is absent.
2. **Enter playlist** (go to Search, hit "Enter playlist") — "Playlist" chip appears (or just difficulty if no filters). Shuffle icon appears, highlighted (on). "Next →" loads a random problem within the filter set.
3. **Toggle shuffle off** — click the shuffle icon, it dims. "Next →" now goes sequential.
4. **Toggle shuffle back on** — click the icon, it highlights. "Next →" is random again.
5. **Select specific problem** from search — shuffle icon appears, dimmed (off). "Next →" goes sequential.
6. **Complete a problem** — "Next Problem" button appears in chat footer (no "Random" button). Clicking it respects current shuffle state.
7. **Overflow menu** (···) — "Random problem" item is gone.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ProblemView.tsx frontend/src/components/CompleteView.tsx frontend/src/components/ChatView.tsx
git commit -m "feat: shuffle icon in ProblemView, Random chip, remove onRandom buttons"
```
