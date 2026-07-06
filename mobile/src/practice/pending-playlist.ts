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
