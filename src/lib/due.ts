// One due rule for the dashboard and the reminder email. Loops are started by hand, so "due" means the loop's own
// interval has passed since it last ran: a loop that never ran or whose last run failed is due as well.

export type LoopHealth = {
  status: "healthy" | "overdue" | "stale";
  label: string; // shown on the badge; empty when healthy
  nextDue: Date | null; // when a healthy loop becomes due; null when due now or the interval isn't a duration
};

type DueInput = {
  enabled: boolean;
  interval: string;
  lastRun: { startedAt: string | Date; status: string } | null;
};

export function parseIntervalMs(interval: string): number | null {
  const match = interval.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  return value * { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "m" | "h" | "d"];
}

export function loopHealth(loop: DueInput, now = Date.now()): LoopHealth {
  const intervalMs = parseIntervalMs(loop.interval);
  // Off, or no cadence ("manual"): never due.
  if (!loop.enabled || !intervalMs) return { status: "healthy", label: "", nextDue: null };
  if (!loop.lastRun) return { status: "overdue", label: "Never run", nextDue: null };
  if (loop.lastRun.status === "error") return { status: "overdue", label: "Last run failed", nextDue: null };

  const last = new Date(loop.lastRun.startedAt).getTime();
  const elapsed = now - last;
  if (elapsed >= intervalMs * 2) return { status: "stale", label: "Long overdue", nextDue: null };
  if (elapsed >= intervalMs) return { status: "overdue", label: "Due", nextDue: null };
  return { status: "healthy", label: "", nextDue: new Date(last + intervalMs) };
}

export const isDue = (h: LoopHealth) => h.status !== "healthy";
