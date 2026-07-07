# Next-Problem Prefetching (Web)

**Date:** 2026-07-06
**Status:** Approved
**Scope:** Web frontend only. Mobile may adopt the same pattern later.

## Problem

Every "Next" click in random mode and shuffled-playlist mode does a network round
trip to `/api/problems/random` before the next problem renders. The backend serves
these from the in-process cache, so latency is dominated by the network and auth
header retrieval — visible dead time on every transition.

Non-shuffle playlists are already instant (the next item is in memory), and smart
practice picks depend on proficiency data that changes after each evaluation, so
neither is in scope.

## Goal

Make "Next" instant in random mode and shuffled-playlist mode by fetching the next
candidate in the background while the user works on the current problem.

## Design

### Hook: `usePrefetchedProblem`

New file `frontend/src/hooks/usePrefetchedProblem.ts` (camelCase, matching the
existing hooks). Owns a single prefetch slot.

```ts
type PrefetchContext = {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  excludeId?: string
}

type PrefetchResult = { problem: Problem } | { exhausted: true }

function usePrefetchedProblem(): {
  prefetch: (ctx: PrefetchContext) => void   // fire-and-forget background fetch
  take: (ctx: PrefetchContext) => PrefetchResult | null  // consume slot on exact ctx match
  invalidate: () => void
}
```

Behavior:

- `prefetch(ctx)` serializes `ctx` into a key, records it as the slot's target, and
  calls `getRandomProblemFiltered(q, difficulties, tags, tagMatch, excludeId)`.
  When the response arrives, it is stored only if the slot's target key still equals
  the request's key (stale responses after invalidation or re-targeting are dropped).
- A 404 (`ApiError` with status 404) is stored as `{ exhausted: true }` — in shuffle
  mode it means no other problem matches the filters, which stays true until the
  filters change (and a filter change changes the key).
- Any other failure clears the slot; `take` then misses and the caller falls back to
  the normal fetch path. Prefetch failures never drive error UI.
- `take(ctx)` returns the stored result only when `ctx`'s key matches the stored
  key exactly, and empties the slot. Otherwise returns `null`.
- Slot state lives in a ref — no re-renders.

Plain random mode uses empty filters plus `excludeId: currentProblem.id`, i.e.
`getRandomProblemFiltered('', [], [], 'and', currentId)`. Side effect: plain random
can no longer serve the same problem twice in a row when a prefetch is consumed
(fixes an existing wart).

### App.tsx wiring

- After a problem is set in random mode or shuffle-playlist mode (in
  `loadRandomProblem`, the random branch of `loadNextProblem`,
  `loadRandomNextProblem`, and after consuming a prefetch), call `prefetch(ctx)`
  for that problem's successor.
- In the random branch of `loadNextProblem` and in `loadRandomNextProblem`, first
  `take(ctx)`:
  - Hit with `{ problem }`: perform the same state updates as today (push snapshot,
    `setProblem`, `resetPracticeState`, clear exhausted/error) with no network wait,
    then `prefetch` the next successor.
  - Hit with `{ exhausted: true }`: in shuffle mode, set `playlistExhausted`
    immediately, as the current 404 handler does. In plain random mode (possible
    only when the catalog has a single problem, since we now pass `excludeId`),
    treat it as a miss and fall back to `getRandomProblem()`, matching today's
    behavior of re-serving the same problem.
  - Miss: run the existing fetch code unchanged.
- Untouched paths: non-shuffle playlist advance, page-boundary search fetch, smart
  practice, manual selection from search, back-stack navigation.

### Invalidation

`invalidate()` is called when the context that produced the slot's contents changes:

- problem source switches (random / search / smart)
- shuffle is toggled
- playlist filters change
- a problem is picked manually from search results
- the back-stack is popped (current problem changed, so `excludeId` is stale)

Correctness does not depend on these calls — `take` key-matching already guarantees
a mismatched slot is never consumed. Invalidation just keeps dead data from
lingering.

### Error handling

A failed prefetch leaves the slot empty and the user gets exactly today's behavior
on Next (fetch on click, existing error messages). No new error states.

## Cost

Roughly one extra `/api/problems/random` request per problem viewed, wasted when
the user never clicks Next. The backend serves these from `processcache` RAM with
no DB access, so the added load is negligible.

## Testing

- Unit tests for the hook (Vitest, colocated as
  `usePrefetchedProblem.test.ts`, like `useSessionStack.test.ts`):
  - `take` hit on exact context match; miss on any field mismatch
  - 404 stored as exhausted and returned on `take`
  - stale response dropped after `invalidate` or a re-targeting `prefetch`
  - non-404 failure clears the slot
- App-level test: with a prefetched slot populated, Next renders the prefetched
  problem without issuing a second random fetch; on a miss it falls back to the
  network path.
