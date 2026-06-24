# leetgame native app — design

**Date:** 2026-06-24
**Status:** Approved design, pending implementation plan
**Scope:** v1 = core practice loop only

## 1. Goal

Build a new Expo + React Native app for leetgame that talks to the **existing Go
backend** (same endpoints, same Supabase auth) — mirroring the web app's API
contract. The mission emphasizes verbal, mobile, no-coding practice, so a native
app is a natural home for the core practice loop.

v1 ships the **core practice loop only**:

- Supabase auth (anonymous practice + optional email sign-in), matching web.
- Get a problem (random / smart practice).
- The verbal chat practice flow through stages, with streaming LLM feedback.
- Streak recorded on completion (when signed in).

### Explicitly deferred (not in v1)

Flagged so they are not silently dropped:

- Search / filter and saved problems
- Stats / proficiency trend charts
- Settings **tuning** UI (settings are read-only in v1 — see §6)
- Chat message **queue** (submit-while-streaming) — input is disabled while
  streaming instead
- Anonymous settings persistence (web uses `localStorage`; native uses defaults)
- **Voice input (speech-to-text)** — noted as the highest-value future
  enhancement given the mission ("verbal, mobile, without coding")

## 2. Backend contract (existing, unchanged)

The native app consumes the same `/api/*` endpoints the web app uses. v1 touches:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/problems/random` | GET | Random problem (optional filters; v1 uses unfiltered) |
| `/api/problems/smart` | GET | Smart practice problem (`active_stages`, `active_topics`) |
| `/api/chat` | POST | Verbal evaluation, **SSE stream** (`token` / `done` / `error`) |
| `/api/streak` | GET / POST | Read / record daily streak |
| `/api/settings` | GET | Read user settings (read-only in v1) |

Auth: `Authorization: Bearer <supabase access_token>` when signed in; omitted
when anonymous. Anonymous requests skip eval/streak server-side (unchanged
behavior). The backend is **not modified** for this work.

### Chat SSE framing (reused verbatim from web)

`POST /api/chat` with body `{ problem_id, stage, active_stages, history,
message, hint_requested, answer_requested }`. Response is `text/event-stream`:

- `event: token` / `data: {"content": "..."}` — append to streaming message
- `event: done` / `data: {"stage": "...", "message": "..."}` — final message +
  next stage (`complete` when finished)
- `event: error` / `data: {}` — evaluation failed

Stages: `edge_cases`, `brute_force`, `pattern`, `algorithm`, `tc_sc`, then
`complete`. The active subset and order come from settings; defaults are
`['pattern', 'algorithm', 'tc_sc']`.

## 3. Project setup & location

New `mobile/` directory in this monorepo (sibling to `frontend/` and
`backend/`), scaffolded with `create-expo-app` (TypeScript template, Expo
Router). No shared build with `frontend/` — we deliberately mirror its API
contract and copy `types.ts`.

### Dependencies

- `expo`, `expo-router` (latest SDK)
- `expo/fetch` (bundled with Expo — used for SSE streaming)
- `@supabase/supabase-js`, `@react-native-async-storage/async-storage`,
  `react-native-url-polyfill`
- A markdown renderer (`react-native-markdown-display` as the working choice;
  swappable at implementation if maintenance/compat issues arise)
- Dev/test: `jest-expo`, `@testing-library/react-native`

### Config / env

`app.config.ts` reading from `.env` (gitignored), exposing public vars:

- `EXPO_PUBLIC_API_URL` — backend base URL (same backend as web)
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Same values as the web app. A throwing guard if Supabase vars are missing
(mirrors `frontend/src/lib/supabase.ts`).

## 4. Architecture

```
mobile/
  app/
    _layout.tsx          # root: AuthProvider, ThemeProvider, expo-router Stack
    index.tsx            # Practice screen (the core loop)
    sign-in.tsx          # modal route: email/password sign-in
    account.tsx          # streak + email + sign in/out
  src/
    api/
      client.ts          # API_URL, authHeaders()
      problems.ts        # getRandomProblem, getSmartPracticeProblem
      chat.ts            # streamChat() — expo/fetch SSE generator
      settings.ts        # getSettings
      streak.ts          # getStreak, recordStreak
    auth/
      AuthContext.tsx    # session, settings (read-only), streak; port of useAuth
      supabase.ts        # configured client (AsyncStorage, AppState refresh)
    practice/
      usePracticeSession.ts  # session state machine (problem, history, stage, stream)
    components/
      ProblemView.tsx    # title/difficulty/description card
      ChatThread.tsx     # message list + streaming bubble
      MessageBubble.tsx  # user (plain) / assistant (markdown) bubble
      StageBanner.tsx    # "Pattern ✓ — Describe your algorithm"
      InputBar.tsx       # multiline input + Send + Hint/Answer
      CompletionFooter.tsx  # Next Problem / Smart Practice
      DifficultyBadge.tsx
      Markdown.tsx       # wraps the markdown renderer with themed styles
    theme/
      tokens.ts          # light/dark token objects (ported from web CSS vars)
      ThemeContext.tsx   # useTheme() based on useColorScheme()
    types.ts             # ported verbatim from frontend/src/types.ts
