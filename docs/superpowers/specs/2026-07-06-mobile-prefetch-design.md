# Next-Problem Prefetching (Mobile)

**Date:** 2026-07-06
**Status:** Approved
**Scope:** Mobile (React Native / Expo) app. Ports the shipped web feature
(`docs/superpowers/specs/2026-07-06-next-problem-prefetch-design.md`) with strict
behavior parity — no mobile-specific network gating.

## Problem

Every "Next" on mobile is a network round trip: `loadRandom` fetches
`/api/problems/random`, and playlist advance (`loadPlaylistProblem`) fetches the
filtered random endpoint. On phone networks the dead time is more visible than on
desktop web.

Mobile is simpler than web was: playlists are always shuffle-style (no sequential
mode, no back-stack, no shuffle toggle, no manual selection into a running
practice screen), so **both** non-smart "Next" paths are network-bound and
prefetchable. Smart practice is untouched (parity with web).

## Goal

Make "Next" instant in random mode and playlist mode by fetching the next
candidate in the background while the user works on the current problem.

## Design

### Hook: `use-prefetched-problem.ts`

New file `mobile/src/practice/use-prefetched-problem.ts` (kebab-case per mobile
convention). Direct port of web's `usePrefetchedProblem` with imports pointed at
`../api/problems` (`getRandomProblemFiltered`) and `../api/errors` (`ApiError`):

```ts
export interface PrefetchContext {
  q: string
  difficulties: string[]
  tags: string[]
  tagMatch: 'and' | 'or'
  excludeId?: string
}

export type PrefetchResult = { problem: Problem } | { exhausted: true }

export function usePrefetchedProblem(): {
  prefetch: (ctx: PrefetchContext) => void
  take: (ctx: PrefetchContext) => PrefetchResult | null
  invalidate: () => void
}
```

Identical semantics to web:

- Slot state lives in a ref; the slot stores the serialized context key it was
  fetched for (arrays copied and sorted before serialization).
- `prefetch` re-targets the slot to the new key, fires
  `getRandomProblemFiltered(q, difficulties, tags, tagMatch, excludeId)`, and
  stores the response only if the slot's key still matches (stale responses after
  `invalidate` or a re-targeting `prefetch` are dropped).
- A 404 (`ApiError` with status 404) is stored as `{ exhausted: true }`.
- Any other failure clears the slot; prefetch failures never drive error UI.
- `take` returns the result only on an exact key match, consumes the slot, and
  returns `null` while the fetch is in flight.

### Wiring inside `usePracticeSession`

`mobile/src/practice/use-practice-session.ts` instantiates the hook internally.
The screen layer (`app/index.tsx`, components) is untouched.

Context builders (module-scope helpers or inline):

- `randomCtx(excludeId?)` → `{ q: '', difficulties: [], tags: [], tagMatch: 'and', excludeId }`
- `playlistCtx(filters, excludeId?)` → filters spread plus `excludeId`

Prefetch triggers (after a successful load, i.e. after `startSession(p)`):

- `loadRandom` → `prefetch(randomCtx(p.id))`
- `loadPlaylistProblem` → `prefetch(playlistCtx(filters, p.id))`
- `startPlaylist` with `initialProblem` → `prefetch(playlistCtx(filters, initialProblem.id))`
  (mobile analog of web's `enterPlaylistFromSearch`)

Consume in `loadNext`:

- **random source:** `take(randomCtx(problem?.id))`. On a `{ problem }` hit:
  bump `loadSeqRef` (a take-hit is synchronous — the bump discards any in-flight
  older load when it lands, the same trick `startPlaylist`'s `initialProblem`
  path uses), `startSession(cached.problem)`, `setProblemSource('random')`,
  `playlistFiltersRef.current = null`, `setExhausted(false)`, then
  `prefetch(randomCtx(cached.problem.id))`. An exhausted hit (single-problem
  catalog edge) or any miss falls through to `loadRandom()` unchanged.
- **playlist source:** `take(playlistCtx(filters, problem?.id))`. `{ problem }`
  hit: same synchronous swap (source stays `'playlist'`, filters ref untouched)
  plus successor prefetch. `{ exhausted: true }` hit: `setExhausted(true)`
  immediately — instant end-of-set from the cached 404. Miss: existing
  `loadPlaylistProblem(problem?.id)` unchanged.
- **smart source:** untouched; never prefetched.

### Invalidation

`loadSmart` calls `invalidate()` on entry (source switch). `startPlaylist` and
`restartPlaylist` re-target the slot via their own success-path prefetch. As on
web, correctness comes from `take`'s exact key match — invalidation is hygiene.
Mobile's invalidation surface is just the one `loadSmart` call because there is
no shuffle toggle, no back-stack, and no manual selection.

### Error handling

A failed prefetch leaves the slot empty; the user gets exactly today's behavior
on Next. `error` state is never set by prefetching.

## Cost

One extra filtered-random request per problem viewed (~2–5 KB JSON), wasted when
the user never taps Next. Served from the backend's in-process cache; negligible.
Strict web parity — no Wi-Fi-only gating (decided during design).

## Testing

- Hook unit tests: port the web suite from Vitest to Jest
  (`mobile/src/practice/use-prefetched-problem.test.ts`,
  `jest.mock('../api/problems')`): take hit/miss on context match, in-flight
  returns null, 404-as-exhausted, stale-response dropping after invalidate and
  after re-target, non-404 clears slot — plus an explicit
  double-take-after-exhausted assertion (closes the coverage gap recorded on the
  web side).
- `use-practice-session.test.tsx` extensions: take-hit renders the prefetched
  problem with no second fetch (mock call counts + args asserted), miss falls
  back to the network path, cached-exhausted sets `exhausted` with no new fetch.
- Final gate: live iOS-simulator verification (rn-agentic-loop) against the
  local backend — the web E2E receipts minus the two sequential-mode checks that
  don't exist on mobile: (1) initial load fires prefetch with `exclude_id`;
  (2) Next in random mode swaps instantly with only the successor prefetch as a
  new request; (3) playlist enter + Next show the same pattern with filter
  params; (4) single-problem playlist caches the 404 and shows end-of-set
  instantly on Next with zero new requests.
