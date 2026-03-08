# Loop Control Center — PRD

> Version: 1.0
> Date: 2026-03-08
> Status: Awaiting Approval

---

## Problem

Claude Code's `/loop` feature (CronCreate) is session-scoped — loops die when VS Code closes and auto-expire after 3 days. The user runs multiple web apps (CrateDig, Lead Radar, Event Radar, etc.) that each need recurring automated tasks (playlist generation, lead refresh, event scanning). Without persistent storage and a management interface, every loop must be manually recreated after every restart.

## Goal

Build a web dashboard that acts as the **persistent memory layer** for Claude Code loops. It stores loop configurations in a database, provides a visual management interface, and pairs with a Claude Code skill (`sync-loops`) that recreates all enabled loops on session start.

**Key constraint:** The web app is passive. It stores configs and displays status. Claude Code is the execution engine — it pulls configs and pushes results via HTTP.

---

## Architecture

```
Loop Control Center (Next.js + Vercel + Neon DB)
  │
  │  Stores: loop configs, run history, project list
  │  Shows: dashboard with status, toggles, logs
  │
  │         ▲ Claude Code POSTs results     │ Claude Code GETs configs
  │         │ after each loop run           │ on session start
  │         │                               ▼
  │
Claude Code Session (ONE permanent VS Code window)
  │
  ├── sync-loops skill fetches enabled loops from control center API
  ├── Calls CronCreate for each enabled loop
  ├── All loops from all projects run in ONE session
  ├── Loop prompts are self-contained (exact URLs, JSON shapes, error handling)
  ├── After each run, POSTs results back to control center API
  └── On crash/restart: reopen → sync-loops recreates everything from DB
```

### Communication Model

- **One-way only:** Claude Code → Web App (via HTTP). The web app cannot call Claude Code.
- **One session, all loops:** Loop prompts are HTTP calls to project APIs — no filesystem access needed. A CrateDig loop calls CrateDig's API, a Lead Radar loop calls Lead Radar's API, all from the same session.
- **Self-checking prompts:** Each loop prompt's first step checks `GET /api/loops/{id}` — if disabled in the dashboard, the run is skipped. This is how dashboard toggles take effect without the web app needing to notify Claude Code.

---

## Features

### MVP (V1)

**1. Auth — Simple Password Login**
- Single-user app, one password stored as env var
- Session cookie after login, middleware protects all routes
- No OAuth, no magic links — this is a personal tool

**2. Dashboard — Loop Management**
- Loops grouped by project
- Each loop card shows: name, interval, enabled/disabled toggle, last run time, last run status
- Toggle ON/OFF saves to DB immediately (takes effect on next loop run via self-check)
- Agent status indicator: "Online" if any loop reported results in the last `interval × 2`, otherwise "Offline"

**3. Activity Feed — Recent Runs**
- Chronological list of recent loop runs across all projects
- Shows: timestamp, project, loop name, status (success/error/skipped), duration, summary
- Errors shown with red indicator and error message

**4. API Routes — CRUD + Reporting**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Password login, set session cookie |
| `/api/projects` | GET | List all projects |
| `/api/projects` | POST | Add a project |
| `/api/projects/sync-github` | POST | Sync projects from GitHub |
| `/api/loops` | GET | List loops (filter: `?enabled=true`, `?project_id=X`) |
| `/api/loops` | POST | Create a loop config |
| `/api/loops/[id]` | GET | Get single loop (used by self-checking prompts) |
| `/api/loops/[id]` | PATCH | Update loop (toggle enabled, edit interval) |
| `/api/loops/[id]` | DELETE | Delete a loop |
| `/api/loops/[id]/runs` | GET | Get run history for a loop |
| `/api/loops/[id]/runs` | POST | Report a run result (Claude Code calls this) |

**API Auth:** All routes except `/api/auth/login` require either:
- Session cookie (dashboard), OR
- `Authorization: Bearer <API_KEY>` header (Claude Code calls)

The API key is a static secret stored as env var — shared between the web app and Claude Code's environment.

**5. GitHub Project Discovery**
- Button: "Sync from GitHub" → calls GitHub API to list user's repos
- Shows repos as available projects, user can add them to the control center
- Uses `gh` CLI credentials or a GitHub personal access token

**6. sync-loops Skill**
- Location: `~/.claude/skills/sync-loops/SKILL.md`
- On trigger: fetches `GET /api/loops?enabled=true` with Bearer auth
- For each enabled loop: calls CronCreate with the stored cron expression and prompt
- Reports back: "N loops activated: [list]"
- Can be triggered by: SessionStart hook, manual `/sync-loops`, or its own periodic CronCreate task

### Out of Scope (V1)

- Editing loop prompts from the dashboard (too complex, Claude Code creates them in conversation)
- Email/Slack notifications on failure
- Public/portfolio read-only view
- Loop analytics or charts
- Multiple user support

---

## Tech Stack

| Component | Tech | Account |
|-----------|------|---------|
| Frontend + API | Next.js 15 + Tailwind CSS | — |
| Database | Neon PostgreSQL | Existing account |
| Hosting | Vercel | egertv1s |
| GitHub | `gh` CLI / GitHub API | keeltekool |
| Auth | Password + session cookie | — |

