# Mission Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public-facing Mission page explaining why leetgame exists, accessible from a new navbar button.

**Architecture:** Four files change: `View` type gains `'mission'`, a new `MissionPage` component holds all content, `NavBar` gets a Mission button (always visible, not auth-gated), and `App.tsx` renders the page when `view === 'mission'`. No backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4, existing design system (CSS variables, Button component)

---

### Task 1: Add `'mission'` to View type and create MissionPage component

**Files:**
- Modify: `frontend/src/types.ts` (line 40)
- Create: `frontend/src/components/MissionPage.tsx`

- [ ] **Step 1: Add `'mission'` to the View type**

In `frontend/src/types.ts`, change line 40 from:

```ts
export type View = 'practice' | 'search' | 'stats'
```

to:

```ts
export type View = 'practice' | 'search' | 'stats' | 'mission'
```

- [ ] **Step 2: Create MissionPage.tsx**

Create `frontend/src/components/MissionPage.tsx` with this content:

```tsx
export function MissionPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Why I built leetgame</h1>
        <p className="text-muted-foreground mb-8">
          A different way to practice algorithms — no IDE, no typing, just thinking out loud.
        </p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Writing code is a crutch</h2>
          <p className="text-sm leading-relaxed mb-3">
            When you practice by writing code, you can get away with half-understanding the problem. You type something, run it, tweak it, and eventually it passes. But you never had to fully articulate what you were doing or why. That gap doesn't show up until an interview, when someone asks you to explain your approach and you realize you can't.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame removes the crutch. There's no code to write — just a problem and a prompt to describe your approach in plain English. If you can explain it clearly, you understand it. If you can't, you don't. It's a harder test, and a more honest one.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Pattern recognition is the actual skill</h2>
          <p className="text-sm leading-relaxed mb-3">
            Most LeetCode problems aren't novel puzzles. They're applications of a small set of patterns — sliding window, BFS, dynamic programming, two pointers. Once you recognize which pattern applies, the rest is mechanics.
          </p>
          <p className="text-sm leading-relaxed">
            The part most people skip is drilling recognition itself. They memorize solutions, not patterns. leetgame focuses on that recognition step in isolation — see the problem, name the pattern, explain why it fits — so when you encounter something new, you're identifying the approach before you've even thought about code.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Practice should fit into your life</h2>
          <p className="text-sm leading-relaxed mb-3">
            A coding environment needs a laptop, a quiet space, and a chunk of uninterrupted time. That's a high bar. Most days, the conditions are never quite right, so you don't practice.
          </p>
          <p className="text-sm leading-relaxed">
            leetgame works on your phone, takes a few minutes per problem, and fits into dead time — a commute, a lunch break, five minutes between meetings. Lower friction means you actually practice instead of waiting for the perfect conditions that never come.
          </p>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the build passes**

Run from `frontend/`:
```bash
npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/components/MissionPage.tsx
git commit -m "feat: add MissionPage component and mission view type"
```

---

### Task 2: Wire Mission into NavBar and App

**Files:**
- Modify: `frontend/src/components/NavBar.tsx`
- Modify: `frontend/src/App.tsx`

**Context:**

`NavBar.tsx` currently renders Practice and Search via a map, then Stats conditionally on `session`. Mission should be added after Search and before Stats, always visible (not auth-gated), using the same ghost/secondary button pattern:

```tsx
{(['practice', 'search'] as const).map(v => (
  <Button
    key={v}
    data-tour={`nav-${v}`}
    variant={view === v ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => onNavigate(v)}
  >
    {v.charAt(0).toUpperCase() + v.slice(1)}
  </Button>
))}
{session && (
  <Button ... >Stats</Button>
)}
```

`App.tsx` currently routes views with a ternary chain ending in `practiceView()`. The current chain (lines 472–494):

```tsx
{view === 'search'
  ? <SearchPage ... />
  : view === 'stats'
  ? <StatsPage ... />
  // eslint-disable-next-line react-hooks/refs
  : practiceView()
}
```

- [ ] **Step 1: Add Mission button to NavBar**

In `frontend/src/components/NavBar.tsx`, add the Mission button after the Practice/Search map block and before the `{session && ...}` Stats button:

```tsx
{(['practice', 'search'] as const).map(v => (
  <Button
    key={v}
    data-tour={`nav-${v}`}
    variant={view === v ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => onNavigate(v)}
  >
    {v.charAt(0).toUpperCase() + v.slice(1)}
  </Button>
))}
<Button
  variant={view === 'mission' ? 'secondary' : 'ghost'}
  size="sm"
  onClick={() => onNavigate('mission')}
>
  Mission
</Button>
{session && (
  <Button
    data-tour="nav-stats"
    variant={view === 'stats' ? 'secondary' : 'ghost'}
    size="sm"
    onClick={() => onNavigate('stats')}
  >
    Stats
  </Button>
)}
```

- [ ] **Step 2: Import MissionPage in App.tsx**

In `frontend/src/App.tsx`, add the import alongside the other page imports:

```tsx
import { MissionPage } from './components/MissionPage'
```

- [ ] **Step 3: Add mission to the view routing ternary in App.tsx**

Change the view routing ternary from:

```tsx
{view === 'search'
  ? <SearchPage ... />
  : view === 'stats'
  ? <StatsPage
      onSmartPractice={session ? () => { void loadSmartPracticeProblem(); setView('practice') } : undefined}
      activeTopics={activeTopics}
      onTopicsChange={persistTopics}
    />
  // eslint-disable-next-line react-hooks/refs
  : practiceView()
}
```

to:

```tsx
{view === 'search'
  ? <SearchPage ... />
  : view === 'stats'
  ? <StatsPage
      onSmartPractice={session ? () => { void loadSmartPracticeProblem(); setView('practice') } : undefined}
      activeTopics={activeTopics}
      onTopicsChange={persistTopics}
    />
  : view === 'mission'
  ? <MissionPage />
  // eslint-disable-next-line react-hooks/refs
  : practiceView()
}
```

- [ ] **Step 4: Verify build and lint pass**

Run from `frontend/`:
```bash
npm run build && npm run lint
```

Expected: build succeeds, lint exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NavBar.tsx frontend/src/App.tsx
git commit -m "feat: add Mission nav button and wire mission view in App"
```
