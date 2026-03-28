## Loop Control Center — Managed Task
- Loop ID: 27c68ac0-77a5-45db-b4dd-5950d3023952
- Project: soel
- Name: SÕEL YouTube digest

## Pre-flight: Check if still enabled

1. Read the LCC API key from `C:\Users\Kasutaja\Claude_Projects\loop-control-center\.env.local` — extract the `API_KEY` value.
2. Fetch the loop status:
   ```
   curl -s -H "Authorization: Bearer <API_KEY>" https://loop-control-center.vercel.app/api/loops/27c68ac0-77a5-45db-b4dd-5950d3023952
   ```
3. Parse the JSON response. If `"enabled"` is `false`, report as skipped and STOP:
   ```
   curl -s -X POST -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" \
     https://loop-control-center.vercel.app/api/loops/27c68ac0-77a5-45db-b4dd-5950d3023952/runs \
     -d '{"status":"skipped","summary":"Loop disabled in dashboard","durationMs":0}'
   ```
   Then stop — do not proceed with the task.

## Task: Scrape YouTube RSS feeds and write to SÕEL Google Sheet

Record the start time now (use `date +%s` via Bash) for duration tracking.

### Step 1: Read the source list

Read the CSV file at:
`C:\Users\Kasutaja\Claude_Projects\loop-control-center\Soel\sources\youtube_channels.csv`

CSV columns (skip header row):
- Column 1: Rank
- Column 2: Channel Name → Sheet column C (author)
- Column 3: Handle (not used for fetching)
- Column 4: URL (not used for fetching)
- Column 5: Feed URL → the actual URL to fetch
- Column 6: Focus / Angle (context for scoring)
- Column 7: Tier → used for scoring context

You should get ~73 sources.

### Step 2: Fetch feeds

For each source, use WebFetch to fetch the **Feed URL** (column 5) directly.

Extract from each RSS/Atom feed:
- **title** — the video title (`<title>` inside each `<entry>`)
- **url** — the video link (`<link>` with `rel="alternate"` inside each `<entry>`, take the `href` attribute)
- **pubDate** — publication date (`<published>` or `<updated>`)
- **content** — video description (`<media:description>` or `<media:group>` content) — used for scoring
- **imageUrl** — video thumbnail (`<media:thumbnail>` `url` attribute, or `<media:group><media:thumbnail>` `url` attribute). YouTube feeds always include thumbnails.

**Only collect videos published in the last 48 hours.** Skip anything older to avoid processing the entire backlog of 73 channels x 15 videos = 1000+ entries. Compare each video's pubDate against the current time minus 48 hours.

Collect videos from ALL feeds into a single list. If a feed fails to load, log the error and continue with remaining feeds — do not stop the entire run.

### Step 3: Deduplicate against existing Sheet data

Read existing URLs from the YouTubeVideos tab:
```
gws sheets +read --spreadsheet 1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU --range 'YouTubeVideos!D:D'
```

Compare each fetched video URL against this list. Drop any video whose URL already exists. Keep a count of duplicates skipped.

### Step 4: Score and categorize each new video

For each new (non-duplicate) video, analyze the title and description to produce a score, category, and summary.

**Scoring rubric — tuned to the user's interests:**

The user is a developer at SK ID Solutions building API products, who builds side projects with Next.js/Vercel/TypeScript, uses Claude Code extensively, and is interested in AI-assisted development, indie building, and API design.

**Score (1-10):**
- 9-10: Claude Code tutorials, MCP server builds, Claude Skills/Cowork workflows, agentic coding with Claude
- 8-9: AI coding tools hands-on (Cursor, Copilot, Codex, vibe coding), building real apps with AI
- 7-8: Next.js/Vercel/React/TypeScript tutorials, Tailwind CSS, full-stack builds
- 6-7: General AI/LLM content with practical developer angle, API design, system design
- 4-5: Tangentially related (generic tech news, opinion pieces, career advice)
- 1-3: Off-topic (gaming, lifestyle, entertainment, pure news commentary without building)

