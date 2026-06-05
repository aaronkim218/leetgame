# Shuffle Toggle Design

## Goal

Replace the confusing dual "Next" / "Random Problem" button pattern with a single Spotify-style shuffle toggle that controls what "Next →" does, and add a "Random" mode chip so users always know what mode they're in.

## Problem

There are two ways to enter a playlist from Search: "Enter playlist" (starts on a random problem) and clicking a specific problem (starts in order). Both set `problemSource = 'search'` but users have no visual indication of whether "Next →" will go sequential or random. A separate "Random problem" overflow item and a second "Random Problem" button in `CompleteView` exist for the random case, but the split is non-obvious and redundant.

## Design

### State

Add `shuffle: boolean` to `App.tsx`.

- `enterPlaylistFromSearch` → sets `shuffle = true`
- `selectProblem` → sets `shuffle = false`
- User can toggle at any time via the shuffle icon

### Routing

`loadNextProblem` becomes shuffle-aware:

```
if (problemSource === 'search') {
  shuffle ? loadRandomNextProblem() : loadNextSearchProblem()
} else if (problemSource === 'smart') {
  loadSmartPracticeProblem()
} else {
  loadRandomProblem()
}
```

This is the single source of truth. Both "Next →" (`onSkip`) and the post-completion "Next Problem" button go through it.

### Mode chip (ProblemView)

The existing chip block already shows "Playlist" or "Smart Practice". Add a "Random" chip for `problemSource === 'random'`. No other changes to the chip block.

### Shuffle icon (ProblemView)

Only rendered when `problemSource === 'search'` (i.e. a playlist is active). Lives next to the "Next →" button in the problem header.

- Uses `Shuffle` from `lucide-react`
- Highlighted (foreground color) when `shuffle = true`
- Muted (`text-muted-foreground`) when `shuffle = false`
- Clicking calls `onToggleShuffle`

Props added to `ProblemView`:
- `shuffle?: boolean`
- `onToggleShuffle?: () => void`

### Removals

- "Random problem" item removed from the overflow menu in `ProblemView`
- `onRandom` prop removed from `CompleteView` (and `ChatView` which passes it through)
- `onRandom` prop no longer passed from `App.tsx` to `ChatView`

`hasOverflow` recalculated without `onRandom`.

## Files Changed

- `frontend/src/App.tsx` — add `shuffle` state, wire `enterPlaylistFromSearch`/`selectProblem`, update `loadNextProblem`, remove `onRandom` from ChatView/ProblemView props
- `frontend/src/components/ProblemView.tsx` — add "Random" chip, add shuffle icon, remove "Random problem" overflow item
- `frontend/src/components/CompleteView.tsx` — remove `onRandom` prop and button
- `frontend/src/components/ChatView.tsx` — remove `onRandom` prop pass-through (if any)
