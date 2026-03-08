import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, loops, loopRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  // Get all projects with their loops and latest run
  const allProjects = await db.select().from(projects).orderBy(projects.name);

  const allLoops = await db
    .select({
      id: loops.id,
      projectId: loops.projectId,
      name: loops.name,
      interval: loops.interval,
      enabled: loops.enabled,
      cronExpression: loops.cronExpression,
    })
    .from(loops)
    .orderBy(loops.name);

  // Get latest run for each loop
  const loopIds = allLoops.map((l) => l.id);
  const latestRuns: Record<string, typeof loopRuns.$inferSelect> = {};

  for (const loopId of loopIds) {
    const [run] = await db
      .select()
      .from(loopRuns)
      .where(eq(loopRuns.loopId, loopId))
      .orderBy(desc(loopRuns.startedAt))
      .limit(1);
    if (run) latestRuns[loopId] = run;
  }

  // Get recent activity (last 20 runs across all loops)
  const recentRuns = await db
    .select({
      id: loopRuns.id,
      loopId: loopRuns.loopId,
      loopName: loops.name,
      projectName: projects.name,
      startedAt: loopRuns.startedAt,
      completedAt: loopRuns.completedAt,
      status: loopRuns.status,
      summary: loopRuns.summary,
      errorMessage: loopRuns.errorMessage,
      durationMs: loopRuns.durationMs,
    })
    .from(loopRuns)
    .leftJoin(loops, eq(loopRuns.loopId, loops.id))
    .leftJoin(projects, eq(loops.projectId, projects.id))
    .orderBy(desc(loopRuns.startedAt))
    .limit(20);

  // Determine agent status: online if any run completed in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const agentOnline = recentRuns.some(
    (r) => r.completedAt && new Date(r.completedAt) > oneHourAgo
  );

  // Group loops by project
  const projectsWithLoops = allProjects.map((project) => ({
    ...project,
    loops: allLoops
      .filter((l) => l.projectId === project.id)
      .map((l) => ({
        ...l,
        lastRun: latestRuns[l.id] || null,
      })),
  }));

  return NextResponse.json({
    projects: projectsWithLoops,
    recentActivity: recentRuns,
    agentOnline,
  });
}