**Score floor: DROP any video scoring below 5.** Only quality, relevant content gets through.

**Category — pick exactly one:**
- `claude-code` — video is primarily about Claude Code, Cowork, or Anthropic dev tools
- `ai-tools` — video is about AI coding tools, vibe coding, or AI-assisted development
- `webdev` — video is about Next.js, React, TypeScript, CSS, Vercel, web frameworks
- `tutorials` — video is a how-to, course, or step-by-step build guide
- `api-design` — video is about APIs, system design, backend architecture
- `news` — video is industry news, model releases, or tech commentary

**Summary:** Write 1-2 sentences that hook the reader — what is this video about and why should they watch? Keep it under 200 characters.

**Date:** Convert the RSS pubDate to `YYYY-MM-DD` format.

### Step 5: Write new videos to the Sheet

Format scored videos (score 5+) as a JSON array of rows matching columns A-M:

```
[
  ["YYYY-MM-DD", "Video Title", "Channel Name", "https://youtube.com/watch?v=xxx", "https://i.ytimg.com/vi/xxx/hqdefault.jpg", "youtube", "Channel Name", "category", "Summary hook text", "score_as_string", "", "ISO-datetime-now", "new"],
  ...
]
```

Column mapping:
- A: date (YYYY-MM-DD from pubDate)
- B: title (video title)
- C: author (Channel Name from CSV)
- D: url (video URL — the dedup key)
- E: imageUrl (thumbnail URL from RSS feed)
- F: source (always "youtube")
- G: sourceName (Channel Name from CSV)
- H: category (from rubric above)
- I: summary (1-2 sentence hook, under 200 chars)
- J: score (integer 5-10 as string)
- K: "" (reserved, always empty)
- L: scrapedAt (current ISO datetime)
- M: status (always "new")

Write to the YouTubeVideos tab. IMPORTANT: All values must be strings (including score — use "7" not 7). Use the raw Sheets API to append multi-row data correctly:

```bash
node -e "const fs=require('fs'); fs.writeFileSync('C:/Users/Kasutaja/AppData/Local/Temp/soel-youtube.json', JSON.stringify({values: ROWS_ARRAY}))"

gws sheets spreadsheets values append \
  --params '{"spreadsheetId": "1LKyQp9VD4YD3O-ixOQ6yxl-a-Ud_wvTyRABxn_IlugU", "range": "YouTubeVideos!A1:M1", "valueInputOption": "USER_ENTERED"}' \
  --json "$(cat C:/Users/Kasutaja/AppData/Local/Temp/soel-youtube.json)"
```

NOTE: Do NOT use `gws sheets +append --json-values` with `xargs` for multi-row data — it flattens nested arrays into one row. Always use the raw `values.append` API with `--json '{"values": [...]}'` for bulk inserts.

If no new videos (all duplicates or all feeds failed or all below score threshold), skip the write step.

### Error handling

| Error | Action |
|-------|--------|
| RSS feed unreachable / timeout | Skip that feed, continue with others, note in summary |
| gws CLI fails (auth, network) | Report error to LCC, stop — do not partial-write |
| All feeds empty / no new videos | Report "no new videos found", normal success completion |
| gws auth expired | Report error with message "gws auth expired — run gws auth to refresh" |

## Post-run: Report results

Calculate duration: `current_time - start_time` in milliseconds.

Build a summary string like:
- "Checked 73 feeds (3 failed). YouTubeVideos: 18 new videos written (42 dropped below score 5, 7 dupes skipped)."
- "Checked 73 feeds, no new videos in last 48h"

Report to LCC:
```
curl -s -X POST \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  https://loop-control-center.vercel.app/api/loops/27c68ac0-77a5-45db-b4dd-5950d3023952/runs \
  -d '{"status":"success","summary":"the summary string","durationMs":elapsed_ms}'
```

If any critical error occurred (gws CLI completely failed, all feeds unreachable), use `"status":"error"` instead and describe the error in the summary.
