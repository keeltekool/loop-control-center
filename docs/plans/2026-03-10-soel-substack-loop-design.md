# SOEL Phase 2 — Substack Research Loop

## Summary

A daily Claude Code loop that reads 11 Substack RSS feeds, scores each article for relevance to Claude Code / AI tools / vibe coding, writes a short summary, and appends new articles to the existing SOEL Google Sheet. The SOEL frontend displays whatever is in the Sheet — no coupling between loop and display.

## Decisions

| Decision | Answer |
|----------|--------|
| Frequency | Once daily, 6:00 AM EET (`0 4 * * *` UTC) |
| Data source | Substack RSS feeds (`{url}/feed`) — verified working |
| Scoring | Relevance-only (1-10): how closely does the article match Claude Code / AI tools / vibe coding |
| Minimum score | None — all articles written to Sheet |
| Deduplication | URL-based: read Sheet column D before writing, skip existing URLs |
| Sheet write method | `gws sheets +append --json-values` (bulk multi-row) |
| Source list | Read from CSV each run (add/remove sources without re-registering loop) |
| Images | Extract from RSS `<enclosure>` if image type, empty if not |
| Frontend changes | Separate task — redesign to show short intro + click-through to Substack |

## Actors

| Actor | Role | Exists? |
|-------|------|---------|
| CronCreate loop | Runs daily, fetches RSS, scores, summarizes, writes to Sheet | To build (prompt only) |
| 11 Substack RSS feeds | Content sources | Yes |
| Google Sheet | Article database — Articles tab columns A-M | Yes (`1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU`) |
| Loop Control Center | Stores loop config, ON/OFF toggle, run history | Yes |
| SOEL frontend | Dumb display — reads Sheet, renders digest | Yes |
| `gws` CLI | Reads/writes Sheet (authenticated via Google OAuth) | Yes |

## Source List

CSV at `loop-control-center/Soel/sources/top_ai_substack_authors.csv`:

| # | Author | Newsletter | URL |
|---|--------|------------|-----|
| 1 | Mikhail Shcheglov | Corporate Waters | corpwaters.substack.com |
| 2 | Aakash Gupta | Product Growth | news.aakashg.com |
| 3 | Nate | Nate's Newsletter | natesnewsletter.substack.com |
| 4 | Oren | AI Maker | aimaker.substack.com |
| 5 | Ruben Hassid | How to AI | ruben.substack.com |
| 6 | Daniel Williams | Claude Code for Non-Coders | claudecodefornoncoders.substack.com |
| 7 | Christopher Penn | Almost Timely News | almosttimely.substack.com |
| 8 | Abel A. Seyoum | Vibing with AI | vibingwithai.substack.com |
| 9 | John Ellison | John Ellison's Substack | iamjohnellison.substack.com |
| 10 | Department of Product | Department of Product | departmentofproduct.substack.com |
| 11 | Multiple authors | Aible W My Mind | aiblewmymind.substack.com |

All free, all verified to serve RSS at `/feed`.

## Flow (Per Run)

```
6:00 AM EET — CronCreate fires
|
+-- 1. PRE-FLIGHT: GET /api/loops/{id} -> if disabled, report "skipped", stop
|
+-- 2. READ SOURCE CSV: Parse Substack URLs + author names + newsletter names
|
+-- 3. FETCH RSS: WebFetch each {url}/feed (11 feeds)
|     +-- Parse: title, author, date, URL, article content, enclosure image
|
+-- 4. DEDUPE: gws sheets +read --range 'Articles!D:D'
|     +-- Drop any article whose URL already exists in Sheet
|
+-- 5. SCORE + SUMMARIZE (Claude inline reasoning):
|     For each new article:
|     +-- Score 1-10 (relevance to Claude Code / AI tools / vibe coding)
|     +-- Write 1-2 sentence hook summary
|     +-- Assign category: claude-code | ai-tools | tutorials | news
|     +-- Extract cover image from enclosure (if image type)
|
+-- 6. WRITE: gws sheets +append --spreadsheet ID --json-values '[rows]'
|     +-- Columns A-M match existing schema
|     +-- ALL articles written (no score filter)
|
+-- 7. POST-RUN: Report to LCC dashboard
      +-- "Found 7 new posts, wrote 5, skipped 2 duplicates"
```

## Sheet Schema (Columns A-M, unchanged)

| Col | Field | Source |
|-----|-------|--------|
| A | date | RSS pubDate -> YYYY-MM-DD |
| B | title | RSS title |
| C | author | From CSV (newsletter author name) |
| D | url | RSS link |
| E | imageUrl | RSS enclosure image URL if present, empty if not |
| F | source | `substack` (hardcoded) |
| G | sourceName | From CSV (newsletter name) |
| H | category | Claude assigns: claude-code / ai-tools / tutorials / news |
| I | summary | Claude writes: 1-2 sentence hook |
| J | score | Claude assigns: 1-10 relevance |
| K | (reserved) | Empty |
| L | scrapedAt | ISO datetime of loop run |
| M | status | `new` |

## Scoring Criteria

Relevance-only scale:

- 9-10: Directly about Claude Code (features, tutorials, workflows, tips)
- 7-8: AI coding tools broadly (Cursor, Copilot, vibe coding practices)
- 5-6: General AI/LLM content with developer angle
- 3-4: Tangentially related (productivity, tech industry)
- 1-2: Off-topic (marketing, non-tech)

## Tools Used Per Step

| Step | Tool | Verified |
|------|------|----------|
| Pre-flight (LCC check) | WebFetch GET | Yes (CrateDig loop does this) |
| Read source CSV | Read tool | Yes (CronCreate has file access) |
| Fetch RSS feeds | WebFetch x11 | Yes (tested 3/11, valid RSS) |
| Parse articles | Claude reasoning | Yes |
| Read existing URLs | `gws sheets +read --range 'Articles!D:D'` | Yes |
| Score + summarize | Claude reasoning | Yes |
| Append rows | `gws sheets +append --json-values` | Yes (supports bulk) |
| Report to LCC | WebFetch POST | Yes (CrateDig loop does this) |

## Error Handling

| Error | Action |
|-------|--------|
| RSS feed unreachable | Skip that feed, continue with others, note in report |
| gws CLI fails | Report error to LCC, stop (don't partial-write) |
| All feeds empty / no new posts | Report "no new posts found", normal completion |
| Loop disabled in LCC | Pre-flight catches it, reports "skipped" |
| gws auth expired | Report error to LCC with clear message |

## File Locations

| Thing | Location |
|-------|----------|
| Source CSV | `loop-control-center/Soel/sources/top_ai_substack_authors.csv` |
| Loop config + prompt | LCC database (registered via POST /api/loops) |
| Cron schedule | CronCreate: `0 4 * * *` (6 AM EET / 4 AM UTC) |
| Article data | Google Sheet `Articles` tab |
| LCC API key | `loop-control-center/.env.local` (read fresh each run) |

## What This Does NOT Include

- SOEL frontend redesign (short intro + click-through) — separate task
- Adding non-Substack sources — future extension
- Any new infrastructure, services, or code files

## Implementation

The entire "build" is writing a single self-contained prompt and registering it as a loop:

1. Write the prompt text (with all URLs, gws commands, scoring rubric)
2. POST to LCC as a new loop (project: soel)
3. PATCH with real loop ID (chicken-and-egg: prompt references its own ID)
4. Test manually once
5. Activate via CronCreate

## Timing Note

`0 4 * * *` UTC = 6:00 AM EET. When EEST starts (last Sunday of March), this becomes 7:00 AM. Adjust cron to `0 3 * * *` if needed.
