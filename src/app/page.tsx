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

type Loop = {
  id: string;
  projectId: string;
  name: string;
  interval: string;
  enabled: boolean;
  cronExpression: string;
  lastRun: LoopRun | null;
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-fjord-950">Loop Control Center</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
                data.agentOnline
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                  : "bg-gray-100 text-gray-500 border-gray-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  data.agentOnline ? "bg-emerald-500" : "bg-gray-400"
                }`}
              />
              Agent {data.agentOnline ? "Online" : "Offline"}
            </span>
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
        {data.projects.length === 0 ? (
          <div className="border border-border rounded-lg bg-white p-8 text-center">
            <p className="text-muted text-sm">No projects yet.</p>
            <p className="text-muted text-sm mt-1">
              Click &quot;Sync from GitHub&quot; to import your repos, or create loops via Claude Code.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mb-8">
            {data.projects.map((project) => (
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
                    {project.loops.map((loop) => (
                      <div
                        key={loop.id}
                        className="flex items-center justify-between px-5 py-3 border-b border-fjord-50 last:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-fjord-950">
                              {loop.name}
                            </span>
                            <span className="text-xs text-muted font-mono">
                              {loop.interval}
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
                          {loop.lastRun && (
                            <p className="text-xs text-muted mt-0.5">
                              <span
                                className={
                                  loop.lastRun.status === "success"
                                    ? "text-emerald-600"
                                    : loop.lastRun.status === "error"
                                    ? "text-error"
                                    : "text-muted"
                                }
                              >
                                {loop.lastRun.status === "success" ? "✓" : "✗"}{" "}
                                {loop.lastRun.summary || loop.lastRun.status}
                              </span>
                              {" · "}
                              {timeAgo(loop.lastRun.startedAt)}
                            </p>
                          )}
                        </div>
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
                    ))}
                  </div>
                )}
              </div>
            ))}
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
