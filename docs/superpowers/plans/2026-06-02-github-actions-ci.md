# GitHub Actions CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CI workflow that runs backend tests and frontend checks in parallel on every push to `main` and every PR targeting `main`.

**Architecture:** Single workflow file with two independent parallel jobs — `backend` (Go vet + test) and `frontend` (npm install, build, lint). No secrets or external services needed.

**Tech Stack:** GitHub Actions, Go 1.24.1, Node 24.x, npm

---

### Task 1: Create CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow directory and file**

Create `.github/workflows/ci.yml` with this exact content:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum
      - run: go vet ./...
      - run: go test ./...

  frontend:
    name: frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: npm run lint
```

- [ ] **Step 2: Validate the YAML is well-formed**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

Expected: `YAML valid`

- [ ] **Step 3: Verify the workflow references correct paths**

Run:
```bash
ls backend/go.mod backend/go.sum frontend/package-lock.json
```

Expected: all three files printed with no errors.

- [ ] **Step 4: Verify backend tests pass locally**

Run from repo root:
```bash
cd backend && go vet ./... && go test ./...
```

Expected: no vet errors; all test packages show `ok` or `[no test files]`.

- [ ] **Step 5: Verify frontend build and lint pass locally**

Run from repo root:
```bash
cd frontend && npm run build && npm run lint
```

Expected: build succeeds with no TypeScript errors; lint exits 0.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for backend and frontend"
```
