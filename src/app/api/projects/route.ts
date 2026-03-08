import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET — List all projects
export async function GET() {
  const rows = await db.select().from(projects).orderBy(projects.name);
  return NextResponse.json({ projects: rows });
}

// POST — Create a project
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, githubRepo, description } = body;

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [row] = await db
    .insert(projects)
    .values({ name, githubRepo: githubRepo || null, description: description || null })
    .returning();

  return NextResponse.json({ project: row }, { status: 201 });
}
