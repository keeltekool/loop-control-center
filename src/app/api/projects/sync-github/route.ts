import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type GitHubRepo = {
  name: string;
  full_name: string;
  description: string | null;
};

// POST — Sync projects from GitHub
export async function POST() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN not configured" },
      { status: 500 }
    );
  }

  const res = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&type=owner",
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "GitHub API error" },
      { status: res.status }
    );
  }

  const repos: GitHubRepo[] = await res.json();

  // Get existing projects
  const existing = await db.select().from(projects);
  const existingRepos = new Set(existing.map((p) => p.githubRepo));

  // Add new repos that aren't already tracked
  const newRepos = repos.filter((r) => !existingRepos.has(r.full_name));
  const added: string[] = [];

  for (const repo of newRepos) {
    await db.insert(projects).values({
      name: repo.name,
      githubRepo: repo.full_name,
      description: repo.description,
    });
    added.push(repo.full_name);
  }

  return NextResponse.json({
    total: repos.length,
    added: added.length,
    addedRepos: added,
  });
}
