import { createClient, type Client } from "@libsql/client";
import { randomUUID } from "crypto";

// Task type

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};

// Database client — Turso (remote) or local SQLite file

let _client: Client | null = null;

function getClient(): Client {
  if (_client) return _client;

  if (process.env.TURSO_DATABASE_URL) {
    // Production: connect to Turso
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  } else {
    // Development: local SQLite file (persists across restarts)
    _client = createClient({ url: "file:./taskflow.db" });
  }

  return _client;
}

// Auto-create tasks table on first use

let _initialized = false;

async function ensureTable(): Promise<void> {
  if (_initialized) return;
  const db = getClient();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      description TEXT,
      priority    TEXT NOT NULL DEFAULT 'medium',
      status      TEXT NOT NULL DEFAULT 'todo',
      due_date    TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `);
  _initialized = true;
}

// Helpers

const now = () => new Date().toISOString();

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    priority: (row.priority as Task["priority"]) ?? "medium",
    status: (row.status as Task["status"]) ?? "todo",
    dueDate: (row.due_date as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Natural language date parsing

export function parseDate(s: string): string {
  const today = new Date();
  const lower = s.toLowerCase().trim();
  if (lower === "today") return today.toISOString().split("T")[0];
  if (lower === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (lower === "next week") {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
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

// CRUD

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
}): Promise<Task> {
  await ensureTable();
  const db = getClient();
  const task: Task = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? "medium",
    status: "todo",
    dueDate: input.dueDate ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.execute({
    sql: `INSERT INTO tasks (id, title, description, priority, status, due_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      task.id,
      task.title,
      task.description,
      task.priority,
      task.status,
      task.dueDate,
      task.createdAt,
      task.updatedAt,
    ],
  });
  return task;
}

export async function getAllTasks(): Promise<Task[]> {
  await ensureTable();
  const db = getClient();
  const result = await db.execute(
    "SELECT * FROM tasks ORDER BY created_at DESC"
  );
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function findTaskByTitle(title: string): Promise<Task | null> {
  await ensureTable();
  const db = getClient();
  // Try exact match first
  let result = await db.execute({
    sql: "SELECT * FROM tasks WHERE title = ? LIMIT 1",
    args: [title],
  });
  if (result.rows.length > 0)
    return rowToTask(result.rows[0] as unknown as Record<string, unknown>);
  // Try partial match (case-insensitive)
  result = await db.execute({
    sql: "SELECT * FROM tasks WHERE LOWER(title) LIKE ? LIMIT 1",
    args: [`%${title.toLowerCase()}%`],
  });
  return result.rows.length > 0
    ? rowToTask(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function getTaskById(id: string): Promise<Task | null> {
  await ensureTable();
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM tasks WHERE id = ? LIMIT 1",
    args: [id],
  });
  return result.rows.length > 0
    ? rowToTask(result.rows[0] as unknown as Record<string, unknown>)
    : null;
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task | null> {
  await ensureTable();
  const db = getClient();

  // Build dynamic SET clause
  const sets: string[] = [];
  const args: (string | null)[] = [];

  if (updates.title !== undefined) {
    sets.push("title = ?");
    args.push(updates.title);
  }
  if (updates.description !== undefined) {
    sets.push("description = ?");
    args.push(updates.description);
  }
  if (updates.priority !== undefined) {
    sets.push("priority = ?");
    args.push(updates.priority);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    args.push(updates.status);
  }
  if (updates.dueDate !== undefined) {
    sets.push("due_date = ?");
    args.push(updates.dueDate);
  }

  if (sets.length === 0) return getTaskById(id);

  sets.push("updated_at = ?");
  args.push(now());
  args.push(id);

  await db.execute({
    sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
    args,
  });

  return getTaskById(id);
}

export async function deleteTask(id: string): Promise<void> {
  await ensureTable();
  const db = getClient();
  await db.execute({
    sql: "DELETE FROM tasks WHERE id = ?",
    args: [id],
  });
}

export async function getOverdueTasks(): Promise<Task[]> {
  await ensureTable();
  const db = getClient();
  const today = new Date().toISOString().split("T")[0];
  const result = await db.execute({
    sql: `SELECT * FROM tasks
          WHERE due_date IS NOT NULL
            AND due_date < ?
            AND status IN ('todo', 'in_progress')
          ORDER BY due_date ASC`,
    args: [today],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getTasksByStatus(
  status: Task["status"]
): Promise<Task[]> {
  await ensureTable();
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC",
    args: [status],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getTasksByPriority(
  priority: Task["priority"]
): Promise<Task[]> {
  await ensureTable();
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM tasks WHERE priority = ? ORDER BY created_at DESC",
    args: [priority],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}

export async function getTopPriorityTasks(limit = 3): Promise<Task[]> {
  await ensureTable();
  const db = getClient();
  const result = await db.execute({
    sql: `SELECT * FROM tasks
          WHERE status IN ('todo', 'in_progress')
          ORDER BY
            CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
            due_date ASC NULLS LAST
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => rowToTask(row as unknown as Record<string, unknown>));
}
