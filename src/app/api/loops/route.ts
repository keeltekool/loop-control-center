import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loops, loopRuns, projects } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

// GET — List loops (optional filters: ?enabled=true, ?project_id=X)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const enabledFilter = searchParams.get("enabled");
  const projectIdFilter = searchParams.get("project_id");

  const conditions = [];
  if (enabledFilter === "true") conditions.push(eq(loops.enabled, true));
  if (enabledFilter === "false") conditions.push(eq(loops.enabled, false));
  if (projectIdFilter) conditions.push(eq(loops.projectId, projectIdFilter));

  const rows = await db
    .select({
      id: loops.id,
      projectId: loops.projectId,
      projectName: projects.name,
      name: loops.name,
      prompt: loops.prompt,
      interval: loops.interval,
      cronExpression: loops.cronExpression,
      trigger: loops.trigger,
      enabled: loops.enabled,
      createdAt: loops.createdAt,
      updatedAt: loops.updatedAt,
    })
    .from(loops)
    .leftJoin(projects, eq(loops.projectId, projects.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(projects.name, loops.name);

  return NextResponse.json({ loops: rows });
}

// POST — Create a new loop
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, name, prompt, interval, cronExpression, trigger, enabled } = body;

  if (!projectId || !name || !prompt || !interval || !cronExpression) {
    return NextResponse.json(
      { error: "Missing required fields: projectId, name, prompt, interval, cronExpression" },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(loops)
    .values({
      projectId,
      name,
      prompt,
      interval,
      cronExpression,
      trigger: trigger || null,
      enabled: enabled !== false,
    })
    .returning();

  return NextResponse.json({ loop: row }, { status: 201 });
}
