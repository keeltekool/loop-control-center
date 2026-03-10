# SOEL Substack Research Loop — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Register a daily Claude Code loop that reads 11 Substack RSS feeds, scores articles for relevance, and appends them to the SOEL Google Sheet.

**Architecture:** A single self-contained CronCreate prompt registered in Loop Control Center. No code files, no new services. The prompt fetches RSS via WebFetch, reads/writes the Sheet via `gws` CLI, and reports results to LCC. Claude itself is the scoring and summarization engine.

**Tech Stack:** Claude Code CronCreate, WebFetch (RSS), `gws` CLI (Google Sheets), LCC API (loop management)

---

### Task 1: Create SOEL project in Loop Control Center

**Step 1: Register the project**

Run:
```bash
curl -s -X POST \
  -H "Authorization: Bearer lcc-api-key-2026-secret" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/projects \
  -d '{"name": "soel", "githubRepo": "keeltekool/soel", "description": "AI-curated daily digest of Claude Code and AI tools articles"}'
```

Expected: JSON response with `{ "project": { "id": "some-uuid", ... } }`

Save the returned project UUID — needed for Task 2.

**Step 2: Verify on dashboard**

Run:
```bash
curl -s -H "Authorization: Bearer lcc-api-key-2026-secret" \
  https://loop-control-center.vercel.app/api/projects | grep -o '"soel"'
```

Expected: `"soel"` appears in the output.

---

### Task 2: Write the loop prompt

This is the core deliverable. The prompt must be completely self-contained — each CronCreate run gets a fresh context with no memory.

**Step 1: Write the prompt text**

Create file: `C:\Users\Kasutaja\Claude_Projects\loop-control-center\Soel\loop-prompt.md`

The prompt must contain these sections in order:

```markdown
## Loop Control Center — Managed Task
- Loop ID: {LOOP_ID}
- Project: soel
- Name: Substack digest scraper

## Pre-flight: Check if still enabled

1. Read the LCC API key from `C:\Users\Kasutaja\Claude_Projects\loop-control-center\.env.local` (the `API_KEY` line).
2. Run:
   ```bash
   curl -s -H "Authorization: Bearer {API_KEY}" \
     https://loop-control-center.vercel.app/api/loops/{LOOP_ID}
   ```
3. Parse the JSON response. If `"enabled"` is `false`, report as skipped and STOP:
   ```bash
   curl -s -X POST -H "Authorization: Bearer {API_KEY}" -H "Content-Type: application/json" \
     https://loop-control-center.vercel.app/api/loops/{LOOP_ID}/runs \
     -d '{"status":"skipped","summary":"Loop disabled in dashboard","durationMs":0}'
   ```
   Then stop — do not proceed.

## Task: Scrape Substack RSS feeds and write to SOEL Google Sheet

Record the start time for duration tracking.

### Step 1: Read the source list

Read the CSV file at:
`C:\Users\Kasutaja\Claude_Projects\loop-control-center\Soel\sources\top_ai_substack_authors.csv`

Parse it to extract for each row:
- `Substack URL` (column 4) — append `/feed` to get RSS URL
- `Author Name` (column 2) — for Sheet column C
- `Newsletter Name` (column 3) — for Sheet column G

Skip the header row. You should get 11 sources.

### Step 2: Fetch RSS feeds

For each source, use WebFetch to fetch `{Substack URL}/feed`.

Ask WebFetch to extract from the RSS:
- Article title
- Article URL (the link/guid)
- Publication date
- Article content/description text (for scoring)
- Enclosure image URL (if type is image/*, otherwise empty string)

If a feed fails to load, log the error and continue with the remaining feeds. Do not stop the entire run for one failed feed.

Collect all articles from all feeds into a single list.

### Step 3: Deduplicate against existing Sheet data

Read existing URLs from the Sheet:
```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!D:D'
```

Compare each fetched article URL against this list. Drop any article whose URL already exists in the Sheet. Keep a count of how many duplicates were skipped.

### Step 4: Score and summarize each new article

For each new (non-duplicate) article, analyze the RSS content and produce:

**Score (1-10) — relevance only:**
- 9-10: Directly about Claude Code (features, tutorials, workflows, tips, CLI usage)
- 7-8: AI coding tools broadly (Cursor, Copilot, vibe coding, AI-assisted development)
- 5-6: General AI/LLM content with a developer angle
- 3-4: Tangentially related (productivity, tech industry, business)
- 1-2: Off-topic (marketing, non-tech, lifestyle)

**Category — pick exactly one:**
- `claude-code` — article is primarily about Claude Code
- `ai-tools` — article is about AI coding/productivity tools
- `tutorials` — article is a how-to or step-by-step guide
- `news` — article is industry news, announcements, or analysis

**Summary:** Write 1-2 sentences that hook the reader — what is this article about and why should they care? This is a teaser, not the full content. Keep it under 200 characters.

**Date:** Convert the RSS publication date to `YYYY-MM-DD` format.

### Step 5: Write new articles to the Sheet

If there are new articles to write, format them as a JSON array of rows matching columns A-M:

```
[
  ["YYYY-MM-DD", "Title", "Author Name", "https://article-url", "https://image-url-or-empty", "substack", "Newsletter Name", "category", "Summary hook text", score_number, "", "ISO-datetime-now", "new"],
  ...
]
```

Column mapping:
- A: date (YYYY-MM-DD)
- B: title
- C: author (from CSV Author Name column)
- D: url (article URL)
- E: imageUrl (enclosure image or empty string)
- F: source (always "substack")
- G: sourceName (from CSV Newsletter Name column)
- H: category (claude-code / ai-tools / tutorials / news)
- I: summary (1-2 sentence hook)
- J: score (1-10 integer)
- K: (empty string)
- L: scrapedAt (current ISO datetime)
- M: status (always "new")

Append to the Sheet:
```bash
gws sheets +append --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --json-values '<the JSON array>'
```

If no new articles were found, skip this step.

## Post-run: Report results

Calculate duration from the start time recorded at the beginning.

Build a summary string like:
- "Checked 11 feeds, found 7 new posts, wrote 5 articles, skipped 2 duplicates"
- Or: "Checked 11 feeds, no new posts found"
- Or: "Checked 11 feeds (2 failed to load), wrote 3 articles"

Report to LCC:
```bash
curl -s -X POST \
  -H "Authorization: Bearer {API_KEY}" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/{LOOP_ID}/runs \
  -d '{"status":"success","summary":"the summary string","durationMs":elapsed}'
