# Markdown Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render markdown in AI assistant chat bubbles so bold, italic, inline code, code blocks, and lists display correctly instead of raw syntax.

**Architecture:** Install `react-markdown` + `remark-gfm` for markdown parsing and `@tailwindcss/typography` for prose styling (required in Tailwind v4 — preflight strips default element styles). A `MarkdownMessage` component wraps `react-markdown` with the prose classes and is used in both finalized assistant bubbles and the live streaming bubble.

**Tech Stack:** react-markdown v10, remark-gfm, @tailwindcss/typography, Tailwind v4 (`@import "tailwindcss"` style), React 19, TypeScript

---

### Task 1: Install packages and register typography plugin

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Install the three packages**

Run from `frontend/`:
```bash
npm install react-markdown remark-gfm @tailwindcss/typography
```

Expected: packages appear in `package.json` dependencies, `package-lock.json` updated.

- [ ] **Step 2: Register the typography plugin in index.css**

In `frontend/src/index.css`, add the `@plugin` directive on line 2 (after the `@import "tailwindcss"` line):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@import "tw-animate-css";
```

- [ ] **Step 3: Verify the build still compiles**

Run from `frontend/`:
```bash
npm run build
```

Expected: build succeeds with no errors. If `@plugin` is not recognized, confirm `tailwindcss` version is `^4.x` — the `@plugin` directive is Tailwind v4 only.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/index.css
git commit -m "feat: install react-markdown, remark-gfm, tailwindcss/typography"
```

---

### Task 2: Add MarkdownMessage component and apply to assistant bubbles

**Files:**
- Modify: `frontend/src/components/ChatView.tsx`

**Context:** `ChatView.tsx` renders chat history and a streaming bubble. Assistant messages currently render as:
```tsx
<div className="... whitespace-pre-wrap">
  {msg.content}
</div>
```
and the streaming bubble as:
```tsx
<div className="... whitespace-pre-wrap">
  {streamingMessage}
  <span className="animate-pulse ml-0.5">▌</span>
</div>
```

User messages use `msg.role === 'user'` and must remain plain text with `whitespace-pre-wrap`.

**react-markdown v10 note:** The `className` prop was removed in v10. Apply classes via a wrapper `<div>`, not directly on `<Markdown>`.

- [ ] **Step 1: Add imports at the top of ChatView.tsx**

Add these two imports after the existing imports:
```tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
```

- [ ] **Step 2: Add the MarkdownMessage component**

Add this component definition immediately before the `stageBannerBase` constant (i.e., at the top of the module, before any other declarations):

```tsx
function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
    </div>
  )
}
```

- [ ] **Step 3: Apply MarkdownMessage to assistant history bubbles**

Find the history map block. The assistant bubble currently reads:
```tsx
className={cn(
  "max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap",
  msg.role === 'user'
    ? "self-end bg-primary text-primary-foreground"
    : "self-start bg-secondary text-secondary-foreground"
)}
>
{msg.content}
```

Change it to render markdown for assistant messages and plain text for user messages, and remove `whitespace-pre-wrap` from assistant bubbles:

```tsx
className={cn(
  "max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed",
  msg.role === 'user'
    ? "self-end bg-primary text-primary-foreground whitespace-pre-wrap"
    : "self-start bg-secondary text-secondary-foreground"
)}
>
{msg.role === 'user' ? msg.content : <MarkdownMessage content={msg.content} />}
```

- [ ] **Step 4: Apply MarkdownMessage to the streaming bubble**

Find the streaming bubble block. It currently reads:
```tsx
<div className="self-start bg-secondary text-secondary-foreground max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap">
  {streamingMessage}
  <span className="animate-pulse ml-0.5">▌</span>
</div>
```

Replace with (remove `whitespace-pre-wrap`, use `MarkdownMessage`):
```tsx
<div className="self-start bg-secondary text-secondary-foreground max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed">
  <MarkdownMessage content={streamingMessage} />
  <span className="animate-pulse ml-0.5">▌</span>
</div>
```

- [ ] **Step 5: Verify the build and lint pass**

Run from `frontend/`:
```bash
npm run build && npm run lint
```

Expected: build succeeds, lint exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatView.tsx
git commit -m "feat: render markdown in assistant chat bubbles"
```
