import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { eq, and, lt, or, like, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority", { enum: ["low", "medium", "high"] }).notNull().default("medium"),
  status: text("status", { enum: ["todo", "in_progress", "done"] }).notNull().default("todo"),
  dueDate: text("due_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Task = typeof tasks.$inferSelect;

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  const sqlite = new Database("./tasks.db");
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'todo',
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  _db = drizzle(sqlite, { schema: { tasks } });
  return _db;
}

const now = () => new Date().toISOString();

export function parseDate(s: string): string {
  const today = new Date();
  const lower = s.toLowerCase().trim();
  if (lower === "today") return today.toISOString().split("T")[0];
  if (lower === "tomorrow") {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (lower === "next week") {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const idx = days.indexOf(lower);
  if (idx !== -1) {
    const d = new Date(today);
    let diff = idx - d.getDay();
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? s : parsed.toISOString().split("T")[0];
}

export async function createTask(input: { title: string; description?: string; priority?: "low"|"medium"|"high"; dueDate?: string }): Promise<Task> {
  const db = getDb();
  const task = { id: randomUUID(), title: input.title, description: input.description ?? null, priority: input.priority ?? "medium" as const, status: "todo" as const, dueDate: input.dueDate ?? null, createdAt: now(), updatedAt: now() };
  await db.insert(tasks).values(task);
  return task;
}

export async function getAllTasks(): Promise<Task[]> {
  return getDb().select().from(tasks).orderBy(desc(tasks.createdAt));
}

export async function findTaskByTitle(title: string): Promise<Task | null> {
  const db = getDb();
  let r = await db.select().from(tasks).where(eq(tasks.title, title));
  if (r.length) return r[0];
  r = await db.select().from(tasks).where(like(tasks.title, `%${title}%`));
  return r[0] ?? null;
}

export async function getTaskById(id: string): Promise<Task | null> {
  const r = await getDb().select().from(tasks).where(eq(tasks.id, id));
  return r[0] ?? null;
}

export async function updateTask(id: string, updates: Partial<Omit<Task, "id"|"createdAt">>): Promise<Task | null> {
  await getDb().update(tasks).set({ ...updates, updatedAt: now() }).where(eq(tasks.id, id));
  return getTaskById(id);
}

export async function deleteTask(id: string): Promise<void> {
  await getDb().delete(tasks).where(eq(tasks.id, id));
}

export async function getOverdueTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split("T")[0];
  return getDb().select().from(tasks).where(and(lt(tasks.dueDate, today), or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress")))).orderBy(asc(tasks.dueDate));
}

export async function getTasksByStatus(status: Task["status"]): Promise<Task[]> {
  return getDb().select().from(tasks).where(eq(tasks.status, status)).orderBy(desc(tasks.createdAt));
}

export async function getTasksByPriority(priority: Task["priority"]): Promise<Task[]> {
  return getDb().select().from(tasks).where(eq(tasks.priority, priority)).orderBy(desc(tasks.createdAt));
}

export async function getTopPriorityTasks(limit = 3): Promise<Task[]> {
  const high = await getDb().select().from(tasks).where(and(eq(tasks.priority, "high"), or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress")))).orderBy(asc(tasks.dueDate));
  if (high.length >= limit) return high.slice(0, limit);
  const med = await getDb().select().from(tasks).where(and(eq(tasks.priority, "medium"), or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress")))).orderBy(asc(tasks.dueDate));
  return [...high, ...med].slice(0, limit);
}