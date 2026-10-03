# Loop reminders + YouTube Radar as a manual loop

Approved by the owner 2026-10-03 in chat ("Other all I fully agree … start executing"). Owner change to the proposal:
YouTube Radar runs fully manual and the cloud routine goes ("make this full loop manual and scrape the cloud part").

## Phase 1 — YouTube Radar becomes a manual LCC loop

Why: YouTube bot-blocks yt-dlp from datacenter IPs (GitHub runners, cloud routines), so transcripts only come from
the owner's machine. A scheduled scorer would score videos before a manual loop pulled their transcripts.

- [x] 1.1 Register LCC loop "YouTube Radar (manual)" (project idea-radar, interval 84h, sentinel cron `0 0 29 2 0`,
      trigger `run loop youtube-radar`). Prompt = source of truth: RSS scrape → transcripts (en-orig) → Steps 1–7 of
      `idea-radar/loop/youtube-radar-pipeline.md` → report the run to LCC. Tokens are read from `.env.local` files at
      run time, never written into the prompt.
- [x] 1.2 Disable cloud routine `trig_01WFvdCPwdBqeaUbciNPX4tM` (API has no delete; the owner deletes the record in
      claude.ai).
- [x] 1.3 idea-radar: drop the transcript step from `youtube-scrape.yml` (the metadata scrape stays on its schedule as
      a collector between manual runs); runbook header + STACK say the loop runs locally.
- [x] 1.4 radar-check: YouTube Radar moves from `cloud` to `manual` (command chip + cadence).
- [x] Gate 1 (first real run 2026-10-03 at the owner's request: 188 screened, transcripts 186/188, 8 accepted, memo #7, newsletter sent, run recorded in LCC. Earlier: partly done 2026-10-03: loop registered 63d77be4, routine off, youtube-scrape.yml dispatch green with 24 sources / 0 errors, radar-check shipped with all 95 checks passing. **Deferred by the owner:** the first real loop run — "Dont run the loop currently".) Original gate: one real `run loop youtube-radar`: transcripts saved > 0, decisions + memo saved, newsletter sent, run
      recorded in LCC; `youtube-scrape.yml` dispatch green; radar-check shipped through ship.mjs.

## Phase 2 — Due-loop reminder email (LCC)

- [x] 2.1 One due rule for dashboard and email (`src/lib/due.ts`): due once the interval has passed, long overdue at
      2×, a failed last run is due, an enabled loop that never ran is due. Disabled loops never show.
- [x] 2.2 Loop cleanup through the API: intervals — Scrapyard fix 168h, Market Watch 168h, VAIB-X ingest 168h, EE AI
      Watch 336h, Builder/Setup Reflection 336h. Disable (keeps history): CrateDig auto-roll, both SÕEL loops, Meeting
      Transcriber, Mindloop weekly, VAIB analyze, Allekirjoitus scan, Idea Radar Pipeline. Prindipesa jaht and Athlon
      ingest stay (owner: "let them be there yes, doesnt mean im going to initiate those").
- [x] 2.3 Missing run reports: the setup-reflection and builder-reflection bridge skills POST their run to LCC;
      backfill Setup Reflection's 2026-09-26 run.
- [x] 2.4 `GET /api/cron/reminder` (Bearer `CRON_SECRET`, Vercel cron `0 5 * * 1,4` = Mon + Thu 08:00 Tallinn summer
      time). Resend (`RESEND_API_KEY`, key `loop-control-center`), from `onboarding@resend.dev` to `REMINDER_EMAIL`.
      Always sends; subject carries the due count. Body: due loops (name, last run, status, trigger command in mono),
      then the rest with their next due date, link to the dashboard.
- [x] 2.5 `scripts/check-ui-flows.mjs` for LCC: login, Due now matches the due rule, trigger chip copies, 375 + 1440.
- [x] Gate 2 (2026-10-03: shipped 641b1f2, ship.mjs PASS incl. check-ui-flows at 375 + 1440; reminder fired on production → Resend accepted, 5 due / 4 coming up; cron registered `0 5 * * 1,4`. Owner confirmed 2026-10-03: "E-mail was in the box, its nice and accurate". Review fixes 8ae842f shipped, checks pass.): reminder fired once by hand on production → email arrives (owner confirms); check-ui-flows passes;
      ship.mjs passes.

Finish: code-reviewer, /simplify, STACK + memory.
