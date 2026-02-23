import { randomUUID } from "crypto";

// Task type

export type TaskAttachment = {
  name: string;
  type: string;
  dataUrl: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "in_progress" | "done";
  dueDate: string | null;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
};

// ─── Storage backend abstraction ────────────────────────────────────

interface Store {
  getAll(): Promise<Task[]>;
  get(id: string): Promise<Task | null>;
  set(task: Task): Promise<void>;
  remove(id: string): Promise<void>;
}

// ─── In-memory store (Vercel serverless fallback) ───────────────────

class MemoryStore implements Store {
  private map = new Map<string, Task>();
  async getAll() {
    return Array.from(this.map.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }
  async get(id: string) {
    return this.map.get(id) ?? null;
  }
  async set(task: Task) {
    this.map.set(task.id, task);
  }
  async remove(id: string) {
    this.map.delete(id);
  }
}

// ─── LibSQL store (Turso remote or local SQLite file) ───────────────

class LibSQLStore implements Store {
  private client: import("@libsql/client").Client;
  private ready = false;

  constructor(url: string, authToken?: string) {
    // Dynamic import to avoid loading native bindings when not needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@libsql/client") as typeof import("@libsql/client");
    this.client = createClient({ url, authToken });
  }

  private async ensureTable() {
    if (this.ready) return;
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        description TEXT,
        priority    TEXT NOT NULL DEFAULT 'medium',
        status      TEXT NOT NULL DEFAULT 'todo',
        due_date    TEXT,
        attachments TEXT NOT NULL DEFAULT '[]',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `);
    try {
      await this.client.execute(
        "ALTER TABLE tasks ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'"
      );
    } catch {
      // Column already exists
    }
    this.ready = true;
  }

  private rowToTask(row: Record<string, unknown>): Task {
    return {
      id: row.id as string,
      title: row.title as string,
      description: (row.description as string) ?? null,
      priority: (row.priority as Task["priority"]) ?? "medium",
      status: (row.status as Task["status"]) ?? "todo",
      dueDate: (row.due_date as string) ?? null,
      attachments: parseAttachments(row.attachments),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  async getAll() {
    await this.ensureTable();
    const result = await this.client.execute(
      "SELECT * FROM tasks ORDER BY created_at DESC"
    );
    return result.rows.map((r) =>
      this.rowToTask(r as unknown as Record<string, unknown>)
    );
  }

  async get(id: string) {
    await this.ensureTable();
    const result = await this.client.execute({
      sql: "SELECT * FROM tasks WHERE id = ? LIMIT 1",
      args: [id],
    });
    return result.rows.length > 0
      ? this.rowToTask(result.rows[0] as unknown as Record<string, unknown>)
      : null;
  }

  async set(task: Task) {
    await this.ensureTable();
    await this.client.execute({
      sql: `INSERT OR REPLACE INTO tasks
            (id, title, description, priority, status, due_date, attachments, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        task.id,
        task.title,
        task.description,
        task.priority,
        task.status,
        task.dueDate,
        JSON.stringify(task.attachments),
        task.createdAt,
        task.updatedAt,
      ],
    });
  }

  async remove(id: string) {
    await this.ensureTable();
    await this.client.execute({ sql: "DELETE FROM tasks WHERE id = ?", args: [id] });
  }
}

// ─── Store initialization ───────────────────────────────────────────

let _store: Store | null = null;

function getStore(): Store {
  if (_store) return _store;

  if (process.env.TURSO_DATABASE_URL) {
    // Remote Turso database — works everywhere
    _store = new LibSQLStore(
      process.env.TURSO_DATABASE_URL,
      process.env.TURSO_AUTH_TOKEN
    );
  } else if (!process.env.VERCEL) {
    // Local development — SQLite file for persistence across restarts
    _store = new LibSQLStore("file:./taskflow.db");
  } else {
    // Vercel without Turso — in-memory (works within warm function instances)
    _store = new MemoryStore();
  }

  return _store;
}

// ─── Helpers ────────────────────────────────────────────────────────

const now = () => new Date().toISOString();

function parseAttachments(raw: unknown): TaskAttachment[] {
  if (!raw || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    "sunday", "monday", "tuesday", "wednesday",
    "thursday", "friday", "saturday",
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

// ─── CRUD ───────────────────────────────────────────────────────────

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  attachments?: TaskAttachment[];
}): Promise<Task> {
  const store = getStore();
  const task: Task = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? "medium",
    status: "todo",
    dueDate: input.dueDate ?? null,
    attachments: input.attachments ?? [],
    createdAt: now(),
    updatedAt: now(),
  };
  await store.set(task);
  return task;
}

export async function getAllTasks(): Promise<Task[]> {
  return getStore().getAll();
}

export async function findTaskByTitle(title: string): Promise<Task | null> {
  const all = await getAllTasks();
  const exact = all.find((t) => t.title === title);
  if (exact) return exact;
  const partial = all.find((t) =>
    t.title.toLowerCase().includes(title.toLowerCase())
  );
  return partial ?? null;
}

export async function getTaskById(id: string): Promise<Task | null> {
  return getStore().get(id);
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task | null> {
  const store = getStore();
  const existing = await store.get(id);
  if (!existing) return null;
  const updated: Task = { ...existing, ...updates, updatedAt: now() };
  await store.set(updated);
  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  await getStore().remove(id);
}

export async function getOverdueTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split("T")[0];
  const all = await getAllTasks();
  return all
    .filter(
      (t) =>
        t.dueDate && t.dueDate < today &&
        (t.status === "todo" || t.status === "in_progress")
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

export async function getTasksByStatus(
  status: Task["status"]
): Promise<Task[]> {
  const all = await getAllTasks();
  return all.filter((t) => t.status === status);
}

export async function getTasksByPriority(
  priority: Task["priority"]
): Promise<Task[]> {
  const all = await getAllTasks();
  return all.filter((t) => t.priority === priority);
}

export async function getTopPriorityTasks(limit = 3): Promise<Task[]> {
  const all = await getAllTasks();
  return all
    .filter((t) => t.status === "todo" || t.status === "in_progress")
    .sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      const pDiff = pOrder[a.priority] - pOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return (a.dueDate ?? "z").localeCompare(b.dueDate ?? "z");
    })
    .slice(0, limit);
}
