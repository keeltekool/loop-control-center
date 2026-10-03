import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isDue, loopHealth, type LoopHealth } from "@/lib/due";

// Twice-weekly reminder (vercel.json cron, Mon + Thu): every enabled loop that is due, when it last ran and the
// command that starts it, then the rest with their next due date. Always sends, so a missing email means it broke.
// ?preview=1 returns the email as HTML without sending it. Auth: middleware (CRON_SECRET, API_KEY or a session).

const DASHBOARD = "https://loop-control-center.vercel.app";
const TZ = "Europe/Tallinn";

type Row = {
  name: string;
  project: string;
  interval: string;
  trigger: string | null;
  last_started: string | null;
  last_status: string | null;
};
type Item = Row & { health: LoopHealth };

export async function GET(request: NextRequest) {
  const { rows } = await db.execute<Row>(sql`
    SELECT l.name, p.name AS project, l.interval, l.trigger, r.started_at AS last_started, r.status AS last_status
    FROM loops l
    JOIN projects p ON p.id = l.project_id
    LEFT JOIN LATERAL (
      SELECT started_at, status FROM loop_runs WHERE loop_id = l.id ORDER BY started_at DESC LIMIT 1
    ) r ON true
    WHERE l.enabled`);

  const now = Date.now();
  const items: Item[] = rows.map((r) => ({
    ...r,
    health: loopHealth(
      { enabled: true, interval: r.interval, lastRun: r.last_started ? { startedAt: r.last_started, status: r.last_status ?? "" } : null },
      now,
    ),
  }));
  const rank = { stale: 0, overdue: 1, healthy: 2 };
  const age = (i: Item) => (i.last_started ? new Date(i.last_started).getTime() : 0);
  const due = items.filter((i) => isDue(i.health)).sort((a, b) => rank[a.health.status] - rank[b.health.status] || age(a) - age(b));
  const later = items
    .filter((i) => i.health.nextDue)
    .sort((a, b) => a.health.nextDue!.getTime() - b.health.nextDue!.getTime());

  const subject = due.length
    ? `${due.length} loop${due.length === 1 ? "" : "s"} due: ${due.map((i) => i.name).slice(0, 3).join(", ")}${due.length > 3 ? "…" : ""}`
    : `No loops due. Next: ${later[0] ? `${later[0].name}, ${day(later[0].health.nextDue!)}` : "none scheduled"}`;
  const html = render(due, later, now);

  if (request.nextUrl.searchParams.get("preview") === "1") {
    return new NextResponse(`<!doctype html><title>${esc(subject)}</title>${html}`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const to = process.env.REMINDER_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) return NextResponse.json({ error: "REMINDER_EMAIL or RESEND_API_KEY is not set" }, { status: 500 });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Loop Control Center <onboarding@resend.dev>", to, subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: "Resend refused the email", detail: body }, { status: 502 });
  return NextResponse.json({ sent: true, id: body.id, due: due.length, later: later.length, subject });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d: Date) => d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });

function lastRunText(i: Item, now: number): string {
  if (!i.last_started) return "never run";
  const started = new Date(i.last_started);
  const days = Math.floor((now - started.getTime()) / 86_400_000);
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `last run ${ago} (${day(started)})${i.last_status === "error" ? ", failed" : ""}`;
}

function render(due: Item[], later: Item[], now: number): string {
  const badge = (h: LoopHealth) => {
    const red = h.status === "stale" || h.label === "Last run failed";
    return `<span style="display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600;background:${red ? "#fef2f2" : "#fffbeb"};color:${red ? "#b91c1c" : "#b45309"};border:1px solid ${red ? "#fecaca" : "#fde68a"}">${esc(h.label)}</span>`;
  };
  const command = (t: string | null) =>
    t
      ? `<div style="margin-top:8px;font-family:Consolas,Menlo,monospace;font-size:14px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:7px 10px;color:#0f172a">${esc(t)}</div>`
      : `<div style="margin-top:8px;font-size:12px;color:#64748b;font-style:italic">No trigger command set</div>`;

  const dueRows = due
    .map(
      (i) => `<tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0">
        <div style="font-size:15px;font-weight:600;color:#0f172a">${esc(i.name)} ${badge(i.health)}</div>
        <div style="font-size:13px;color:#475569;margin-top:3px">${esc(i.project)} · ${esc(lastRunText(i, now))}</div>
        ${command(i.trigger)}
      </td></tr>`,
    )
    .join("");
  const laterRows = later
    .map(
      (i) => `<tr><td style="padding:6px 0;font-size:13px;color:#334155">${esc(i.name)}</td>
        <td style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;white-space:nowrap">due ${esc(day(i.health.nextDue!))}</td></tr>`,
    )
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px 16px;color:#0f172a">
  <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Loop Control Center</div>
  <h1 style="font-size:22px;margin:6px 0 4px">${due.length ? `${due.length} loop${due.length === 1 ? "" : "s"} due` : "Nothing due"}</h1>
  <p style="font-size:14px;color:#475569;margin:0 0 8px">Copy a command into Claude Code to start that loop. One at a time.</p>
  ${due.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${dueRows}</table>` : ""}
  ${later.length ? `<h2 style="font-size:14px;margin:24px 0 4px;color:#334155">Coming up</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${laterRows}</table>` : ""}
  <p style="margin-top:28px"><a href="${DASHBOARD}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:6px;font-size:14px">Open Loop Control Center</a></p>
</div>`;
}
