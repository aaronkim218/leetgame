import type { PlaylistFilters, Problem } from '../types'

export interface PendingPlaylist {
  filters: PlaylistFilters
  problem?: Problem
}

let pending: PendingPlaylist | null = null

export function setPendingPlaylist(p: PendingPlaylist): void {
  pending = p
}

// One-shot by design. Note: under React StrictMode double-mounting, effect
// dedup refs reset and a second take() returns null — consumers fall back to
// loadRandom(), silently dropping the selected problem. This app does not
// enable StrictMode; revisit this module if that changes.
export function takePendingPlaylist(): PendingPlaylist | null {
  const p = pending
  pending = null
  return p
}
