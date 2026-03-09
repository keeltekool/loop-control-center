# Loop Control Center — STACK.md

> Persistent storage + dashboard for Claude Code scheduled loops.
> Last updated: 2026-03-09

---

## Quick Reference

| Item | Value |
|------|-------|
| **Live URL** | https://loop-control-center.vercel.app |
| **Repo** | https://github.com/keeltekool/loop-control-center |
| **Hosting** | Vercel (egertv1s) |
| **Database** | Neon PostgreSQL (shared cluster) |
| **ORM** | Drizzle |
| **Framework** | Next.js 15 + Tailwind CSS v4 |
| **Auth** | Password login + session cookie (dashboard), Bearer token (API) |
| **Login password** | `LOGIN_PASSWORD` in `.env.local` |
| **API key** | `API_KEY` in `.env.local` — used by Claude Code skills |

---

## Architecture

```
Dashboard (Vercel)                    Claude Code (local)
  │                                     │
  │  Stores loop configs + run history  │  Executes loops on cron schedule
  │  Shows status, toggles, activity    │  Reports results back via API
  │                                     │
  │  GET /api/loops?enabled=true  ◄─────┤  sync-loops skill (pulls configs)
  │  POST /api/loops  ◄────────────────┤  create-loop skill (registers new)
  │  POST /api/loops/{id}/runs  ◄──────┤  each run reports results
  │  GET /api/loops/{id}  ◄────────────┤  pre-flight enabled check
```

**Key constraint:** Web app is passive. Claude Code is the execution engine.

---

## Environment Variables

### Vercel (Production)
| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `LOGIN_PASSWORD` | Dashboard login password |
| `API_KEY` | Bearer token for Claude Code API calls |

### Local (`.env.local`)
Same three vars. The API key here is what Claude Code skills read to authenticate.

**Gotcha:** When setting `API_KEY` on Vercel, use `printf` not `echo` to avoid trailing newline:
```bash
printf 'the-key-value' | npx vercel env add API_KEY production
```

---

## Database Schema

Three tables in Neon:

**`projects`** — Repos/apps that can have loops
- id (UUID), name, githubRepo, description, createdAt

**`loops`** — Loop configurations (the core entity)
- id (UUID), projectId (FK), name, prompt (full Claude prompt text), interval, cronExpression, enabled, createdAt, updatedAt

**`loop_runs`** — Execution history (reported by Claude Code after each run)
- id (UUID), loopId (FK), startedAt, completedAt, status, summary, errorMessage, durationMs

Schema file: `src/lib/db/schema.ts`

---

## API Routes

All routes require auth (Bearer token OR session cookie) except `/api/auth/login`.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Password login, sets session cookie |
| `/api/dashboard` | GET | Full dashboard data (projects + loops + last runs + counts + activity) |
| `/api/projects` | GET/POST | List or create projects |
| `/api/projects/sync-github` | POST | Import repos from GitHub |
| `/api/loops` | GET | List loops (`?enabled=true`, `?project_id=X`) |
| `/api/loops` | POST | Create loop (projectId, name, prompt, interval, cronExpression) |
| `/api/loops/[id]` | GET | Single loop + last run (used by self-checking prompts) |
| `/api/loops/[id]` | PATCH | Update (enabled, interval, cronExpression, name, prompt) |
| `/api/loops/[id]` | DELETE | Delete loop |
| `/api/loops/[id]/runs` | GET | Run history (`?limit=20`) |
| `/api/loops/[id]/runs` | POST | Report run result (status, summary, errorMessage, durationMs) |

---

## Claude Code Skills

Two global skills power the system. Located in `~/.claude/skills/`.

### sync-loops (`~/.claude/skills/sync-loops/SKILL.md`)
**Trigger:** User says `/sync-loops`, "sync my loops", "activate loops"

Pulls enabled loops from the API and creates CronCreate tasks. Each stored prompt gets wrapped with:
1. **Pre-flight check** — reads loop status, skips if disabled
2. **Post-run reporter** — POSTs result (success/error/skipped) to `/api/loops/{id}/runs`

CronCreate task descriptions use `[LCC]` prefix for identification and deduplication.

### create-loop (`~/.claude/skills/create-loop/SKILL.md`)
**Trigger:** User wants to create a new recurring task for any app

Full flow: understand intent → study project APIs → design self-contained prompt → POST to `/api/loops` → wrap with control-plane logic → call CronCreate → confirm.

---

## How Loops Work (End-to-End)

### Creating a Loop
1. User tells Claude: "I want CrateDig to auto-create playlists every 12h"
2. Claude studies the CrateDig project APIs
3. Claude writes a self-contained prompt with exact URLs, JSON shapes, error handling
4. Claude POSTs the config to `POST /api/loops` (stored in Neon DB)
5. Claude calls CronCreate to start it in the current session
6. Loop is now: **saved in DB** (survives restarts) + **running in session** (active)