**Project location:** `C:\Users\Kasutaja\Claude_Projects\loop-control-center\`

---

## Database Schema

### `projects`
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  github_repo TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `loops`
```sql
CREATE TABLE loops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  interval TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### `loop_runs`
```sql
CREATE TABLE loop_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id UUID REFERENCES loops(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status TEXT NOT NULL,
  summary TEXT,
  error_message TEXT,
  duration_ms INTEGER
);
```

---

## UI Design

### Design Language — Matches QuoteKit (quote-kit.vercel.app)

**Reference project:** `C:\Users\Kasutaja\Claude_Projects\quote-kit\`

- **Palette:** Fjord blue-gray (`fjord-50` #F4F7F9 through `fjord-950` #1C2B33) — same custom palette as QuoteKit
- **Theme:** Light — `bg-background` (#F4F7F9) page bg, `bg-white` for main content area
- **Fonts:** Inter (sans) + JetBrains Mono (mono) — loaded via globals.css `@theme`
- **Cards:** `border border-border rounded-lg` — no shadows (shadows only on dropdowns/modals)
- **CTAs:** Primary = `bg-fjord-700 text-white hover:bg-fjord-800`, Secondary = `border border-fjord-200 text-fjord-700`
- **Status colors:** emerald = success/ON, red = error/OFF, amber = warning/pending
- **Status badges:** `px-1.5 py-0.5 rounded-full border text-[10px] font-medium` + color
- **Section headers:** `bg-fjord-50` background with `border-b border-border`
- **Sidebar nav:** White bg, `border-r border-border`, color-coded active states per section
- **Semantic CSS vars:** `--color-background`, `--color-foreground`, `--color-muted`, `--color-border`, `--color-surface`
- **Shadows:** Only `--shadow-dropdown` and `--shadow-modal` — never on cards/buttons

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  LOOP CONTROL CENTER          [Agent: ● Online]    [Logout] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── CrateDig ─────────────────────────────────────────┐  │
│  │  Auto-roll playlists    12h    ● ON     Last: 2h ago │  │
│  │  Success: "Created playlist CrateDig Auto — Mar 9"   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─── Lead Radar ───────────────────────────────────────┐  │
│  │  Refresh leads          6h     ● ON     Last: 1h ago │  │
│  │  Success: "12 new leads found"                        │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  [Sync from GitHub]                                         │
│                                                             │
│  ── Recent Activity ─────────────────────────────────────── │
│  Mar 8 16:00  CrateDig  Auto-roll    ✓ Success   45s      │
│  Mar 8 10:00  Lead Radar Refresh     ✓ Success   12s      │
│  Mar 8 04:00  CrateDig  Auto-roll    ✗ Error     quota    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Loop Creation Workflow

Loops are NOT created from the dashboard UI. The workflow:

1. User opens Claude Code (any project)
2. User says: "I want CrateDig to auto-create playlists every 12 hours"
3. Claude studies the project — reads endpoints, understands APIs
4. Claude writes a self-contained prompt with exact URLs, JSON shapes, error handling
5. Claude POSTs the config to `POST /api/loops` with Bearer auth
6. Claude also calls CronCreate to start it immediately in the current session
7. Loop is now: saved in DB (persistent) + running in session (active)

---

## First Loop: CrateDig Auto-Roll

After the control center is built, the first loop to register:

| Field | Value |
|-------|-------|
| Project | CrateDig |
| Name | Auto-roll playlists |
| Interval | 12h |
| Cron | `0 */12 * * *` |

The prompt will call CrateDig's existing endpoints:
- `GET /api/library` → get songs
- `POST /roll` → generate playlist recommendations
- `POST /create-playlist` → create YouTube playlist
- `POST /api/rolls` → save roll history
- `POST /api/loops/{id}/runs` → report result to control center

---

## Milestones

### M1: Foundation
- Next.js project scaffolding with Tailwind
- Neon DB setup + Drizzle ORM + schema migration
- GitHub repo created, Vercel auto-deploy connected
- Auth (password login + session middleware + API key auth)

### M2: Core API
- All CRUD routes for projects, loops, loop_runs
- Bearer token auth for Claude Code calls
- GitHub project sync endpoint

### M3: Dashboard UI
- Login page
- Main dashboard with loops grouped by project
- Toggle enabled/disabled
- Agent status indicator
- Recent activity feed

### M4: sync-loops Skill
- `~/.claude/skills/sync-loops/SKILL.md`
- Fetches enabled loops, calls CronCreate for each
- SessionStart hook configuration

### M5: First Loop Live
- Register CrateDig auto-roll loop via API
- Test full cycle: sync → run → report results → dashboard shows status
- Verify crash recovery: restart session → sync-loops recreates loops

---

## Resolved Decisions

1. **Brand color** — Fjord blue-gray palette (from QuoteKit) — `fjord-700` (#3A5060) for CTAs/active states
2. **Theme** — Light (matching QuoteKit), not dark
3. **Domain** — Default Vercel subdomain (`loop-control-center.vercel.app`)
