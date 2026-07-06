import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loops, loopRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET — Get single loop (used by self-checking prompts)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [loop] = await db.select().from(loops).where(eq(loops.id, id));
  if (!loop) {
    return NextResponse.json({ error: "Loop not found" }, { status: 404 });
  }

  // Get last run
  const [lastRun] = await db
    .select()
    .from(loopRuns)
    .where(eq(loopRuns.loopId, id))
    .orderBy(desc(loopRuns.startedAt))
    .limit(1);

  return NextResponse.json({ loop, lastRun: lastRun || null });
}

// PATCH — Update loop (toggle enabled, edit interval)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.interval) updates.interval = body.interval;
  if (body.cronExpression) updates.cronExpression = body.cronExpression;
  if (body.name) updates.name = body.name;
  if (body.prompt) updates.prompt = body.prompt;
  if (body.trigger !== undefined) updates.trigger = body.trigger || null;

  const [row] = await db
    .update(loops)
    .set(updates)
    .where(eq(loops.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Loop not found" }, { status: 404 });
  }

  return NextResponse.json({ loop: row });
}

// DELETE — Delete a loop
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [row] = await db
    .delete(loops)
    .where(eq(loops.id, id))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "Loop not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
