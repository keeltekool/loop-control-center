"use client";

import { useState, useEffect } from "react";

type LoopRun = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

type RunCounts = {
  total: number;
  success: number;
  error: number;
};

type Loop = {
  id: string;
  projectId: string;
  name: string;
  prompt: string;
  interval: string;
  enabled: boolean;
  cronExpression: string;
  createdAt: string;
  lastRun: LoopRun | null;
  runCounts: RunCounts;
};

type Project = {
  id: string;
  name: string;
  githubRepo: string | null;
  description: string | null;
  loops: Loop[];
};

type ActivityItem = {
  id: string;
  loopId: string;
  loopName: string | null;
  projectName: string | null;
  startedAt: string;
  completedAt: string | null;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

type DashboardData = {
  projects: Project[];
  recentActivity: ActivityItem[];
  agentOnline: boolean;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(0)}s`;
}

const statusColors: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-600 border-emerald-200",
  error: "bg-red-50 text-red-600 border-red-200",
  skipped: "bg-amber-50 text-amber-600 border-amber-200",
};

function parseIntervalMs(interval: string): number | null {
  const match = interval.match(/^(\d+)(m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function cronToSchedule(cron: string): string {
  // Guard: non-cron values like "manual" (or missing) crash the 5-field destructure
  const parts = (cron || "").split(" ");
  if (parts.length < 5) return cron || "";
  const [min, hour, , , dow] = parts;

  // Day-of-week specific (e.g., "33 7 * * 3,6" → "Wed+Sat 7:33")
  if (dow !== "*") {
    const days = dow.split(",").map((d) => DAY_NAMES[parseInt(d)] || d).join("+");
    const time = `${hour}:${min.padStart(2, "0")}`;
    return `${days} ${time}`;
  }

  // Every N hours (e.g., "0 */12 * * *" → "every 12h")
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (hourStep) return `every ${hourStep[1]}h`;

  // Every N minutes
  const minStep = min.match(/^\*\/(\d+)$/);
  if (minStep) return `every ${minStep[1]}m`;

  // Fixed daily time (e.g., "0 4 * * *" → "daily 4:00")
  if (dow === "*" && hour !== "*" && !hour.includes("/")) {
    return `daily ${hour}:${min.padStart(2, "0")}`;
  }

  return cron;
}

function getLoopHealth(loop: Loop): {
  status: "healthy" | "overdue" | "stale" | "waiting";
  label: string;
} {
  if (!loop.enabled) return { status: "healthy", label: "" };

  const intervalMs = parseIntervalMs(loop.interval);
  if (!intervalMs) return { status: "healthy", label: "" };

  if (!loop.lastRun) {
    return { status: "waiting", label: "" };
  }

  const lastRunTime = new Date(loop.lastRun.startedAt).getTime();
  const elapsed = Date.now() - lastRunTime;

  // Stale: >3x interval — loop has definitely stopped
  if (elapsed > intervalMs * 3) {
    return { status: "stale", label: "Stale — run /sync-loops" };
  }
  // Overdue: >1.5x interval — missed at least one cycle
  if (elapsed > intervalMs * 1.5) {
    return { status: "overdue", label: "Overdue" };
  }

  return { status: "healthy", label: "" };
}

type PromptSection = {
  title: string;
  content: string;
};

function parsePromptSections(prompt: string): PromptSection[] {
  const sections: PromptSection[] = [];
  const lines = prompt.split("\n");
  let currentTitle = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/);
    const h3Match = line.match(/^### (.+)/);
    const heading = h2Match || h3Match;

    if (heading) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
      }
      currentTitle = heading[1];
      currentContent = [];
    } else if (currentTitle) {
      currentContent.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentContent.join("\n").trim() });
  }
  return sections;
}

function LoopDetail({ loop }: { loop: Loop }) {
  const sections = parsePromptSections(loop.prompt);
  // Filter out pre-flight and post-run boilerplate — show the interesting task sections
  const taskSections = sections.filter(
    (s) =>
      !s.title.toLowerCase().includes("pre-flight") &&
      !s.title.toLowerCase().includes("post-run") &&
      !s.title.toLowerCase().includes("loop control center")
  );

  return (
    <div className="border-t border-fjord-100 bg-fjord-50/50">
      {/* Meta info */}
      <div className="px-5 py-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted border-b border-fjord-100">
        <span>
          <span className="text-fjord-600 font-medium">ID:</span>{" "}
          <span className="font-mono">{loop.id.slice(0, 8)}</span>
        </span>
        <span>
          <span className="text-fjord-600 font-medium">Cron:</span>{" "}
          <span className="font-mono">{loop.cronExpression}</span>
        </span>
        <span>
          <span className="text-fjord-600 font-medium">Prompt:</span>{" "}
          {loop.prompt.length.toLocaleString()} chars
        </span>
      </div>

      {/* Task sections */}
      {taskSections.map((section, i) => (
        <details key={i} className="group">
          <summary className="px-5 py-2.5 text-xs font-medium text-fjord-700 cursor-pointer hover:bg-fjord-50 transition-colors border-b border-fjord-100 flex items-center gap-2">
            <svg
              className="w-3 h-3 text-muted transition-transform group-open:rotate-90 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {section.title}
          </summary>
          <div className="px-5 py-3 border-b border-fjord-100">
            <pre className="text-[11px] text-fjord-700 leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">
              {section.content}
            </pre>
          </div>
        </details>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedLoops, setExpandedLoops] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; projectName: string; runCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchData() {
    const res = await fetch("/api/dashboard");
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function toggleLoop(loopId: string, enabled: boolean) {
    await fetch(`/api/loops/${loopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchData();
  }

  async function deleteLoop(loopId: string) {
    setDeleting(true);
    await fetch(`/api/loops/${loopId}`, { method: "DELETE" });
    setDeleteTarget(null);
    setDeleting(false);
    fetchData();
  }

  async function syncGitHub() {
    setSyncing(true);
    await fetch("/api/projects/sync-github", { method: "POST" });
    await fetchData();
    setSyncing(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto p-6 lg:p-8">
          <h1 className="text-2xl font-bold text-fjord-950">Loop Control Center</h1>
          <p className="mt-4 text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeProjects = data.projects.filter((p) => p.loops.length > 0);
  const emptyProjects = data.projects.filter((p) => p.loops.length === 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-fjord-950">Loop Control Center</h1>
            {data.recentActivity.length > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                  data.agentOnline
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-amber-50 text-amber-600 border-amber-200"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    data.agentOnline ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {data.agentOnline ? "Agent Active" : "Agent Idle"}
              </span>
            )}
          </div>
          <button
            onClick={syncGitHub}
            disabled={syncing}
            className="px-4 py-2 text-sm font-medium bg-white border border-fjord-200 text-fjord-700 rounded-lg hover:bg-fjord-50 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing..." : "Sync from GitHub"}
          </button>
        </div>

        {/* Projects with loops */}
        {activeProjects.length === 0 ? (
          <div className="border border-border rounded-lg bg-white p-8 text-center">
            <p className="text-muted text-sm">No loops configured yet.</p>
            <p className="text-muted text-sm mt-1">
              Create loops via Claude Code to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {activeProjects.map((project) => (
              <div
                key={project.id}
                className="border border-border rounded-lg bg-white overflow-hidden"
              >
                {/* Project header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-fjord-50">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-fjord-950">
                      {project.name}
                    </h2>
                    {project.githubRepo && (
                      <span className="text-xs text-muted font-mono">
                        {project.githubRepo}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {project.loops.length} loop{project.loops.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Loops */}
                {project.loops.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-muted">
                    No loops configured. Create one via Claude Code.
                  </div>
                ) : (
                  <div>
                    {project.loops.map((loop) => {
                      const hasRun = loop.lastRun !== null;
                      const isError = loop.lastRun?.status === "error";
                      const isSuccess = loop.lastRun?.status === "success";
                      const health = getLoopHealth(loop);
                      const borderColor = health.status === "stale"
                        ? "border-l-red-400"
                        : health.status === "overdue"
                        ? "border-l-amber-400"
                        : !hasRun
                        ? "border-l-fjord-200"
                        : isError
                        ? "border-l-red-400"
                        : isSuccess
                        ? "border-l-emerald-400"
                        : "border-l-amber-400";

                      return (
                        <div key={loop.id}>
                        <div
                          className={`px-5 py-4 border-b border-fjord-50 last:border-0 border-l-[3px] ${borderColor}`}
                        >
                          {/* Row 1: Name + interval + toggle */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-fjord-950">
                                {loop.name}
                              </span>
                              <span className="text-xs text-muted font-mono">
                                {cronToSchedule(loop.cronExpression)}
                              </span>
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
                                  loop.enabled
                                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                    : "bg-gray-100 text-gray-500 border-gray-200"
                                }`}
                              >
                                {loop.enabled ? "ON" : "OFF"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setDeleteTarget({
                                  id: loop.id,
                                  name: loop.name,
                                  projectName: project.name,
                                  runCount: loop.runCounts.total,
                                })}
                                className="p-1 text-fjord-300 hover:text-red-500 transition-colors"
                                title="Delete loop"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                              <button
                                onClick={() => toggleLoop(loop.id, !loop.enabled)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${
                                  loop.enabled ? "bg-emerald-500" : "bg-gray-300"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                                    loop.enabled ? "left-5" : "left-0.5"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>

                          {/* Row 2: Health + Last run status */}
                          {(health.status === "overdue" || health.status === "stale") && (
                            <div className="mt-2">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
                                  health.status === "stale"
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : "bg-amber-50 text-amber-600 border-amber-200"
                                }`}
                              >
                                {health.label}
                              </span>
                            </div>
                          )}
                          {hasRun ? (
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
                                    statusColors[loop.lastRun!.status] || "bg-gray-100 text-gray-500 border-gray-200"
                                  }`}
                                >
                                  {loop.lastRun!.status}
                                </span>
                                <span className="text-xs text-muted">
                                  {timeAgo(loop.lastRun!.startedAt)}
                                </span>
                                {loop.lastRun!.durationMs && (
                                  <span className="text-xs text-muted font-mono">
                                    {formatDuration(loop.lastRun!.durationMs)}
                                  </span>
                                )}
                              </div>
                              {loop.lastRun!.summary && (
                                <p className="text-xs text-fjord-700 mt-1 leading-relaxed">
                                  {loop.lastRun!.summary}
                                </p>
                              )}
                              {isError && loop.lastRun!.errorMessage && (
                                <p className="text-xs text-red-600 mt-1 leading-relaxed">
                                  {loop.lastRun!.errorMessage}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted mt-2">
                              Never run — waiting for first execution
                            </p>
                          )}

                          {/* Row 3: Stats + Detail toggle */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-4 text-[11px] text-muted">
                              <span>
                                {loop.runCounts.total} run{loop.runCounts.total !== 1 ? "s" : ""}
                              </span>
                              {loop.runCounts.success > 0 && (
                                <span className="text-emerald-600">
                                  {loop.runCounts.success} passed
                                </span>
                              )}
                              {loop.runCounts.error > 0 && (
                                <span className="text-red-500">
                                  {loop.runCounts.error} failed
                                </span>
                              )}
                              <span className="text-muted">
                                since {new Date(loop.createdAt).toLocaleDateString("en-GB", { month: "short", day: "numeric" })}
                              </span>
                            </div>
                            <button
                              onClick={() => {
                                setExpandedLoops((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(loop.id)) {
                                    next.delete(loop.id);
                                  } else {
                                    next.add(loop.id);
                                  }
                                  return next;
                                });
                              }}
                              className="text-[11px] text-fjord-500 hover:text-fjord-700 transition-colors font-medium"
                            >
                              {expandedLoops.has(loop.id) ? "Hide logic" : "View logic"}
                            </button>
                          </div>
                        </div>
                        {expandedLoops.has(loop.id) && <LoopDetail loop={loop} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Empty projects (collapsed) */}
        {emptyProjects.length > 0 && (
          <details className="mb-8">
            <summary className="text-xs text-muted cursor-pointer hover:text-fjord-600 transition-colors">
              {emptyProjects.length} project{emptyProjects.length !== 1 ? "s" : ""} without loops
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {emptyProjects.map((p) => (
                <span key={p.id} className="text-xs text-muted font-mono bg-fjord-50 px-2 py-1 rounded-lg">
                  {p.name}
                </span>
              ))}
            </div>
          </details>
        )}

        {/* Delete confirmation modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-fjord-950/40"
              onClick={() => !deleting && setDeleteTarget(null)}
            />
            <div className="relative bg-white rounded-lg border border-border w-full max-w-sm mx-4" style={{ boxShadow: 'var(--shadow-modal)' }}>
              <div className="px-5 py-4">
                <h3 className="text-sm font-semibold text-fjord-950">Delete loop?</h3>
                <p className="text-xs text-muted mt-2 leading-relaxed">
                  <span className="font-medium text-fjord-700">{deleteTarget.name}</span>
                  {" "}from <span className="font-medium text-fjord-700">{deleteTarget.projectName}</span> will
                  be permanently deleted along with {deleteTarget.runCount === 1 ? "1 run" : `${deleteTarget.runCount} runs`} of history.
                </p>
                <p className="text-[11px] text-muted mt-2">
                  Active scheduled tasks will stop on their next cycle. This cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-medium text-fjord-700 bg-white border border-fjord-200 rounded-lg hover:bg-fjord-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteLoop(deleteTarget.id)}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {data.recentActivity.length > 0 && (
          <div className="border border-border rounded-lg bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-fjord-50">
              <h2 className="text-sm font-semibold text-fjord-950">
                Recent Activity
              </h2>
            </div>
            <div>
              {data.recentActivity.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between px-5 py-2.5 border-b border-fjord-50 last:border-0 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xs text-muted font-mono shrink-0 w-28">
                      {formatDate(run.startedAt)}
                    </span>
                    <span className="text-xs text-fjord-600 font-medium shrink-0 w-24 truncate">
                      {run.projectName}
                    </span>
                    <span className="text-xs text-fjord-950 truncate">
                      {run.loopName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
                        statusColors[run.status] || "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {run.status}
                    </span>
                    <span className="text-xs text-muted font-mono w-10 text-right">
                      {formatDuration(run.durationMs)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
