import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  githubRepo: text("github_repo"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const loops = pgTable("loops", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  interval: text("interval").notNull(),
  cronExpression: text("cron_expression").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const loopRuns = pgTable("loop_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  loopId: uuid("loop_id")
    .references(() => loops.id, { onDelete: "cascade" })
    .notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull(),
  summary: text("summary"),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
});
