# leetgame

**Live:** https://leetgame-frontend.onrender.com/

Practice LeetCode problems by describing your algorithm in plain English. An AI evaluates your approach, guides you with Socratic questions if you're wrong, then checks your time/space complexity once you get it right.

## Prerequisites

- [Go](https://go.dev/) 1.22+
- [Node.js](https://nodejs.org/) 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Docker](https://www.docker.com/) (required by Supabase CLI)
- Python 3.9+ (for seeding problems)
- [Ollama](https://ollama.com/) or an Anthropic API key

## Setup

### 1. Start Supabase

```bash
supabase start
```

This spins up a local Postgres instance at `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. The schema is applied automatically from `supabase/seed.sql`.

> If another Supabase project is already running, stop it first:
> ```bash
> supabase stop --project-id <other-project>
> ```

### 2. Seed problems

One-time step — loads ~2,600 LeetCode problems from HuggingFace.

```bash
cd scripts
pip3 install -r requirements.txt
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres python3 seed.py
```

### 3. Configure the backend

Create `backend/.env`:

**Using Ollama (free):**
```env
STORAGE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
LLM_PROVIDER=ollama
LLM_MODEL=kimi-k2:1t-cloud
SERVER_PORT=42069
LOG_LEVEL=DEBUG
```

**Using Anthropic:**
```env
STORAGE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-haiku-4-5
SERVER_PORT=42069
LOG_LEVEL=DEBUG
```

### 4. Set up Ollama (if using Ollama)

```bash
ollama login
ollama pull kimi-k2:1t-cloud
```

### 5. Start the backend

```bash
cd backend
go run ./cmd/server
```

### 6. Start the frontend

```bash
cd frontend
pnpm install
pnpm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## LLM options

| Provider | Model | Notes |
|---|---|---|
| Ollama | `kimi-k2:1t-cloud` | Free, cloud-hosted via Ollama (requires `ollama login`) |
| Ollama | `llama3.2` | Free, runs fully locally |
| Anthropic | `claude-haiku-4-5` | Paid, fast |

To switch models, update `LLM_PROVIDER` and `LLM_MODEL` in `backend/.env` and restart the backend.