### Running a Loop
Each CronCreate execution is a fresh Claude context. The wrapped prompt:
1. Reads LCC API key from `loop-control-center/.env.local`
2. Checks `GET /api/loops/{id}` — if disabled, reports "skipped" and stops
3. Executes the task (HTTP calls to the project's APIs)
4. Reports results via `POST /api/loops/{id}/runs`

### Restoring After Restart
1. User opens Claude Code and says `/sync-loops`
2. Skill fetches `GET /api/loops?enabled=true`
3. Deletes any existing `[LCC]` CronCreate tasks (prevents duplicates)
4. Creates fresh CronCreate tasks for each enabled loop
5. All loops are active again

### Toggling a Loop
1. User clicks the toggle on the dashboard → PATCH sets `enabled: false`
2. On next scheduled run, the pre-flight check sees `enabled: false` → skips
3. No need to re-sync or restart Claude Code

---

## Registered Loops

### CrateDig: Auto-roll playlists
| Field | Value |
|-------|-------|
| Loop ID | `4ff734fa-c06d-47b1-8206-ee4c5f50e9c7` |
| Project ID | `d46adfa1-1a1d-4d31-9998-40c7822da96c` |
| Interval | 12h (`0 */12 * * *`) |
| Status | Enabled, never run |

**What it does:** Fetches song library → picks 8 random seeds → calls CrateDig backend to find related tracks via YouTube Music → creates a private YouTube playlist → saves roll history.

**Endpoints called:**
- `GET https://crate-dig-two.vercel.app/api/library`
- `POST https://cratedig-api.onrender.com/roll`
- `POST https://cratedig-api.onrender.com/create-playlist`
- `POST https://crate-dig-two.vercel.app/api/rolls`

**Known issues:**
- Render backend cold start: ~50s — prompt wakes it first
- YouTube OAuth token expires in 7 days (Google "Testing" mode) — will show as 401 error

---

## Dashboard Features

- **Loop cards:** Name, interval, ON/OFF toggle, last run status + summary + time ago, run counts (total/success/error), colored left border (green=ok, red=error, gray=never run)
- **Agent status:** "Online" if any run completed in last 60min
- **Empty projects:** Collapsed into a summary line ("30 projects without loops")
- **Activity feed:** Last 20 runs across all projects with status badges and duration
- **GitHub sync:** Imports repos as projects (doesn't create loops — that's Claude Code's job)

---

## File Structure

```
src/
  app/
    page.tsx              — Main dashboard (client component)
    login/page.tsx        — Login page
    layout.tsx            — Root layout
    globals.css           — Tailwind theme (fjord palette)
    api/
      auth/login/         — Password auth
      dashboard/          — Aggregated dashboard data
      loops/              — CRUD + runs
      projects/           — CRUD + GitHub sync
  lib/
    auth.ts               — Auth helpers
    db/
      index.ts            — Drizzle + Neon connection
      schema.ts           — Table definitions
  middleware.ts           — Route protection (Bearer OR cookie)
```

---

## Design Language

- **Palette:** Fjord blue-gray (`fjord-50` through `fjord-950`) — matches QuoteKit
- **Status:** emerald = success/ON, red = error, amber = warning/skipped
- **Cards:** `border border-border rounded-lg` — no shadows
- **Badges:** `px-1.5 py-0.5 rounded-full border text-[10px] font-medium`
- **Fonts:** Inter (sans) + JetBrains Mono (mono)

---

## Deployment

Vercel auto-deploys on push to `master`. No build config needed.

### Post-Deploy Smoke Tests
1. Navigate to https://loop-control-center.vercel.app
2. Should redirect to `/login` if not authenticated
3. Login with password → dashboard loads
4. Verify crate-dig loop card shows with correct data
5. Toggle loop OFF/ON — verify PATCH call succeeds
6. Check console for JS errors

---

## Gotchas & Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| API returns 401 | API_KEY mismatch or trailing whitespace | Re-set with `printf` (no newline) |
| Loop shows "Never run" | No CronCreate active, or hasn't fired yet | Run `/sync-loops` to activate |
| Dashboard shows "Agent Offline" | No runs in last 60 min | Normal if no loops scheduled recently |
| Toggle doesn't stop loop immediately | Pre-flight check only runs at next scheduled time | By design — wait for next run |
| Em-dashes corrupt in prompts | Bash/curl encoding | Use file-based PATCH (`-d @file.json`) |
| Too many empty projects | GitHub sync imports all repos | Collapse is by design; only active shown prominently |