```

If any critical error occurred (e.g., gws CLI completely failed), use `"status":"error"` and include the error in `"errorMessage"`.
```

**Important notes for the prompt:**
- The `{LOOP_ID}` placeholder gets replaced with the real UUID after Task 3 registration.
- The `{API_KEY}` is read fresh from `.env.local` each run — never hardcoded in the prompt.
- The Sheet ID `1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU` IS hardcoded (it's not a secret).

---

### Task 3: Register the loop in LCC (with placeholder prompt)

The prompt references `{LOOP_ID}`, but we don't have the ID until after registration. Chicken-and-egg solution: register with a placeholder, get the ID, then PATCH with the real prompt.

**Step 1: POST the loop with placeholder prompt**

```bash
curl -s -X POST \
  -H "Authorization: Bearer lcc-api-key-2026-secret" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops \
  -d '{
    "projectId": "{SOEL_PROJECT_UUID from Task 1}",
    "name": "Substack digest scraper",
    "prompt": "PLACEHOLDER — will be replaced with full prompt",
    "interval": "24h",
    "cronExpression": "0 4 * * *",
    "enabled": true
  }'
```

Expected: JSON with `{ "loop": { "id": "some-uuid", ... } }`

Save the returned loop UUID.

**Step 2: Replace {LOOP_ID} in the prompt file**

Read `loop-control-center/Soel/loop-prompt.md`, replace all instances of `{LOOP_ID}` with the real UUID from Step 1.

**Step 3: PATCH the loop with the real prompt**

Read the updated prompt file content. PATCH the loop:

```bash
curl -s -X PATCH \
  -H "Authorization: Bearer lcc-api-key-2026-secret" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/{LOOP_UUID} \
  -d '{"prompt": "THE FULL PROMPT TEXT WITH REAL LOOP ID"}'
```

**Windows gotcha:** The prompt contains special characters. Use a temp JSON file and `curl -d @file.json` to avoid shell escaping issues:

```bash
# Write JSON to temp file
node -e "const fs=require('fs'); const p=fs.readFileSync('path/to/prompt.md','utf8'); fs.writeFileSync('$LOCALAPPDATA/Temp/soel-loop-patch.json', JSON.stringify({prompt:p}))"

# PATCH using file
curl -s -X PATCH \
  -H "Authorization: Bearer lcc-api-key-2026-secret" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/{LOOP_UUID} \
  -d @"$LOCALAPPDATA/Temp/soel-loop-patch.json"
```

**Step 4: Verify registration**

```bash
curl -s -H "Authorization: Bearer lcc-api-key-2026-secret" \
  https://loop-control-center.vercel.app/api/loops/{LOOP_UUID}
```

Confirm: name is "Substack digest scraper", enabled is true, prompt contains the real loop ID (not PLACEHOLDER).

---

### Task 4: Clean up test data from Sheet

The Sheet currently has 12 mock articles from Phase 1 with fake URLs. These will interfere with real data.

**Step 1: Check current Sheet contents**

```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!A1:D15'
```

Verify the 12 test rows are there (titles like "How I Built a Full-Stack App with Claude Code in 2 Hours" etc.)

**Step 2: Clear the test data (keep headers)**

```bash
gws sheets spreadsheets values clear --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --params '{"range": "Articles!A2:M1000"}'
```

**Note:** Check the exact `gws` command for clearing values — may need `spreadsheets batchUpdate` with a `DeleteRange` request instead. Verify syntax before running.

**Step 3: Verify headers remain**

```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!A1:M1'
```

Expected: Header row intact (date, title, author, url, imageUrl, source, sourceName, category, summary, score, reserved, scrapedAt, status).

---

### Task 5: Manual test run

Before activating the cron, run the core loop logic manually to verify everything works end-to-end.

**Step 1: Test one RSS feed**

Use WebFetch to fetch `https://corpwaters.substack.com/feed`. Extract one article's title, URL, date, content, and image. Verify the data looks correct.

**Step 2: Test dedup read**

```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!D:D'
```

Expected: Only the header "url" (Sheet was cleared in Task 4). No duplicates to skip.

**Step 3: Test scoring on one article**

Take the article content from Step 1. Score it using the rubric. Verify the score, category, and summary look reasonable.

**Step 4: Test append one row**

```bash
gws sheets +append --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU \
  --json-values '[["2026-03-10","Test Article Title","Test Author","https://test-url.example.com","","substack","Test Newsletter","ai-tools","Test summary hook.","7","","2026-03-10T06:00:00Z","new"]]'
```

**Step 5: Verify the row appeared**

```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!A2:M2'
```

Expected: The test row is there with all 13 columns correctly populated.

**Step 6: Delete the test row**

Clear it so we start clean:
```bash
gws sheets spreadsheets values clear --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --params '{"range": "Articles!A2:M2"}'
```

**Step 7: Test LCC run reporting**

```bash
curl -s -X POST \
  -H "Authorization: Bearer lcc-api-key-2026-secret" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/{LOOP_UUID}/runs \
  -d '{"status":"success","summary":"Manual test: all steps verified","durationMs":5000}'
```

Verify it appears on the LCC dashboard.

---

### Task 6: Run the full loop once manually

Execute the complete prompt end-to-end (all 11 feeds, real scoring, real Sheet writes) but without CronCreate — just run it directly to verify the full flow works.

**Step 1: Execute the prompt**

Run the full prompt text from `Soel/loop-prompt.md` as if CronCreate fired it. This means:
1. Read source CSV → get 11 feeds
2. WebFetch all 11 RSS feeds
3. Read Sheet URLs for dedup
4. Score and summarize each new article
5. Append all new articles to Sheet
6. Report results to LCC

**Step 2: Verify Sheet has real articles**

```bash
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!A1:D20'
```

Check: real article titles, real Substack URLs, dates make sense.

**Step 3: Verify SOEL frontend shows the articles**

Open `https://soel-sigma.vercel.app` in the browser (chrome-devtools MCP). Articles from the Substack feeds should appear. Check console for errors.

**Step 4: Verify LCC dashboard shows the run**

Open `https://loop-control-center.vercel.app` in the browser. The soel project should show the "Substack digest scraper" loop with the successful run.

---

### Task 7: Activate via CronCreate

Only after Task 6 succeeds — the full loop has been tested end-to-end.

**Step 1: Call CronCreate**

- **Cron expression:** `0 4 * * *` (6:00 AM EET / 4:00 AM UTC)
- **Description:** `[LCC] soel — Substack digest scraper`
- **Prompt:** The full wrapped prompt from `Soel/loop-prompt.md`

**Step 2: Verify CronCreate is active**

Use CronList to confirm the task appears with the correct schedule.

**Step 3: Commit the prompt file**

```bash
cd C:/Users/Kasutaja/Claude_Projects/loop-control-center
git add Soel/loop-prompt.md
git commit -m "feat: add SOEL Substack digest scraper loop prompt"
```

---

### Task 8: Update documentation

**Step 1: Add the loop to LCC STACK.md**

Add a new section under "Registered Loops" in `C:\Users\Kasutaja\Claude_Projects\loop-control-center\STACK.md`, matching the CrateDig format:

```markdown
### SOEL: Substack digest scraper
| Field | Value |
|-------|-------|
| Loop ID | `{LOOP_UUID}` |
| Project ID | `{SOEL_PROJECT_UUID}` |
| Interval | 24h (`0 4 * * *` = 6 AM EET) |
| Status | Enabled |

**What it does:** Reads 11 Substack RSS feeds, scores articles for Claude Code / AI tools relevance, writes summaries to the SOEL Google Sheet.

**Source list:** `Soel/sources/top_ai_substack_authors.csv` (11 newsletters)

**Sheet:** `1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU` → Articles tab
```

**Step 2: Update MEMORY.md**

Update the SOEL section: Phase 2 loop is registered and active. Note loop ID, project ID, and that SOEL frontend redesign is still pending.

**Step 3: Commit docs**

```bash
git add STACK.md
git commit -m "docs: add SOEL Substack scraper loop to registered loops"
```
