// Edge cases of the shared due rule (src/lib/due.ts). Run: node scripts/check-due.ts
import assert from "node:assert/strict";
import { loopHealth } from "../src/lib/due.ts";

const H = 3_600_000;
const now = Date.UTC(2026, 9, 3, 12);
const ran = (msAgo: number, status = "success") => ({ startedAt: new Date(now - msAgo), status });
const check = (interval: string, lastRun: ReturnType<typeof ran> | null, enabled = true) =>
  loopHealth({ enabled, interval, lastRun }, now);

assert.equal(check("manual", null).status, "healthy", "a manual-interval loop is never due");
assert.equal(check("168h", null, false).status, "healthy", "a disabled loop is never due");
assert.equal(check("168h", ran(500 * H), false).status, "healthy", "a disabled overdue loop is never due");
assert.equal(check("168h", null).label, "Never run", "an enabled loop that never ran is due");
assert.equal(check("168h", ran(H, "error")).label, "Last run failed", "a failed last run is due");
assert.equal(check("168h", ran(168 * H - 1)).status, "healthy", "1 ms before the interval: not due");
assert.equal(check("168h", ran(168 * H - 1)).nextDue?.getTime(), now + 1, "next due is last run + interval");
assert.equal(check("168h", ran(168 * H)).label, "Due", "exactly at the interval: due");
assert.equal(check("168h", ran(336 * H - 1)).status, "overdue", "just under 2x: still due, not long overdue");
assert.equal(check("168h", ran(336 * H)).status, "stale", "at 2x: long overdue");
assert.equal(check("2d", ran(2 * 24 * H)).label, "Due", "days parse like hours");

console.log("check-due: all 11 cases pass");
