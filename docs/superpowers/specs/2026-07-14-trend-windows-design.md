# Trend Chart Time Windows (Web)

**Date:** 2026-07-14
**Status:** Approved
**Scope:** Web frontend + backend history endpoint + snapshot retention. Mobile untouched (no trend charts there).

## Problem

The Stats page trend charts always show the last 30 days: the window is
hardcoded in the history SQL (`snapshot_date >= CURRENT_DATE - INTERVAL '30
days'`). There is no way to see longer-term progress, and snapshot data older
than 90 days is deleted by a pg_cron cleanup job, so longer windows are
impossible without a retention change.

## Goal

A window selector — 1M / 3M / 6M / 1Y / All — that applies to all topic trend
charts, with instant switching for already-viewed windows and snapshot data
retained indefinitely at bounded row growth.

## Requirements (settled during brainstorming)

- **Retention:** keep snapshots forever, thinned — daily granularity for the
  most recent 90 days, one snapshot per week older than that. This replaces
  the delete-after-90-days job.
- **Control:** segmented text control (`1M · 3M · 6M · 1Y · All`), one global
  control on the Stats page applying to every topic's trend chart — not a
  dropdown, not per-chart.
- **Data fetch:** windowed endpoint + per-window client cache. Never ship the
  full snapshot table.
- **No client-side downsampling needed:** thinning bounds an `all` window to
  ~90 daily points + ~52 weekly points per year — fine to render raw.

## Design

### Retention (backend/db/schema.sql)

Replace the `cleanup-proficiency-snapshots` cron job with a thinning job:

- Unschedule `cleanup-proficiency-snapshots` if it exists (idempotent guard,
  same style as the existing `WHERE NOT EXISTS` blocks).
- Schedule `thin-proficiency-snapshots` at 3:30am UTC (the old job's slot):
  delete rows where `snapshot_date < CURRENT_DATE - INTERVAL '90 days'` AND
  `EXTRACT(ISODOW FROM snapshot_date) <> 1` — i.e. older than 90 days, keep
  Mondays only.

**Deploy note:** the old cron job is registered in the production database;
the updated schema.sql must be re-run against it to swap the jobs.

### Endpoint (backend)

`GET /api/proficiency/history?window=1m|3m|6m|1y|all`, default `1m`
(preserves current behavior for callers that send nothing).

- Single param read via `c.Query("window")` (Fiber v3; matches the
  `smart_practice.go` convention for single query params — a query-options
  struct is overkill for one field).
- Allowlist validation in a pure `parseTrendWindow` helper; anything else →
  `xerrors.BadRequestError`.
- Handler maps window → days: `1m`=30, `3m`=90, `6m`=180, `1y`=365, `all`=0.
- Storage: `GetProficiencyHistory(ctx, userID, days int)`. Single const SQL:
  `($2 = 0 OR snapshot_date >= CURRENT_DATE - make_interval(days => $2))` so
  `all` needs no separate query.

### Frontend cache (`useStats`)

- `TrendWindow` type in `types.ts`: `'1m' | '3m' | '6m' | '1y' | 'all'`
  (named to avoid colliding with the DOM `Window` type).
- Module cache becomes `cachedProficiency` (unchanged, fetched once) plus
  `cachedHistory: Map<TrendWindow, ProficiencySnapshot[]>`.
- `useStats(window: TrendWindow)`; the effect re-runs on window change: cached
  window → serve instantly, uncached → fetch history only (proficiency is not
  refetched).
- Two loading flags in the return: `loading` (initial load, nothing cached —
  full-page "Loading...") and `historyLoading` (window switch in flight —
  chart areas show a small loading note; no page flash).
- `invalidateStatsCache()` clears proficiency, clears the entire window map,
  and bumps the existing generation counter, which guards map writes exactly
  as it guards the current cache writes.
- Session-completion and sign-out wiring is untouched.
- `api.ts`: `getProficiencyHistory(window: Window, signal?)` adds the query
  param.

### UI (`StatsPage`)

- Segmented text row `1M · 3M · 6M · 1Y · All` near the "Manage topics" line,
  active option highlighted, matching the page's minimal text-button idiom.
- Selection persists in `localStorage` under `leetgame_trend_window`; default
  `1m`; unrecognized stored values fall back to `1m`.
- X-axis tick format for `6m`/`1y`/`all`: `Jun '26` (`month: 'short'` +
  `year: '2-digit'`); the current `Jun 14` style stays for `1m`/`3m`.
- `buildChartData` is otherwise unchanged.

### Error handling

- Backend: invalid `window` → 400 via the global ErrorHandler.
- Frontend: a failed window fetch does not populate the map; the existing
  error surface applies only when there is no data to fall back on. A failed
  switch leaves the previous window's chart data visible.

## Testing

- **Backend handler test** (pattern: existing handler tests): valid windows
  map to the right day counts, missing param defaults to `1m`, junk → 400.
- **Frontend `useStats` tests** (extending the existing file): per-window
  fetch-once; switching back to a cached window issues no request;
  `invalidateStatsCache()` clears every window; the generation guard holds
  for window fetches in flight during invalidation; proficiency is fetched
  once regardless of window changes.
- **E2E receipts** (running app, network log): each newly-viewed window
  fetches history exactly once; re-selecting a viewed window fetches zero;
  completing a session then revisiting Stats refetches the selected window.

## Out of scope

- Mobile app (no trend charts exist there)
- Changes to the proficiency bars or topic list
- Backfilling history older than existing snapshots
- Client-side downsampling (obviated by thinning)
