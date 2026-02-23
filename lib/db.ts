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

// ─── Supabase store (PostgreSQL via Supabase REST API) ──────────────

class SupabaseStore implements Store {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private ready = false;

  constructor(url: string, key: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@supabase/supabase-js");
    this.client = createClient(url, key);
  }

  private ensureReady() {
    // Table must be created via Supabase SQL editor (see setup instructions).
    // This is a no-op — just marks the store as initialized.
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
    this.ensureReady();
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => this.rowToTask(r));
  }

  async get(id: string) {
    this.ensureReady();
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.rowToTask(data as Record<string, unknown>) : null;
  }

  async set(task: Task) {
    this.ensureReady();
    const row = {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      due_date: task.dueDate,
      attachments: JSON.stringify(task.attachments),
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
    const { error } = await this.client
      .from("tasks")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;
  }

  async remove(id: string) {
    this.ensureReady();
    const { error } = await this.client
      .from("tasks")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }
}

// ─── Edge Config store (Vercel built-in, zero external deps) ────────

class EdgeConfigStore implements Store {
  private edgeConfigId: string;
  private readToken: string;
  private apiToken: string;
  private teamId: string;

  constructor(edgeConfigId: string, readToken: string, apiToken: string, teamId: string) {
    this.edgeConfigId = edgeConfigId;
    this.readToken = readToken;
    this.apiToken = apiToken;
    this.teamId = teamId;
  }

  private async readAll(): Promise<Record<string, Task>> {
    const res = await fetch(
      `https://edge-config.vercel.com/${this.edgeConfigId}/items?token=${this.readToken}`
    );
    if (!res.ok) return {};
    const data = await res.json() as Record<string, unknown>;
    const tasks: Record<string, Task> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith("task_") && value && typeof value === "object") {
        tasks[key] = value as Task;
      }
    }
    return tasks;
  }

  private async write(items: { operation: string; key: string; value?: Task }[]) {
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${this.edgeConfigId}/items?teamId=${this.teamId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Edge Config write failed: ${err}`);
    }
  }

  async getAll(): Promise<Task[]> {
    const tasks = await this.readAll();
    return Object.values(tasks).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async get(id: string): Promise<Task | null> {
    const res = await fetch(
      `https://edge-config.vercel.com/${this.edgeConfigId}/item/task_${id}?token=${this.readToken}`
    );
    if (!res.ok) return null;
    return (await res.json()) as Task;
  }

  async set(task: Task): Promise<void> {
    await this.write([{ operation: "upsert", key: `task_${task.id}`, value: task }]);
  }

  async remove(id: string): Promise<void> {
    await this.write([{ operation: "delete", key: `task_${id}` }]);
  }
}

// ─── Store initialization ───────────────────────────────────────────

let _store: Store | null = null;

function getStore(): Store {
  if (_store) return _store;

  if (process.env.EDGE_CONFIG_ID && process.env.EDGE_CONFIG_TOKEN && process.env.VERCEL_API_TOKEN) {
    // Vercel Edge Config — built-in persistence, zero external deps
    _store = new EdgeConfigStore(
      process.env.EDGE_CONFIG_ID,
      process.env.EDGE_CONFIG_TOKEN,
      process.env.VERCEL_API_TOKEN,
      process.env.TEAM_ID ?? ""
    );
  } else if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    // Supabase PostgreSQL — persistent, works everywhere
    _store = new SupabaseStore(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  } else if (process.env.TURSO_DATABASE_URL) {
    // Remote Turso database — works everywhere
    _store = new LibSQLStore(
      process.env.TURSO_DATABASE_URL,
      process.env.TURSO_AUTH_TOKEN
    );
  } else if (!process.env.VERCEL) {
    // Local development — SQLite file for persistence across restarts
    _store = new LibSQLStore("file:./taskflow.db");
  } else {
    // Vercel without database config — in-memory (works within warm function instances)
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
