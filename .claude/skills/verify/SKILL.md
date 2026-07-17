---
name: verify
description: Build/launch/drive recipe for verifying leetgame web frontend changes end-to-end in a real browser
---

# verifying leetgame (web frontend)

## launch

- Backend: `cd backend && go run ./cmd/server` — Fiber on :42069, needs no manual env setup locally.
- Frontend: `cd frontend && pnpm run dev` — Vite on :5173, proxies `/api` to the backend.
- Browser: chrome-devtools MCP, `new_page` at `http://localhost:5173/`. Test account (leetgametest@gmail.com) is usually already signed in; if not, `?dev=1` triggers dev sign-in (creds in `frontend/.env.local`).

## driving flows

- Practice view loads a random problem immediately; `Next →` skips, `←` appears once history exists.
- Playlist: Search tab → pick a tag → "Enter Playlist · N problems" (enters shuffle mode, banner shows PLAYLIST).
- Titles are hidden by default — read the current problem via `document.querySelector('h2').textContent` (contains `#<leetcode_id>`), not the visible text.

## gotchas

- `evaluate_script` that clicks a button returns the heading from BEFORE React re-renders — click and read in two separate calls.
- To prove "no fetch happened" receipts, wrap `window.fetch` to record URLs into `window.__reqs` before clicking, then read it after.
- chrome-devtools `fill()` doesn't fire React onChange on controlled inputs — follow with a real `press_key` keystroke.
