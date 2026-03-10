## Loop Control Center — Managed Task
- Loop ID: b4b870cf-6333-4f49-991e-630ca40b515b
- Project: soel
- Name: Substack digest scraper

## Pre-flight: Check if still enabled

1. Read the LCC API key from `C:\Users\Kasutaja\Claude_Projects\loop-control-center\.env.local` — extract the `API_KEY` value.
2. Fetch the loop status:
   ```
   curl -s -H "Authorization: Bearer <API_KEY>" https://loop-control-center.vercel.app/api/loops/b4b870cf-6333-4f49-991e-630ca40b515b
   ```
3. Parse the JSON response. If `"enabled"` is `false`, report as skipped and STOP:
   ```
   curl -s -X POST -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" \
     https://loop-control-center.vercel.app/api/loops/b4b870cf-6333-4f49-991e-630ca40b515b/runs \
     -d '{"status":"skipped","summary":"Loop disabled in dashboard","durationMs":0}'
   ```
   Then stop — do not proceed with the task.

## Task: Scrape Substack RSS feeds and write to SOEL Google Sheet

Record the start time now (use `date +%s` via Bash) for duration tracking.

### Step 1: Read the source list

Read the CSV file at:
`C:\Users\Kasutaja\Claude_Projects\loop-control-center\Soel\sources\top_ai_substack_authors.csv`

Parse it to extract for each data row (skip header):
- **Substack URL** (column 4) — append `/feed` to get RSS URL
- **Author Name** (column 2) — for Sheet column C
- **Newsletter Name** (column 3) — for Sheet column G

You should get 11 sources.

### Step 2: Fetch RSS feeds

For each source, use WebFetch to fetch `{Substack URL}/feed`.

Extract from each RSS feed:
- **title** — the article title (`<title>` inside each `<item>`)
- **url** — the article link (`<link>` inside each `<item>`)
- **pubDate** — publication date (`<pubDate>`)
- **content** — article body text (`<description>` or `<content:encoded>`) — used for scoring
- **imageUrl** — if there is an `<enclosure>` element with `type` starting with `image/`, use its `url` attribute. Otherwise empty string.

Collect articles from ALL feeds into a single list. If a feed fails to load, log the error and continue with remaining feeds — do not stop the entire run.

### Step 3: Deduplicate against existing Sheet data

Read existing URLs from the Sheet:
```
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'Articles!D:D'
```

Compare each fetched article URL against this list. Drop any article whose URL already exists. Keep a count of duplicates skipped.

### Step 4: Score and summarize each new article

For each new (non-duplicate) article, analyze the RSS content and produce:

**Score (1-10) — relevance to Claude Code / AI tools / vibe coding:**
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

**Date:** Convert the RSS pubDate to `YYYY-MM-DD` format.

### Step 5: Write new articles to the Sheet

If there are new articles to write, format them as a JSON array of rows matching columns A-M:

```
[
  ["YYYY-MM-DD", "Title", "Author Name", "https://article-url", "https://image-url-or-empty", "substack", "Newsletter Name", "category", "Summary hook text", "score_as_string", "", "ISO-datetime-now", "new"],
  ...
]
```

Column mapping:
- A: date (YYYY-MM-DD from pubDate)
- B: title (article title)
- C: author (Author Name from CSV)
- D: url (article URL — the dedup key)
- E: imageUrl (enclosure image URL or empty string "")
- F: source (always "substack")
- G: sourceName (Newsletter Name from CSV)
- H: category (claude-code / ai-tools / tutorials / news)
- I: summary (1-2 sentence hook, under 200 chars)
- J: score (integer 1-10)
- K: "" (reserved, always empty)
- L: scrapedAt (current ISO datetime, e.g. "2026-03-10T04:00:00Z")
- M: status (always "new")

Write to the Sheet. IMPORTANT: All values must be strings (including score — use "7" not 7). Use the raw Sheets API to append multi-row data correctly:

```bash
# Step 1: Write the JSON body to a temp file (avoid shell escaping issues)
node -e "const fs=require('fs'); fs.writeFileSync('C:/Users/Kasutaja/AppData/Local/Temp/soel-articles.json', JSON.stringify({values: THE_ROWS_ARRAY}))"

# Step 2: Append using the raw values.append API
gws sheets spreadsheets values append \
  --params '{"spreadsheetId": "1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU", "range": "Articles!A1:M1", "valueInputOption": "USER_ENTERED"}' \
  --json "$(cat C:/Users/Kasutaja/AppData/Local/Temp/soel-articles.json)"
```

NOTE: Do NOT use `gws sheets +append --json-values` with `xargs` for multi-row data — it flattens nested arrays into one row. Always use the raw `values.append` API with `--json '{"values": [...]}'` for bulk inserts.

If no new articles were found (all duplicates or all feeds failed), skip this step.

### Error handling

| Error | Action |
|-------|--------|
| RSS feed unreachable / timeout | Skip that feed, continue with others, note in summary |
| gws CLI fails (auth, network) | Report error to LCC, stop — do not partial-write |
| All feeds empty / no new posts | Report "no new posts found", normal success completion |
| gws auth expired | Report error with message "gws auth expired — run gws auth to refresh" |

## Post-run: Report results

Calculate duration: `current_time - start_time` in milliseconds.

Build a summary string like:
- "Checked 11 feeds, found 7 new posts, wrote 7 articles, skipped 3 duplicates"
- "Checked 11 feeds, no new posts found"
- "Checked 11 feeds (2 failed to load), wrote 3 articles"

Report to LCC:
```
curl -s -X POST \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/b4b870cf-6333-4f49-991e-630ca40b515b/runs \
  -d '{"status":"success","summary":"the summary string","durationMs":elapsed_ms}'
```

If any critical error occurred (gws CLI completely failed, all feeds unreachable), use `"status":"error"` instead and describe the error in the summary.