```

### Data flow

`AuthProvider` → provides `session`, `streak`, `streakStatus`, and the read-only
settings the loop needs (`activeStages`, `hideTitle`, `hideDifficulty`). The
Practice screen reads these, drives `usePracticeSession`, and renders the
sub-components.

## 5. The chat stream (the crux)

`src/api/chat.ts` exports an async generator `streamChat(...)` that:

1. Uses `import { fetch } from 'expo/fetch'` (NOT global fetch) so the response
   body is a readable stream on native.
2. POSTs the chat body with `Authorization` + `Content-Type: application/json`.
3. Reads `res.body.getReader()`, decodes `Uint8Array` chunks with `TextDecoder`,
   and runs the **same SSE parse loop as `frontend/src/api.ts`** (split on
   `\n\n`, parse `event:` / `data:` lines).
4. Yields `{ type: 'token', content }` and `{ type: 'done', stage, message }`;
   throws on `error`.

`usePracticeSession` consumes it identically to web `App.tsx`:

- Push the user message into `history`.
- Append streaming tokens into a live `streamingMessage` buffer.
- On `done`: commit the assistant message, set the next `stage`, clear the
  buffer, and if `stage === 'complete'` and signed in, call `recordStreak`.
- Hint/Answer set the `hint_requested` / `answer_requested` flags for one turn.
- Errors surface inline; input re-enables.

Input is **disabled while streaming** in v1 (no message queue).

## 6. Auth & settings

`src/auth/supabase.ts` — verified RN configuration:

```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
```

Plus an `AppState` listener to `startAutoRefresh()` when active and
`stopAutoRefresh()` when backgrounded (Supabase RN requirement).

> Note: `expo-secure-store` is intentionally **not** used — its ~2KB per-key
> limit breaks Supabase JWT sessions; AsyncStorage is the documented default.

`AuthContext` ports `frontend/src/hooks/useAuth.ts`:

- Subscribes to `supabase.auth.onAuthStateChange`.
- On signed-in `INITIAL_SESSION` / `SIGNED_IN`: load `getStreak()` and
  `getSettings()`.
- On anonymous / `SIGNED_OUT`: `streak = null`, settings = defaults
  (`DEFAULT_STAGES`, `hideTitle = true`, `hideDifficulty = true`).

Settings are **read-only** in v1 (no `updateSettings`, no tuning UI). Anonymous
settings persistence to AsyncStorage is deferred.

Sign-in uses `supabase.auth.signInWithPassword({ email, password })` (matches
web). Anonymous practice is fully functional; only streak/proficiency
persistence needs sign-in.

## 7. Screens & UX

### Practice (`/`)

One scrollable screen running the whole loop:

- **Problem card**: title (hidden if `hideTitle`), `DifficultyBadge` (hidden if
  `hideDifficulty`), description as markdown.
- **StageBanner**: current-stage prompt, with prior-stage checkmark
  ("Pattern ✓ — Describe your algorithm"), matching web copy.
- **ChatThread**: user bubbles (plain text), assistant bubbles (markdown),
  "Thinking…" indicator, and a streaming bubble with a blinking cursor.
- **InputBar**: multiline `TextInput` + Send; **Hint** and **Answer** buttons.
  Disabled while streaming.
- **CompletionFooter** (when `stage === 'complete'`): **Next Problem** and
  **Smart Practice**.
- **Header**: streak flame (when signed in, using `streakStatus` solid/hollow)
  + account button → `/account`.

Initial problem load: random problem on mount (anonymous-friendly).

### Sign-in (`/sign-in`, modal)

Email + password fields, submit via `signInWithPassword`, error display, close
on success.

### Account (`/account`)

Signed in: email, streak, **Sign out**. Anonymous: prompt + link to `/sign-in`.

## 8. Theme & styling

Plain `StyleSheet` + a typed `theme` object. `src/theme/tokens.ts` ports the
web's CSS custom properties (background, foreground, primary, secondary, muted,
border, difficulty colors, code background) into `light` and `dark` token
objects. `useTheme()` selects based on `useColorScheme()`. Components build
`StyleSheet` from tokens. No in-app theme toggle in v1 — follows system.

## 9. Testing

- **SSE parser** (`chat.ts`): unit tests with a mocked `expo/fetch` returning a
  scripted `ReadableStream`; assert correct `token`/`done`/`error` yields and
  multi-chunk framing.
- **`usePracticeSession`** reducer/logic: tests for stage progression,
  hint/answer flags, completion → streak, error handling.
- **API modules**: thin tests with mocked fetch for URL/params/headers.
- **Manual verification**: run the live loop on the iOS simulator (metro-mcp /
  rn-agentic-loop) before declaring done — start a session, submit an
  explanation, confirm streaming feedback and stage advance to `complete`.

## 10. Out of scope / risks

- Backend is unchanged. If `/api/chat` SSE behaves differently under
  `expo/fetch` than browser fetch (buffering, chunk boundaries), the parse loop
  already handles partial frames; verify on-device early.
- Markdown renderer choice is provisional; validate rendering of code spans and
  lists against the assistant output format.
