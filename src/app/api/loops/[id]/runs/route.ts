import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loopRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET — Get run history for a loop
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const rows = await db
    .select()
    .from(loopRuns)
    .where(eq(loopRuns.loopId, id))
    .orderBy(desc(loopRuns.startedAt))
    .limit(limit);

  return NextResponse.json({ runs: rows });
}

// POST — Report a run result (Claude Code calls this after each loop execution)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, summary, errorMessage, startedAt, completedAt, durationMs } = body;

  if (!status) {
    return NextResponse.json(
      { error: "Status is required" },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(loopRuns)
    .values({
      loopId: id,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      completedAt: completedAt ? new Date(completedAt) : new Date(),
      status,
      summary: summary || null,
      errorMessage: errorMessage || null,
      durationMs: durationMs || null,
    })
    .returning();

  return NextResponse.json({ run: row }, { status: 201 });
}
