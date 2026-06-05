# Surface Exit and Smart Practice Design

## Goal

Remove the `···` overflow menu from `ProblemView` by surfacing "Exit playlist" / "Exit Smart Practice" as an `×` button on the mode chip, and "Smart Practice" as a small text link below the chip.

## Problem

"Exit playlist" and "Smart Practice" are hidden behind a `···` overflow menu, making them hard to discover. Both are meaningful mode-changing actions that should be immediately visible.

## Design

### Exit button on mode chip

The "Playlist" and "Smart Practice" chips get an `×` button on the far right side of the chip. Clicking calls `onExitPlaylist`.

The "Random" chip gets no `×` — there is nothing to exit in pure random mode.

**Edge case:** when in a search playlist with no active filters, `playlistSummary` is null so the chip falls through to the "else" (just difficulty) branch. When `onExitPlaylist` is defined in this case, upgrade the chip to show a minimal "Playlist ×" chip so exit is always reachable from within a playlist.

The × button style: `text-muted-foreground hover:text-foreground transition-colors ml-auto text-sm leading-none px-1` — small, right-aligned, not alarming.

### Smart Practice link

A small text link appears below the chip whenever `onSmartPractice` is defined (logged-in user) AND `!smartMode` (not already in smart practice). Renders as:

```
↗ Smart Practice
```

Style: `text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mt-1.5 block`

### Overflow menu removed

`hasOverflow` is removed. The `···` button and dropdown are deleted from `ProblemView`. `onRandom`, `onSmartPractice`, and `onExitPlaylist` are no longer passed through the overflow — `onSmartPractice` and `onExitPlaylist` are used directly in the chip area.

## Updated chip block structure

```
smartMode:
  [Smart Practice | <difficulty> | × ]
  [↗ Smart Practice]  ← never shown (already in smart mode)

playlistSummary non-null:
  [Playlist | <difficulty> | <q> | <tags> | × ]
  [↗ Smart Practice]  ← if onSmartPractice defined

onExitPlaylist defined (no-filter playlist):
  [Playlist | <difficulty> | × ]
  [↗ Smart Practice]  ← if onSmartPractice defined

!onToggleShuffle (pure random, no onExitPlaylist):
  [Random | <difficulty>]
  [↗ Smart Practice]  ← if onSmartPractice defined

else (no-filter playlist, onToggleShuffle defined, no exit):
  <difficulty only>
  [↗ Smart Practice]  ← if onSmartPractice defined
```

## Files Changed

- `frontend/src/components/ProblemView.tsx` — update chip block (add × buttons, add Smart Practice link), remove overflow menu, remove `hasOverflow`, remove `overflowRef`, remove `overflowOpen` state and its click-outside effect
