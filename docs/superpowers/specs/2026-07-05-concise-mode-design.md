# Concise Mode — Design

**Date:** 2026-07-05
**Status:** Approved

## Problem

The practice chat is a strict Socratic examiner. The system prompt in
`backend/internal/llm/llm.go` forbids advancing a stage until the candidate has
articulated the full answer in their own words — for the pattern stage that
means naming the pattern AND fully explaining why it fits, and the LLM keeps
drilling down until it gets that. This is the right default for deep practice,
but it is high friction when the user wants faster, lower-ceremony reps.

## Goal

A per-user **concise mode** setting. When on, the interviewer gives more
leeway: a correct answer with brief reasoning passes a stage, and the LLM stops
asking drill-down follow-ups when the candidate is on the right track. Session
evaluation is recalibrated so concise sessions score comparably to full
sessions instead of being penalized for brevity.

## Decisions

- **Pass bar (concise):** naming the answer plus one short sentence of correct
  reasoning advances the stage. No follow-ups when on the right track;
  follow-ups only when the answer is wrong or gives no reasoning at all.
- **Toggle:** persisted per-user setting on the settings page, following the
  `hide_difficulty` pattern exactly. Default **off** (current behavior).
- **Scope:** backend + web frontend. The mobile app (unmerged
  `feat/mobile-app`) inherits the backend behavior for free and gets its UI
  later.
- **Proficiency scoring:** the session-evaluation rubric gets a concise-mode
  calibration note so brief-but-correct reasoning scores as well-reasoned
  (0.8). Scores stay comparable across modes.
- **Shape:** plain boolean, client-sent per chat request (mirrors how
  `active_stages` flows). Not a server-side settings lookup (chat works for
  unauthenticated users) and not an enum (YAGNI).

## Design

### Backend data flow

- `backend/db/schema.sql`: add `concise_mode BOOLEAN NOT NULL DEFAULT FALSE`
  to `user_settings` (CREATE TABLE plus the ALTER used for existing DBs,
  matching how `hide_difficulty` was added).
- `internal/models/user_settings.go`: add
  `ConciseMode bool \`json:"concise_mode" db:"concise_mode"\``.
- `internal/storage/postgres/user_settings.go`: add the column to the SELECT
  and to `UpsertUserSettings` (new parameter + upsert column).
- `internal/handlers/settings.go`: add `concise_mode` to the GET response and
  PUT request structs. No validation needed (bool).
- `internal/types/chat_request.go`: add `Concise bool \`json:"concise"\``.
  Optional; missing field unmarshals to false, so existing clients are
  unaffected.
- `internal/handlers/chat.go`: pass `req.Concise` to `llmClient.Evaluate` and
  through the evaluation dispatcher to `EvaluateSession`.
- `internal/llm/llm.go`: `Client` interface methods `Evaluate` and
  `EvaluateSession` gain a `concise bool` parameter; both the Anthropic and
  Ollama implementations thread it into the prompt builders.

Prompt caching is preserved: concise is part of the stable system prompt, so
the cache key becomes (problem, active stages, concise) — constant within a
session, two cacheable variants overall.

### Interviewer prompt (`internal/llm/llm.go`)

`BuildStableSystemPrompt` (and `BuildSystemPrompt`) gain `concise bool`.

- `concise == false`: output byte-identical to today.
- `concise == true`:
  - Rule 3 replaced with: advance the stage when the candidate gives a correct
    answer with brief reasoning — one sentence of "why" is enough; do not
    require an exhaustive explanation.
  - Added rule: if the candidate is on the right track, accept the answer and
    move on; only ask a follow-up when the answer is wrong or gives no
    reasoning at all.
  - Each `stageDesc` gets a `conciseGuidance` string used instead of
    `guidance` — same intent, lenient bar. Example (pattern): "If they name
    the correct pattern with a brief reason it fits, advance. Only probe if
    the pattern is wrong or stated with no reasoning. Never reveal the
    pattern."
  - All "never reveal the answer/pattern" guardrails, the one-question rule,
    the short-response rule, and the JSON output contract are unchanged.
    Concise loosens the pass bar, not the no-spoiler rules.

### Evaluation rubric (`internal/llm/evaluation.go`)

`BuildEvaluationSystemPrompt` (and `BuildEvaluationPrompt`) gain
`concise bool`.

- `concise == false`: output byte-identical to today.
- `concise == true`: append one calibration block: this session used concise
  mode — the candidate was asked for brief answers; score brief-but-correct
  reasoning as well-reasoned (0.8); do not penalize brevity, only
  incorrectness or absence of reasoning.
- Anchors, reveal cap, hint cap, and answer cap are unchanged. Both variants
  remain cacheable.

The dispatcher (`Dispatch`) signature gains the concise flag so the
fire-and-forget session evaluation uses the right rubric variant.

### Frontend (web)

- `frontend/src/api.ts`: add `concise_mode: boolean` to the settings type and
  GET/PUT payloads; add `concise` to the chat POST body next to
  `active_stages`.
- Settings UI: a "Concise mode" switch alongside the hide-title /
  hide-difficulty toggles, description: "Less back-and-forth — brief correct
  answers advance the stage." State threads through `App.tsx` like
  `hideDifficulty`.
- The practice view (`ProblemView.tsx` chat path) sends the setting with every
  chat request.

### Error handling

Nothing new. A bool cannot fail validation; a missing field defaults to false
at every layer, which is today's behavior.

## Testing

- `llm_test.go`: concise=false output unchanged (regression guard);
  concise=true contains the lenient rules and per-stage concise guidance, and
  still contains the never-reveal guardrails and the JSON contract.
- `evaluation_test.go`: concise=false unchanged; concise=true appends the
  calibration block.
- Handler/type tests: `concise` defaults to false when omitted from the chat
  request; settings PUT/GET round-trips `concise_mode`.
- Frontend: extend existing vitest coverage where the api/settings layer is
  tested; manual verification of toggle round-trip and chat payload.

## Out of scope

- Mobile app UI (lives on `feat/mobile-app`; backend behavior carries over).
- Per-session override on the practice screen.
- Additional leniency levels beyond on/off.
