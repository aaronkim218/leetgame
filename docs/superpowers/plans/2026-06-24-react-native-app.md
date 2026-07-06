# leetgame Native App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Expo + React Native app (`mobile/`) implementing the leetgame core verbal-practice loop against the existing Go backend and Supabase auth.

**Architecture:** A new `mobile/` Expo Router project, fully separate from `frontend/` but mirroring its API contract. An `AuthContext` ports the web `useAuth` (Supabase session + read-only settings + streak). The core loop lives in a `usePracticeSession` hook driving a single Practice screen; LLM feedback streams over SSE via `expo/fetch`. Styling is plain `StyleSheet` + a ported theme-token object.

**Tech Stack:** Expo (SDK 54+, default template = Expo Router + TypeScript), `expo/fetch`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-url-polyfill`, `react-native-markdown-display`, `jest-expo` + `@testing-library/react-native`.

## Global Constraints

- **Backend is unchanged.** Consume existing `/api/*` endpoints only.
- **Base URL & Supabase config from env:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Auth header:** `Authorization: Bearer <access_token>` only when a session exists; omitted when anonymous.
- **Supabase RN client MUST set:** `storage: AsyncStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`, and import `react-native-url-polyfill/auto` before `createClient`. Do NOT use `expo-secure-store` (2KB key limit breaks JWT sessions).
- **Chat request body shape (exact):** `{ problem_id: string, stage: string, active_stages: string[], history: {role,content,marker?}[], message: string, hint_requested: boolean, answer_requested: boolean }`. `history` is the prior turns only; the new `message` is sent separately (backend appends it).
- **Backend chat validation (must satisfy):** `active_stages` non-empty, valid stage IDs, no duplicates, **in canonical order** (`edge_cases, brute_force, pattern, algorithm, tc_sc`); `stage` must be one of `active_stages`; `hint_requested` and `answer_requested` are mutually exclusive; `history[i].marker` ∈ {`""`,`hint`,`answer`}; `history[i].role` ∈ {`user`,`assistant`}.
- **Stage type:** `ActiveStage = 'edge_cases'|'brute_force'|'pattern'|'algorithm'|'tc_sc'`; `Stage = ActiveStage | 'complete'`. `DEFAULT_STAGES = ['pattern','algorithm','tc_sc']`.
- **SSE framing:** events separated by `\n\n`; each event has `event: <type>` and `data: <json>` lines. Types: `token` (`{content}`), `done` (`{stage,message}`), `error` (`{}`).
- **Naming:** TS files kebab-case; React components PascalCase.
- **Settings are read-only in v1** (no `updateSettings`, no tuning UI). Anonymous → defaults.
- **Theme tokens (port verbatim):**
  - Light: `background #fff`, `foreground #08060d`, `card #fff`, `primary #aa3bff`, `primaryForeground #fff`, `secondary #f0f0f0`, `secondaryForeground #222`, `muted #f4f3ec`, `mutedForeground #6b6375`, `border #e5e4e7`, `destructive #ff375f`, `codeBg #eaecf4`.
  - Dark: `background #16171d`, `foreground #f3f4f6`, `card #16171d`, `primary #c084fc`, `primaryForeground #fff`, `secondary #2e303a`, `secondaryForeground #f3f4f6`, `muted #1f2028`, `mutedForeground #9ca3af`, `border #2e303a`, `destructive #ff375f`, `codeBg #2a2d3e`.
  - Difficulty (both themes): `easy #00b8a9`, `medium #ffc01e`, `hard #ff375f`.

---

## Task 1: Scaffold the Expo project, config, types, and theme

**Files:**
- Create: `mobile/` (via `create-expo-app`)
- Create: `mobile/app.config.ts`
- Create: `mobile/.env.example`, `mobile/.env` (gitignored)
- Modify: `.gitignore` (root) — add `mobile/.env`
- Create: `mobile/src/types.ts`
- Create: `mobile/src/theme/tokens.ts`
- Create: `mobile/src/theme/theme-context.tsx`
- Test: `mobile/src/theme/tokens.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `Problem`, `ProblemSearchResponse`, `ProblemTag`, `ChatMessage` (`{role:'user'|'assistant', content:string, marker?:'hint'|'answer'}`), `ActiveStage`, `Stage`, `TopicProficiency`, `CANONICAL_STAGES`, `DEFAULT_STAGES`, `NEETCODE_TOPICS`.
  - `tokens.ts`: `type ThemeName = 'light'|'dark'`; `type Theme = { background:string; foreground:string; card:string; primary:string; primaryForeground:string; secondary:string; secondaryForeground:string; muted:string; mutedForeground:string; border:string; destructive:string; codeBg:string; easy:string; medium:string; hard:string }`; `const themes: Record<ThemeName, Theme>`.
  - `theme-context.tsx`: `ThemeProvider` (React component), `useTheme(): Theme`.

- [x] **Step 1: Scaffold the app**

Run from repo root:
```bash
npx create-expo-app@latest mobile --template default
cd mobile
```
The default template includes Expo Router + TypeScript.

- [x] **Step 2: Install dependencies**

```bash
cd mobile
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill react-native-markdown-display
npx expo install -- --save-dev jest-expo jest @testing-library/react-native @types/jest
```

- [x] **Step 3: Configure Jest**

Add to `mobile/package.json`:
```json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-markdown-display))"
    ]
  }
}
```

- [x] **Step 4: Create env files and gitignore entry**

`mobile/.env.example`:
```
EXPO_PUBLIC_API_URL=https://your-backend.example.com
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```
Copy the same values used by `frontend/.env` into `mobile/.env`. Append `mobile/.env` to the root `.gitignore`.

- [x] **Step 5: Write the failing token test**

`mobile/src/theme/tokens.test.ts`:
```ts
import { themes } from './tokens'

test('light and dark themes expose all token keys', () => {
  const keys = [
    'background','foreground','card','primary','primaryForeground',
    'secondary','secondaryForeground','muted','mutedForeground',
    'border','destructive','codeBg','easy','medium','hard',
  ] as const
  for (const name of ['light','dark'] as const) {
    for (const k of keys) {
      expect(typeof themes[name][k]).toBe('string')
      expect(themes[name][k].length).toBeGreaterThan(0)
    }
  }
})

test('primary differs between light and dark', () => {
  expect(themes.light.primary).toBe('#aa3bff')
  expect(themes.dark.primary).toBe('#c084fc')
})
```

- [x] **Step 6: Run test to verify it fails**

Run: `cd mobile && npm test -- tokens`
Expected: FAIL — cannot find module `./tokens`.

- [x] **Step 7: Implement tokens.ts**

`mobile/src/theme/tokens.ts`:
```ts
export type ThemeName = 'light' | 'dark'

export interface Theme {
  background: string
  foreground: string
  card: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  border: string
  destructive: string
  codeBg: string
  easy: string
  medium: string
  hard: string
}

export const themes: Record<ThemeName, Theme> = {
  light: {
    background: '#fff',
    foreground: '#08060d',
    card: '#fff',
    primary: '#aa3bff',
    primaryForeground: '#fff',
    secondary: '#f0f0f0',
    secondaryForeground: '#222',
    muted: '#f4f3ec',
    mutedForeground: '#6b6375',
    border: '#e5e4e7',
    destructive: '#ff375f',
    codeBg: '#eaecf4',
    easy: '#00b8a9',
    medium: '#ffc01e',
    hard: '#ff375f',
  },
  dark: {
    background: '#16171d',
    foreground: '#f3f4f6',
    card: '#16171d',
    primary: '#c084fc',
    primaryForeground: '#fff',
    secondary: '#2e303a',
    secondaryForeground: '#f3f4f6',
    muted: '#1f2028',
    mutedForeground: '#9ca3af',
    border: '#2e303a',
    destructive: '#ff375f',
    codeBg: '#2a2d3e',
    easy: '#00b8a9',
    medium: '#ffc01e',
    hard: '#ff375f',
  },
}
```

- [x] **Step 8: Implement theme-context.tsx**

`mobile/src/theme/theme-context.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { themes, type Theme } from './tokens'

const ThemeCtx = createContext<Theme>(themes.light)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme()
  const theme = scheme === 'dark' ? themes.dark : themes.light
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeCtx)
}
```

- [x] **Step 9: Implement types.ts**

Port `frontend/src/types.ts`, keeping only what v1 uses. `mobile/src/types.ts`:
```ts
export interface Problem {
  id: string
  slug: string
  title: string
  description: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic_tags: string[]
  leetcode_id: number | null
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  marker?: 'hint' | 'answer'
}

export type ActiveStage =
  | 'edge_cases'
  | 'brute_force'
  | 'pattern'
  | 'algorithm'
  | 'tc_sc'

export type Stage = ActiveStage | 'complete'

export const CANONICAL_STAGES: ActiveStage[] = [
  'edge_cases',
  'brute_force',
  'pattern',
  'algorithm',
  'tc_sc',
]

export const DEFAULT_STAGES: ActiveStage[] = ['pattern', 'algorithm', 'tc_sc']

export interface TopicProficiency {
  user_id: string
  topic: string
  stage: string
  score: number
  updated_at: string
}

export const NEETCODE_TOPICS: string[] = [
  'Array', 'Hash Table', 'Two Pointers', 'Sliding Window', 'Stack',
  'Binary Search', 'Linked List', 'Tree', 'Binary Tree', 'Binary Search Tree',
  'Trie', 'Heap (Priority Queue)', 'Backtracking', 'Graph',
  'Depth-First Search', 'Breadth-First Search', 'Union Find',
  'Dynamic Programming', 'Greedy', 'Intervals', 'Math', 'Bit Manipulation',
  'Matrix',
]
```

- [x] **Step 10: Run tests**

Run: `cd mobile && npm test -- tokens`
Expected: PASS (both tests).

- [x] **Step 11: Verify the app boots**

Run: `cd mobile && npx expo start --ios` (or press `i`). Expected: the default Expo Router starter screen renders in the simulator with no red error. Stop the server after confirming.

- [x] **Step 12: Commit**

```bash
git add mobile .gitignore
git commit -m "feat(mobile): scaffold Expo app with theme tokens and types"
```

---

## Task 2: Supabase client and AuthContext

**Files:**
- Create: `mobile/src/auth/supabase.ts`
- Create: `mobile/src/auth/auth-context.tsx`
- Test: `mobile/src/auth/auth-context.test.tsx`

**Interfaces:**
- Consumes: `types.ts` (`ActiveStage`, `DEFAULT_STAGES`), `api/streak.ts` + `api/settings.ts` are created in Task 4 — to avoid a forward dependency, AuthContext imports them lazily through small injectable fetch functions defined here. For this task, define the loaders as internal calls to `getStreak`/`getSettings` that are **declared but imported in Task 4**; to keep this task self-contained and testable now, AuthContext takes the loaders from a module that we stub in the test.
  - **Decision (locks the seam):** AuthContext imports `getStreak` from `../api/streak` and `getSettings` from `../api/settings`. Those modules are created in Task 4. This task's test mocks both modules with `jest.mock`, so the task is testable before Task 4 exists.
- Produces:
  - `supabase.ts`: `const supabase` (configured client).
  - `auth-context.tsx`: `AuthProvider`; `useAuth(): { session: Session|null; authReady: boolean; streak: number|null; streakStatus: 'solid'|'hollow'|'none'|null; activeStages: ActiveStage[]; hideTitle: boolean; hideDifficulty: boolean; signOut: () => Promise<void>; refreshStreak: () => void }`.

- [x] **Step 1: Implement the Supabase client**

`mobile/src/auth/supabase.ts`:
```ts
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { createClient } from '@supabase/supabase-js'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
```

- [x] **Step 2: Write the failing AuthContext test**

`mobile/src/auth/auth-context.test.tsx`:
```tsx
import { render, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthProvider, useAuth } from './auth-context'

const authState = { callback: (_e: string, _s: unknown) => {} }
jest.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        authState.callback = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: jest.fn(),
    },
  },
}))
jest.mock('../api/streak', () => ({ getStreak: jest.fn() }))
jest.mock('../api/settings', () => ({ getSettings: jest.fn() }))

function Probe() {
  const { authReady, activeStages, hideTitle } = useAuth()
  return (
    <Text>{`${authReady}|${activeStages.join(',')}|${hideTitle}`}</Text>
  )
}

test('anonymous session falls back to default settings', async () => {
  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  authState.callback('INITIAL_SESSION', null)
  await waitFor(() =>
    expect(getByText('true|pattern,algorithm,tc_sc|true')).toBeTruthy(),
  )
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `cd mobile && npm test -- auth-context`
Expected: FAIL — cannot find module `./auth-context`.

- [x] **Step 4: Implement AuthContext**

`mobile/src/auth/auth-context.tsx`:
```tsx
import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getStreak, recordStreak } from '../api/streak'
import { getSettings } from '../api/settings'
import { DEFAULT_STAGES, type ActiveStage } from '../types'

type StreakStatus = 'solid' | 'hollow' | 'none' | null

interface AuthValue {
  session: Session | null
  authReady: boolean
  streak: number | null
  streakStatus: StreakStatus
  activeStages: ActiveStage[]
  hideTitle: boolean
  hideDifficulty: boolean
  signOut: () => Promise<void>
  refreshStreak: () => void
}

const AuthCtx = createContext<AuthValue | null>(null)

function computeStatus(lastPracticedAt: string | null): StreakStatus {
  if (lastPracticedAt === null) return null
  const ms = Date.now() - new Date(lastPracticedAt).getTime()
  if (ms < 864e5) return 'solid'
  if (ms < 1728e5) return 'hollow'
  return 'none'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [streak, setStreak] = useState<number | null>(null)
  const [lastPracticedAt, setLastPracticedAt] = useState<string | null>(null)
  const [activeStages, setActiveStages] =
    useState<ActiveStage[]>(DEFAULT_STAGES)
  const [hideTitle, setHideTitle] = useState(true)
  const [hideDifficulty, setHideDifficulty] = useState(true)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess)
      if (sess) {
        getStreak()
          .then(({ streak, last_practiced_at }) => {
            setStreak(streak)
            setLastPracticedAt(last_practiced_at)
          })
          .catch(() => {})
        getSettings()
          .then((s) => {
            setActiveStages(s.active_stages)
            setHideTitle(s.hide_title)
            setHideDifficulty(s.hide_difficulty)
          })
          .catch(() => {})
          .finally(() => setAuthReady(true))
      } else {
        setStreak(null)
        setLastPracticedAt(null)
        setActiveStages(DEFAULT_STAGES)
        setHideTitle(true)
        setHideDifficulty(true)
        setAuthReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const refreshStreak = useCallback(() => {
    recordStreak()
      .then(({ streak, last_practiced_at }) => {
        setStreak(streak)
        setLastPracticedAt(last_practiced_at)
      })
      .catch(() => {})
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthCtx.Provider
      value={{
        session,
        authReady,
        streak,
        streakStatus: computeStatus(lastPracticedAt),
        activeStages,
        hideTitle,
        hideDifficulty,
        signOut,
        refreshStreak,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd mobile && npm test -- auth-context`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add mobile/src/auth
git commit -m "feat(mobile): add Supabase client and AuthContext"
```

---

## Task 3: API client core and resource modules

**Files:**
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/api/problems.ts`
- Create: `mobile/src/api/settings.ts`
- Create: `mobile/src/api/streak.ts`
- Test: `mobile/src/api/client.test.ts`
- Test: `mobile/src/api/problems.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`Problem`, `ActiveStage`), `auth/supabase.ts`.
- Produces:
  - `client.ts`: `const API_URL: string`; `authHeaders(): Promise<Record<string,string>>`.
  - `problems.ts`: `getRandomProblem(): Promise<Problem>`; `getSmartPracticeProblem(activeStages: ActiveStage[], activeTopics: string[]): Promise<Problem>`.
  - `settings.ts`: `getSettings(): Promise<{ active_stages: ActiveStage[]; hide_title: boolean; hide_difficulty: boolean; active_topics: string[]; tour_done: boolean }>`.
  - `streak.ts`: `getStreak(): Promise<{ streak: number; last_practiced_at: string|null }>`; `recordStreak(): Promise<{ streak: number; last_practiced_at: string|null }>`.

- [x] **Step 1: Write the failing client test**

`mobile/src/api/client.test.ts`:
```ts
jest.mock('../auth/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: 'tok123' } },
      })),
    },
  },
}))

import { authHeaders } from './client'
import { supabase } from '../auth/supabase'

test('authHeaders returns Bearer header when a session exists', async () => {
  expect(await authHeaders()).toEqual({ Authorization: 'Bearer tok123' })
})

test('authHeaders returns empty object when anonymous', async () => {
  ;(supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({
    data: { session: null },
  })
  expect(await authHeaders()).toEqual({})
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- client`
Expected: FAIL — cannot find module `./client`.

- [x] **Step 3: Implement client.ts**

`mobile/src/api/client.ts`:
```ts
import { supabase } from '../auth/supabase'

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? ''

export async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- client`
Expected: PASS.

- [x] **Step 5: Write the failing problems test**

`mobile/src/api/problems.test.ts`:
```ts
jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

import { getRandomProblem, getSmartPracticeProblem } from './problems'

const problem = {
  id: 'p1', slug: 's', title: 'T', description: 'D',
  difficulty: 'Easy', topic_tags: [], leetcode_id: 1,
}

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => problem,
  })) as unknown as typeof fetch
})

test('getRandomProblem hits the random endpoint with auth header', async () => {
  const result = await getRandomProblem()
  expect(result).toEqual(problem)
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.test/api/problems/random',
    { headers: { Authorization: 'Bearer t' } },
  )
})

test('getSmartPracticeProblem encodes active stages and topics', async () => {
  await getSmartPracticeProblem(['pattern', 'tc_sc'], ['Array', 'Graph'])
  const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
  expect(url).toContain('/api/problems/smart?')
  expect(url).toContain('active_stages=pattern%2Ctc_sc')
  expect(url).toContain('active_topics=Array%2CGraph')
})
```

- [x] **Step 6: Run test to verify it fails**

Run: `cd mobile && npm test -- problems`
Expected: FAIL — cannot find module `./problems`.

- [x] **Step 7: Implement problems.ts**

`mobile/src/api/problems.ts`:
```ts
import type { Problem, ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getRandomProblem(): Promise<Problem> {
  const res = await fetch(`${API_URL}/api/problems/random`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to fetch problem: ${res.status}`)
  return res.json()
}

export async function getSmartPracticeProblem(
  activeStages: ActiveStage[],
  activeTopics: string[],
): Promise<Problem> {
  const params = new URLSearchParams()
  params.set('active_stages', activeStages.join(','))
  if (activeTopics.length) params.set('active_topics', activeTopics.join(','))
  const res = await fetch(
    `${API_URL}/api/problems/smart?${params.toString()}`,
    { headers: await authHeaders() },
  )
  if (!res.ok)
    throw new Error(`Failed to fetch smart practice problem: ${res.status}`)
  return res.json()
}
```

- [x] **Step 8: Implement settings.ts**

`mobile/src/api/settings.ts`:
```ts
import type { ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function getSettings(): Promise<{
  active_stages: ActiveStage[]
  hide_title: boolean
  hide_difficulty: boolean
  active_topics: string[]
  tour_done: boolean
}> {
  const res = await fetch(`${API_URL}/api/settings`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get settings: ${res.status}`)
  return res.json()
}
```

- [x] **Step 9: Implement streak.ts**

`mobile/src/api/streak.ts`:
```ts
import { API_URL, authHeaders } from './client'

export async function getStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to get streak: ${res.status}`)
  return res.json()
}

export async function recordStreak(): Promise<{
  streak: number
  last_practiced_at: string | null
}> {
  const res = await fetch(`${API_URL}/api/streak`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to record streak: ${res.status}`)
  return res.json()
}
```

- [x] **Step 10: Run all api tests**

Run: `cd mobile && npm test -- api`
Expected: PASS (client + problems).

- [x] **Step 11: Commit**

```bash
git add mobile/src/api
git commit -m "feat(mobile): add API client and problem/settings/streak modules"
```

---

## Task 4: SSE chat stream (`streamChat`)

**Files:**
- Create: `mobile/src/api/chat.ts`
- Test: `mobile/src/api/chat.test.ts`

**Interfaces:**
- Consumes: `types.ts` (`ChatMessage`, `Stage`, `ActiveStage`), `client.ts` (`API_URL`, `authHeaders`).
- Produces:
  - `chat.ts`: `streamChat(problemId, stage, activeStages, history, message, hintRequested, answerRequested, signal?): AsyncGenerator<{type:'token',content:string} | {type:'done',stage:Stage,message:string}>`.
  - Imports `fetch` from `expo/fetch` (NOT global) so the response body is streamable on native.

- [x] **Step 1: Write the failing chat SSE test**

`mobile/src/api/chat.test.ts`:
```ts
jest.mock('./client', () => ({
  API_URL: 'https://api.test',
  authHeaders: jest.fn(async () => ({ Authorization: 'Bearer t' })),
}))

const fetchMock = jest.fn()
jest.mock('expo/fetch', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

import { streamChat } from './chat'

function streamFrom(chunks: string[]) {
  const enc = new TextEncoder()
  let i = 0
  return {
    getReader() {
      return {
        read: async () =>
          i < chunks.length
            ? { done: false, value: enc.encode(chunks[i++]) }
            : { done: true, value: undefined },
      }
    },
  }
}

test('yields tokens then done, splitting across chunk boundaries', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    body: streamFrom([
      'event: token\ndata: {"content":"Hel',
      'lo"}\n\nevent: token\ndata: {"content":" world"}\n\n',
      'event: done\ndata: {"stage":"algorithm","message":"done!"}\n\n',
    ]),
  })

  const events = []
  for await (const e of streamChat('p1', 'pattern', ['pattern', 'algorithm'], [], 'hi', false, false)) {
    events.push(e)
  }

  expect(events).toEqual([
    { type: 'token', content: 'Hello' },
    { type: 'token', content: ' world' },
    { type: 'done', stage: 'algorithm', message: 'done!' },
  ])
})

test('throws when the server emits an error event', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    body: streamFrom(['event: error\ndata: {}\n\n']),
  })
  await expect(async () => {
    for await (const _ of streamChat('p1', 'pattern', ['pattern'], [], 'hi', false, false)) {
      void _
    }
  }).rejects.toThrow()
})

test('sends the correct request body', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    body: streamFrom(['event: done\ndata: {"stage":"complete","message":"m"}\n\n']),
  })
  for await (const _ of streamChat('p1', 'pattern', ['pattern'], [{ role: 'user', content: 'prev' }], 'hi', true, false)) {
    void _
  }
  const [, init] = fetchMock.mock.calls[0]
  const body = JSON.parse(init.body)
  expect(body).toEqual({
    problem_id: 'p1',
    stage: 'pattern',
    active_stages: ['pattern'],
    history: [{ role: 'user', content: 'prev' }],
    message: 'hi',
    hint_requested: true,
    answer_requested: false,
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- chat`
Expected: FAIL — cannot find module `./chat`.

- [x] **Step 3: Implement chat.ts**

`mobile/src/api/chat.ts`:
```ts
import { fetch } from 'expo/fetch'
import type { ChatMessage, Stage, ActiveStage } from '../types'
import { API_URL, authHeaders } from './client'

export async function* streamChat(
  problemId: string,
  stage: Stage,
  activeStages: ActiveStage[],
  history: ChatMessage[],
  message: string,
  hintRequested: boolean,
  answerRequested: boolean,
  signal?: AbortSignal,
): AsyncGenerator<
  | { type: 'token'; content: string }
  | { type: 'done'; stage: Stage; message: string }
> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      problem_id: problemId,
      stage,
      active_stages: activeStages,
      history,
      message,
      hint_requested: hintRequested,
      answer_requested: answerRequested,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Chat request failed: ${res.status}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop()!
    for (const event of events) {
      const lines = event.trim().split('\n')
      const type = lines.find((l) => l.startsWith('event: '))?.slice(7)
      const data = lines.find((l) => l.startsWith('data: '))?.slice(6)
      if (!type || !data) continue
      const parsed = JSON.parse(data)
      if (type === 'token') yield { type: 'token', content: parsed.content }
      else if (type === 'done') yield { type: 'done', ...parsed }
      else if (type === 'error') throw new Error('LLM evaluation failed')
    }
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- chat`
Expected: PASS (all three tests).

- [x] **Step 5: Commit**

```bash
git add mobile/src/api/chat.ts mobile/src/api/chat.test.ts
git commit -m "feat(mobile): add SSE chat stream via expo/fetch"
```

---

## Task 5: `usePracticeSession` state machine

**Files:**
- Create: `mobile/src/practice/stage-banner-text.ts`
- Create: `mobile/src/practice/use-practice-session.ts`
- Test: `mobile/src/practice/stage-banner-text.test.ts`
- Test: `mobile/src/practice/use-practice-session.test.tsx`

**Interfaces:**
- Consumes: `types.ts`, `api/chat.ts` (`streamChat`), `api/problems.ts` (`getRandomProblem`, `getSmartPracticeProblem`).
- Produces:
  - `stage-banner-text.ts`: `getStageBanner(stage: ActiveStage, sessionActiveStages: ActiveStage[]): string`; `STAGE_PLACEHOLDER: Record<ActiveStage,string>`.
  - `use-practice-session.ts`: `usePracticeSession(opts: { activeStages: ActiveStage[]; activeTopics: string[]; onComplete: () => void }): { problem: Problem|null; history: ChatMessage[]; stage: Stage; streamingMessage: string; loading: boolean; error: string|null; sessionActiveStages: ActiveStage[]; loadRandom: () => Promise<void>; loadSmart: () => Promise<void>; submit: (message: string, opts?: {hint?: boolean; answer?: boolean}) => Promise<void> }`.
  - `onComplete` is called when a stream resolves with `stage === 'complete'` (the screen wires this to `refreshStreak` only when signed in).

- [x] **Step 1: Write the failing stage-banner test**

`mobile/src/practice/stage-banner-text.test.ts`:
```ts
import { getStageBanner } from './stage-banner-text'

test('shows base prompt when no prior stage is active', () => {
  expect(getStageBanner('pattern', ['pattern', 'tc_sc'])).toBe(
    'What pattern does this problem use?',
  )
})

test('prefixes prior-stage checkmark for algorithm after pattern', () => {
  expect(getStageBanner('algorithm', ['pattern', 'algorithm'])).toBe(
    'Pattern ✓ — Describe your algorithm',
  )
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- stage-banner-text`
Expected: FAIL — cannot find module.

- [x] **Step 3: Implement stage-banner-text.ts**

Ported from `frontend/src/components/ChatView.tsx`. `mobile/src/practice/stage-banner-text.ts`:
```ts
import type { ActiveStage } from '../types'

const stageBannerBase: Record<ActiveStage, string> = {
  edge_cases: 'What edge cases does this problem have?',
  brute_force: 'What is the brute force approach?',
  pattern: 'What pattern does this problem use?',
  algorithm: 'Describe your algorithm',
  tc_sc: 'Describe the time and space complexity',
}

const stagePrev: Partial<Record<ActiveStage, ActiveStage>> = {
  algorithm: 'pattern',
  tc_sc: 'algorithm',
}

const stageLabel: Partial<Record<ActiveStage, string>> = {
  pattern: 'Pattern',
  algorithm: 'Algorithm',
}

export const STAGE_PLACEHOLDER: Record<ActiveStage, string> = {
  edge_cases: 'e.g. empty input, single element, negative numbers, overflow…',
  brute_force: 'Describe the naive solution…',
  pattern: 'e.g. sliding window, BFS/DFS, dynamic programming…',
  algorithm: 'Describe your algorithm…',
  tc_sc: 'State your time and space complexity…',
}

export function getStageBanner(
  stage: ActiveStage,
  sessionActiveStages: ActiveStage[],
): string {
  const prev = stagePrev[stage]
  if (prev && sessionActiveStages.includes(prev)) {
    return `${stageLabel[prev]} ✓ — ${stageBannerBase[stage]}`
  }
  return stageBannerBase[stage]
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- stage-banner-text`
Expected: PASS.

- [x] **Step 5: Write the failing session-hook test**

`mobile/src/practice/use-practice-session.test.tsx`:
```tsx
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { usePracticeSession } from './use-practice-session'

const problem = {
  id: 'p1', slug: 's', title: 'T', description: 'D',
  difficulty: 'Easy' as const, topic_tags: [], leetcode_id: 1,
}

jest.mock('../api/problems', () => ({
  getRandomProblem: jest.fn(async () => problem),
  getSmartPracticeProblem: jest.fn(async () => problem),
}))

const streamScript: Array<{ type: string; [k: string]: unknown }> = []
jest.mock('../api/chat', () => ({
  streamChat: async function* () {
    for (const e of streamScript) yield e
  },
}))

beforeEach(() => {
  streamScript.length = 0
})

test('loadRandom sets the problem and starts at the first active stage', async () => {
  const { result } = renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: [],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  expect(result.current.problem?.id).toBe('p1')
  expect(result.current.stage).toBe('pattern')
})

test('submit streams tokens then advances stage', async () => {
  streamScript.push(
    { type: 'token', content: 'Good ' },
    { type: 'token', content: 'job' },
    { type: 'done', stage: 'algorithm', message: 'Good job' },
  )
  const { result } = renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern', 'algorithm'],
      activeTopics: [],
      onComplete: jest.fn(),
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('sliding window')
  })
  expect(result.current.stage).toBe('algorithm')
  expect(result.current.history).toEqual([
    { role: 'user', content: 'sliding window', marker: undefined },
    { role: 'assistant', content: 'Good job' },
  ])
})

test('calls onComplete when stage resolves to complete', async () => {
  streamScript.push({ type: 'done', stage: 'complete', message: 'Nice' })
  const onComplete = jest.fn()
  const { result } = renderHook(() =>
    usePracticeSession({
      activeStages: ['pattern'],
      activeTopics: [],
      onComplete,
    }),
  )
  await act(async () => {
    await result.current.loadRandom()
  })
  await act(async () => {
    await result.current.submit('answer')
  })
  await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
  expect(result.current.stage).toBe('complete')
})
```

- [x] **Step 6: Run test to verify it fails**

Run: `cd mobile && npm test -- use-practice-session`
Expected: FAIL — cannot find module.

- [x] **Step 7: Implement use-practice-session.ts**

`mobile/src/practice/use-practice-session.ts`:
```ts
import { useCallback, useRef, useState } from 'react'
import type { Problem, ChatMessage, Stage, ActiveStage } from '../types'
import { getRandomProblem, getSmartPracticeProblem } from '../api/problems'
import { streamChat } from '../api/chat'

interface Opts {
  activeStages: ActiveStage[]
  activeTopics: string[]
  onComplete: () => void
}

export function usePracticeSession({
  activeStages,
  activeTopics,
  onComplete,
}: Opts) {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [stage, setStage] = useState<Stage>(activeStages[0] ?? 'pattern')
  const [streamingMessage, setStreamingMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sessionStagesRef = useRef<ActiveStage[]>(activeStages)
  const abortRef = useRef<AbortController | null>(null)

  const startSession = useCallback(
    (p: Problem) => {
      abortRef.current?.abort()
      sessionStagesRef.current = activeStages
      setProblem(p)
      setHistory([])
      setStage(activeStages[0] ?? 'pattern')
      setStreamingMessage('')
      setError(null)
    },
    [activeStages],
  )

  const loadRandom = useCallback(async () => {
    setError(null)
    try {
      startSession(await getRandomProblem())
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession])

  const loadSmart = useCallback(async () => {
    setError(null)
    try {
      startSession(await getSmartPracticeProblem(activeStages, activeTopics))
    } catch {
      setError('Failed to load a problem. Is the backend running?')
    }
  }, [startSession, activeStages, activeTopics])

  const submit = useCallback(
    async (message: string, opts?: { hint?: boolean; answer?: boolean }) => {
      if (!problem) return
      const hint = opts?.hint ?? false
      const answer = opts?.answer ?? false

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(null)
      setStreamingMessage('')

      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        marker: hint ? 'hint' : answer ? 'answer' : undefined,
      }
      const priorHistory = history
      setHistory([...priorHistory, userMsg])

      try {
        let accumulated = ''
        for await (const event of streamChat(
          problem.id,
          stage,
          sessionStagesRef.current,
          priorHistory,
          message,
          hint,
          answer,
          controller.signal,
        )) {
          if (event.type === 'token') {
            accumulated += event.content
            setStreamingMessage(accumulated)
          } else if (event.type === 'done') {
            setHistory([
              ...priorHistory,
              userMsg,
              { role: 'assistant', content: event.message },
            ])
            setStage(event.stage)
            setStreamingMessage('')
            if (event.stage === 'complete') onComplete()
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        setError('Something went wrong. Please try again.')
      } finally {
        setLoading(false)
        setStreamingMessage('')
      }
    },
    [problem, history, stage, onComplete],
  )

  return {
    problem,
    history,
    stage,
    streamingMessage,
    loading,
    error,
    sessionActiveStages: sessionStagesRef.current,
    loadRandom,
    loadSmart,
    submit,
  }
}
```

- [x] **Step 8: Run test to verify it passes**

Run: `cd mobile && npm test -- use-practice-session`
Expected: PASS (all three tests).

- [x] **Step 9: Commit**

```bash
git add mobile/src/practice
git commit -m "feat(mobile): add usePracticeSession state machine and stage banner"
```

---

## Task 6: Presentational components

**Files:**
- Create: `mobile/src/components/markdown.tsx`
- Create: `mobile/src/components/difficulty-badge.tsx`
- Create: `mobile/src/components/problem-view.tsx`
- Create: `mobile/src/components/message-bubble.tsx`
- Create: `mobile/src/components/chat-thread.tsx`
- Create: `mobile/src/components/stage-banner.tsx`
- Create: `mobile/src/components/input-bar.tsx`
- Create: `mobile/src/components/completion-footer.tsx`
- Test: `mobile/src/components/difficulty-badge.test.tsx`
- Test: `mobile/src/components/message-bubble.test.tsx`

**Interfaces:**
- Consumes: `theme/theme-context.tsx` (`useTheme`), `types.ts`, `practice/stage-banner-text.ts`.
- Produces:
  - `markdown.tsx`: `Markdown({ content }: { content: string })` — wraps `react-native-markdown-display` with themed styles + `codeBg`.
  - `difficulty-badge.tsx`: `DifficultyBadge({ difficulty }: { difficulty: 'Easy'|'Medium'|'Hard' })`.
  - `problem-view.tsx`: `ProblemView({ problem, hideTitle, hideDifficulty }: { problem: Problem; hideTitle: boolean; hideDifficulty: boolean })`.
  - `message-bubble.tsx`: `MessageBubble({ role, content }: { role: 'user'|'assistant'; content: string })` — user = plain text, assistant = Markdown.
  - `chat-thread.tsx`: `ChatThread({ history, loading, streamingMessage, error }: { history: ChatMessage[]; loading: boolean; streamingMessage: string; error: string|null })`.
  - `stage-banner.tsx`: `StageBanner({ stage, sessionActiveStages }: { stage: Stage; sessionActiveStages: ActiveStage[] })`.
  - `input-bar.tsx`: `InputBar({ disabled, onSubmit, onHint, onAnswer, placeholder }: { disabled: boolean; onSubmit: (text: string) => void; onHint: () => void; onAnswer: () => void; placeholder: string })`.
  - `completion-footer.tsx`: `CompletionFooter({ onNext, onSmart }: { onNext: () => void; onSmart: () => void })`.

- [x] **Step 1: Write the failing difficulty-badge test**

`mobile/src/components/difficulty-badge.test.tsx`:
```tsx
import { render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { DifficultyBadge } from './difficulty-badge'

test('renders the difficulty label', () => {
  const { getByText } = render(
    <ThemeProvider>
      <DifficultyBadge difficulty="Medium" />
    </ThemeProvider>,
  )
  expect(getByText('Medium')).toBeTruthy()
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- difficulty-badge`
Expected: FAIL — cannot find module.

- [x] **Step 3: Implement difficulty-badge.tsx**

`mobile/src/components/difficulty-badge.tsx`:
```tsx
import { Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

const key = { Easy: 'easy', Medium: 'medium', Hard: 'hard' } as const

export function DifficultyBadge({
  difficulty,
}: {
  difficulty: 'Easy' | 'Medium' | 'Hard'
}) {
  const theme = useTheme()
  return (
    <Text style={{ color: theme[key[difficulty]], fontWeight: '600', fontSize: 13 }}>
      {difficulty}
    </Text>
  )
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- difficulty-badge`
Expected: PASS.

- [x] **Step 5: Implement markdown.tsx**

`mobile/src/components/markdown.tsx`:
```tsx
import MarkdownDisplay from 'react-native-markdown-display'
import { useTheme } from '../theme/theme-context'

export function Markdown({ content }: { content: string }) {
  const theme = useTheme()
  return (
    <MarkdownDisplay
      style={{
        body: { color: theme.secondaryForeground, fontSize: 14, lineHeight: 21 },
        code_inline: {
          backgroundColor: theme.codeBg,
          color: theme.secondaryForeground,
          borderRadius: 4,
          paddingHorizontal: 4,
        },
        code_block: { backgroundColor: theme.codeBg, color: theme.secondaryForeground },
        fence: { backgroundColor: theme.codeBg, color: theme.secondaryForeground },
        bullet_list: { color: theme.secondaryForeground },
        heading1: { color: theme.secondaryForeground },
        heading2: { color: theme.secondaryForeground },
      }}
    >
      {content}
    </MarkdownDisplay>
  )
}
```

- [x] **Step 6: Write the failing message-bubble test**

`mobile/src/components/message-bubble.test.tsx`:
```tsx
import { render } from '@testing-library/react-native'
import { ThemeProvider } from '../theme/theme-context'
import { MessageBubble } from './message-bubble'

test('renders user content as plain text', () => {
  const { getByText } = render(
    <ThemeProvider>
      <MessageBubble role="user" content="my answer" />
    </ThemeProvider>,
  )
  expect(getByText('my answer')).toBeTruthy()
})

test('renders assistant content', () => {
  const { getByText } = render(
    <ThemeProvider>
      <MessageBubble role="assistant" content="feedback here" />
    </ThemeProvider>,
  )
  expect(getByText('feedback here')).toBeTruthy()
})
```

- [x] **Step 7: Run test to verify it fails**

Run: `cd mobile && npm test -- message-bubble`
Expected: FAIL — cannot find module.

- [x] **Step 8: Implement message-bubble.tsx**

`mobile/src/components/message-bubble.tsx`:
```tsx
import { View, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'
import { Markdown } from './markdown'

export function MessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant'
  content: string
}) {
  const theme = useTheme()
  const isUser = role === 'user'
  return (
    <View
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        backgroundColor: isUser ? theme.primary : theme.secondary,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      {isUser ? (
        <Text style={{ color: theme.primaryForeground, fontSize: 14, lineHeight: 21 }}>
          {content}
        </Text>
      ) : (
        <Markdown content={content} />
      )}
    </View>
  )
}
```

- [x] **Step 9: Run test to verify it passes**

Run: `cd mobile && npm test -- message-bubble`
Expected: PASS.

- [x] **Step 10: Implement stage-banner.tsx**

`mobile/src/components/stage-banner.tsx`:
```tsx
import { View, Text } from 'react-native'
import type { Stage, ActiveStage } from '../types'
import { useTheme } from '../theme/theme-context'
import { getStageBanner } from '../practice/stage-banner-text'

export function StageBanner({
  stage,
  sessionActiveStages,
}: {
  stage: Stage
  sessionActiveStages: ActiveStage[]
}) {
  const theme = useTheme()
  const complete = stage === 'complete'
  return (
    <View
      style={{
        backgroundColor: complete ? 'rgba(34,197,94,0.12)' : theme.muted,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: complete ? '#16a34a' : theme.foreground, fontWeight: '600', fontSize: 13 }}>
        {complete
          ? 'Nice work! Review your session below.'
          : getStageBanner(stage, sessionActiveStages)}
      </Text>
    </View>
  )
}
```

- [x] **Step 11: Implement problem-view.tsx**

`mobile/src/components/problem-view.tsx`:
```tsx
import { View, Text } from 'react-native'
import type { Problem } from '../types'
import { useTheme } from '../theme/theme-context'
import { DifficultyBadge } from './difficulty-badge'
import { Markdown } from './markdown'

export function ProblemView({
  problem,
  hideTitle,
  hideDifficulty,
}: {
  problem: Problem
  hideTitle: boolean
  hideDifficulty: boolean
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderBottomColor: theme.border,
        borderBottomWidth: 1,
        padding: 16,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.foreground, fontSize: 18, fontWeight: '700', flexShrink: 1 }}>
          {hideTitle ? 'Hidden problem' : problem.title}
        </Text>
        {!hideDifficulty && <DifficultyBadge difficulty={problem.difficulty} />}
      </View>
      <Markdown content={problem.description} />
    </View>
  )
}
```

- [x] **Step 12: Implement chat-thread.tsx**

`mobile/src/components/chat-thread.tsx`:
```tsx
import { View, Text } from 'react-native'
import type { ChatMessage } from '../types'
import { useTheme } from '../theme/theme-context'
import { MessageBubble } from './message-bubble'

export function ChatThread({
  history,
  loading,
  streamingMessage,
  error,
}: {
  history: ChatMessage[]
  loading: boolean
  streamingMessage: string
  error: string | null
}) {
  const theme = useTheme()
  return (
    <View style={{ padding: 16, gap: 0 }}>
      {history.map((m, i) => (
        <MessageBubble key={`${i}-${m.role}`} role={m.role} content={m.content} />
      ))}
      {loading && !streamingMessage && (
        <Text style={{ color: theme.mutedForeground, fontStyle: 'italic', fontSize: 12 }}>
          Thinking…
        </Text>
      )}
      {!!streamingMessage && (
        <MessageBubble role="assistant" content={streamingMessage} />
      )}
      {!!error && (
        <Text style={{ color: theme.destructive, fontSize: 12 }}>{error}</Text>
      )}
    </View>
  )
}
```

- [x] **Step 13: Implement input-bar.tsx**

`mobile/src/components/input-bar.tsx`:
```tsx
import { useState } from 'react'
import { View, TextInput, Pressable, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function InputBar({
  disabled,
  onSubmit,
  onHint,
  onAnswer,
  placeholder,
}: {
  disabled: boolean
  onSubmit: (text: string) => void
  onHint: () => void
  onAnswer: () => void
  placeholder: string
}) {
  const theme = useTheme()
  const [text, setText] = useState('')

  const send = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    setText('')
    onSubmit(trimmed)
  }

  return (
    <View style={{ borderTopColor: theme.border, borderTopWidth: 1, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.mutedForeground}
          multiline
          editable={!disabled}
          style={{
            flex: 1,
            minHeight: 64,
            color: theme.foreground,
            backgroundColor: theme.secondary,
            borderRadius: 10,
            padding: 10,
            fontSize: 14,
          }}
        />
        <Pressable
          onPress={send}
          disabled={disabled || !text.trim()}
          style={{
            backgroundColor: theme.primary,
            opacity: disabled || !text.trim() ? 0.5 : 1,
            borderRadius: 10,
            paddingHorizontal: 16,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>Send</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={onHint} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
          <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Give me a hint</Text>
        </Pressable>
        <Pressable onPress={onAnswer} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
          <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Give me the answer</Text>
        </Pressable>
      </View>
    </View>
  )
}
```

- [x] **Step 14: Implement completion-footer.tsx**

`mobile/src/components/completion-footer.tsx`:
```tsx
import { View, Pressable, Text } from 'react-native'
import { useTheme } from '../theme/theme-context'

export function CompletionFooter({
  onNext,
  onSmart,
}: {
  onNext: () => void
  onSmart: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 8, borderTopColor: theme.border, borderTopWidth: 1, padding: 12 }}>
      <Pressable
        onPress={onNext}
        style={{ backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>Next Problem</Text>
      </Pressable>
      <Pressable
        onPress={onSmart}
        style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Text style={{ color: theme.foreground, fontWeight: '600' }}>Smart Practice</Text>
      </Pressable>
    </View>
  )
}
```

- [x] **Step 15: Run component tests**

Run: `cd mobile && npm test -- components`
Expected: PASS (difficulty-badge + message-bubble).

- [x] **Step 16: Commit**

```bash
git add mobile/src/components
git commit -m "feat(mobile): add practice UI components"
```

---

## Task 7: Routes — root layout, Practice screen, sign-in, account

**Files:**
- Modify/Create: `mobile/app/_layout.tsx`
- Create: `mobile/app/index.tsx`
- Create: `mobile/app/sign-in.tsx`
- Create: `mobile/app/account.tsx`
- Delete: any default starter routes the template created under `mobile/app/` that are unused (e.g. `app/(tabs)/`), keeping only the four files above.

**Interfaces:**
- Consumes: `auth/auth-context.tsx` (`AuthProvider`, `useAuth`), `theme/theme-context.tsx` (`ThemeProvider`, `useTheme`), `practice/use-practice-session.ts`, `practice/stage-banner-text.ts` (`STAGE_PLACEHOLDER`), all `components/*`, `auth/supabase.ts` (`supabase` for sign-in).
- Produces: the running app (no exported API).

- [x] **Step 1: Implement the root layout**

Replace `mobile/app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'
import { AuthProvider } from '../src/auth/auth-context'
import { ThemeProvider } from '../src/theme/theme-context'

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ title: 'leetgame' }} />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', title: 'Sign in' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  )
}
```

- [x] **Step 2: Remove unused starter routes**

Delete the template's default screens so only `_layout.tsx`, `index.tsx`, `sign-in.tsx`, `account.tsx` remain under `mobile/app/`:
```bash
cd mobile
rm -rf app/\(tabs\) app/+not-found.tsx app/modal.tsx 2>/dev/null || true
```
(Only delete files that exist; keep `_layout.tsx`.)

- [x] **Step 3: Implement the Practice screen**

`mobile/app/index.tsx`:
```tsx
import { useEffect } from 'react'
import { ScrollView, View, Pressable, Text, ActivityIndicator } from 'react-native'
import { Link } from 'expo-router'
import { useAuth } from '../src/auth/auth-context'
import { useTheme } from '../src/theme/theme-context'
import { usePracticeSession } from '../src/practice/use-practice-session'
import { STAGE_PLACEHOLDER } from '../src/practice/stage-banner-text'
import { ProblemView } from '../src/components/problem-view'
import { StageBanner } from '../src/components/stage-banner'
import { ChatThread } from '../src/components/chat-thread'
import { InputBar } from '../src/components/input-bar'
import { CompletionFooter } from '../src/components/completion-footer'
import { NEETCODE_TOPICS, type ActiveStage } from '../src/types'

export default function PracticeScreen() {
  const theme = useTheme()
  const {
    session, authReady, streak, streakStatus,
    activeStages, hideTitle, hideDifficulty, refreshStreak,
  } = useAuth()

  const session_ = usePracticeSession({
    activeStages,
    activeTopics: NEETCODE_TOPICS,
    onComplete: () => {
      if (session) refreshStreak()
    },
  })

  useEffect(() => {
    if (authReady && !session_.problem) void session_.loadRandom()
  }, [authReady]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authReady || !session_.problem) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        {session_.error ? (
          <Text style={{ color: theme.destructive, padding: 24, textAlign: 'center' }}>
            {session_.error}
          </Text>
        ) : (
          <ActivityIndicator color={theme.primary} />
        )}
      </View>
    )
  }

  const isComplete = session_.stage === 'complete'

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, padding: 8 }}>
        {session && streak !== null && (
          <Text style={{ color: streakStatus === 'solid' ? theme.primary : theme.mutedForeground }}>
            🔥 {streak}
          </Text>
        )}
        <Link href="/account" asChild>
          <Pressable>
            <Text style={{ color: theme.primary, fontWeight: '600' }}>
              {session ? 'Account' : 'Sign in'}
            </Text>
          </Pressable>
        </Link>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <ProblemView
          problem={session_.problem}
          hideTitle={hideTitle}
          hideDifficulty={hideDifficulty}
        />
        <StageBanner stage={session_.stage} sessionActiveStages={session_.sessionActiveStages} />
        <ChatThread
          history={session_.history}
          loading={session_.loading}
          streamingMessage={session_.streamingMessage}
          error={session_.error}
        />
      </ScrollView>

      {isComplete ? (
        <CompletionFooter
          onNext={() => void session_.loadRandom()}
          onSmart={() => void session_.loadSmart()}
        />
      ) : (
        <InputBar
          disabled={session_.loading}
          placeholder={STAGE_PLACEHOLDER[session_.stage as ActiveStage] ?? 'Describe your approach…'}
          onSubmit={(text) => void session_.submit(text)}
          onHint={() => void session_.submit('Give me a hint', { hint: true })}
          onAnswer={() => void session_.submit('Give me the answer', { answer: true })}
        />
      )}
    </View>
  )
}
```

- [x] **Step 4: Implement the sign-in screen**

`mobile/app/sign-in.tsx`:
```tsx
import { useState } from 'react'
import { View, TextInput, Pressable, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../src/auth/supabase'
import { useTheme } from '../src/theme/theme-context'

export default function SignInScreen() {
  const theme = useTheme()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else router.back()
  }

  const input = {
    color: theme.foreground,
    backgroundColor: theme.secondary,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  } as const

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 12 }}>
      <TextInput
        style={input}
        placeholder="Email"
        placeholderTextColor={theme.mutedForeground}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={input}
        placeholder="Password"
        placeholderTextColor={theme.mutedForeground}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {!!error && <Text style={{ color: theme.destructive }}>{error}</Text>}
      <Pressable
        onPress={submit}
        disabled={busy}
        style={{ backgroundColor: theme.primary, opacity: busy ? 0.6 : 1, borderRadius: 10, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Text>
      </Pressable>
    </View>
  )
}
```

- [x] **Step 5: Implement the account screen**

`mobile/app/account.tsx`:
```tsx
import { View, Text, Pressable } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { useAuth } from '../src/auth/auth-context'
import { useTheme } from '../src/theme/theme-context'

export default function AccountScreen() {
  const theme = useTheme()
  const router = useRouter()
  const { session, streak, signOut } = useAuth()

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 12 }}>
        <Text style={{ color: theme.foreground, fontSize: 16 }}>
          You are practicing anonymously. Sign in to track your streak and progress.
        </Text>
        <Link href="/sign-in" asChild>
          <Pressable style={{ backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ color: theme.primaryForeground, fontWeight: '600' }}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 16, gap: 12 }}>
      <Text style={{ color: theme.foreground, fontSize: 16 }}>{session.user.email}</Text>
      <Text style={{ color: theme.mutedForeground }}>Streak: {streak ?? 0}</Text>
      <Pressable
        onPress={async () => {
          await signOut()
          router.back()
        }}
        style={{ borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center' }}
      >
        <Text style={{ color: theme.destructive, fontWeight: '600' }}>Sign out</Text>
      </Pressable>
    </View>
  )
}
```

- [x] **Step 6: Typecheck and run the full test suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: no type errors; all tests PASS.

- [x] **Step 7: Commit**

```bash
git add mobile/app
git commit -m "feat(mobile): wire Practice, sign-in, and account routes"
```

---

## Task 8: Manual end-to-end verification on iOS simulator

**Files:** none (verification only).

**Interfaces:** Consumes the full app. Uses the `rn-agentic-loop` / metro-mcp / ios-simulator tooling.

- [x] **Step 1: Confirm env is set**

Verify `mobile/.env` has real `EXPO_PUBLIC_API_URL` (a reachable backend), `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If the backend is local, ensure the simulator can reach it (use the machine's LAN IP, not `localhost`, if needed).

- [x] **Step 2: Launch the app**

Run: `cd mobile && npx expo start --ios`. Wait for the bundle to load in the iOS simulator.

- [x] **Step 3: Verify anonymous practice loop (receipt-driven)**

Declare success receipt up front: *a problem renders, submitting an explanation streams assistant feedback token-by-token, and the stage banner advances.*
- Confirm a problem card renders (title shows "Hidden problem" by default since `hideTitle` defaults true; description renders as markdown).
- Type an explanation in the input and tap Send.
- Observe "Thinking…" then streaming text appearing incrementally in an assistant bubble (proves `expo/fetch` streaming works on device).
- Confirm the stage banner updates to the next stage (e.g. "Pattern ✓ — Describe your algorithm").
- Prove it with runtime state via metro-mcp (component tree / logs), not a screenshot alone.

- [x] **Step 4: Verify completion + Next/Smart Practice**

Advance through stages (or use "Give me the answer" to move faster) until the banner reads "Nice work!". Confirm the CompletionFooter shows **Next Problem** and **Smart Practice**, and that tapping **Next Problem** loads a fresh problem and resets the thread.

- [x] **Step 5: Verify sign-in + streak**

Open Account → Sign in, enter valid Supabase credentials (use the same dev account as the web app). Confirm sign-in succeeds, the header shows the 🔥 streak, and completing a session increments/sets the streak (proves authed `/api/chat`, `/api/streak`, and `/api/settings` work). Confirm signed-in settings apply (e.g. title/difficulty visibility per the account's saved settings).

- [x] **Step 6: Document the result**

Note any deviations. If all receipts are met, the v1 core loop is verified end-to-end.

---

## Notes for the implementer

- **`expo/fetch` vs global fetch:** Only `chat.ts` needs `expo/fetch` (for streaming). The other API modules use the global `fetch` (fine for non-streaming JSON). Do not switch them.
- **`TextDecoder`/`TextEncoder`** are available globally in modern Expo runtimes; the chat test uses `TextEncoder` to build fixture chunks.
- **Backend canonical-order constraint:** `activeStages` from settings/defaults are already canonical-ordered. Never reorder them before sending.
- **No message queue in v1:** input is disabled while `loading`. Do not add the web's queue behavior.
- **Markdown renderer:** if `react-native-markdown-display` shows compatibility issues on the installed Expo SDK, swap to `react-native-marked` — keep the `Markdown` wrapper's props identical so callers don't change.

---

## Task 8 verification results (2026-07-05)

Verified end-to-end on iOS Simulator (iPhone 17 Pro, Expo Go 56.0.3, SDK 56) against
`https://leetgame-backend.onrender.com`, via metro-mcp runtime receipts (fiber tree /
component props / network log), not screenshots. All receipts PASS:

- **Launch:** Practice screen mounted with a real problem (`ProblemView.problem`
  populated); anonymous defaults applied (`hideTitle`/`hideDifficulty` true).
- **Anonymous chat + SSE:** `POST /api/chat → 200` (`text/event-stream`); captured
  response body shows multiple `event: token` frames + `event: done`; assembled
  history message exactly matches the `done` message. Request carried no
  `Authorization` header.
- **Stage machine:** banner faithfully tracked backend-returned stages
  (`pattern → tc_sc → complete`, including a backend no-advance follow-up turn).
- **Completion:** `CompletionFooter` mounted at `complete`; **Next Problem** fired
  `GET /api/problems/random → 200` and reset history/stage; **Smart Practice** fired
  `GET /api/problems/smart` with canonical `active_stages`/`active_topics` → 200.
- **Sign-in + streak:** Supabase `POST /auth/v1/token?grant_type=password → 200`
  (dev account), auto-fetched `GET /api/settings → 200` + `GET /api/streak → 200`,
  header shows 🔥 streak; completing a signed-in session fired
  `POST /api/streak → 200` and the header streak incremented 1 → 2.

Deviation notes: none functional. (Expo Go's recommended-version download can
time out on `expo start --ios`; workaround is `expo start` + opening
`exp://127.0.0.1:8081` via `simctl openurl`.)
