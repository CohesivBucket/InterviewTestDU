import { randomUUID } from "crypto";

// ─── Task type ─────────────────────────────────────────────────────────────────

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

// ─── In-memory store (works on Vercel serverless + local dev) ──────────────────

const store: Map<string, Task> = new Map();

const now = () => new Date().toISOString();

// ─── Date parser ───────────────────────────────────────────────────────────────

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

// ─── CRUD operations ───────────────────────────────────────────────────────────

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
}): Promise<Task> {
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
  store.set(task.id, task);
  return task;
}

export async function getAllTasks(): Promise<Task[]> {
  return Array.from(store.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function findTaskByTitle(title: string): Promise<Task | null> {
  const all = Array.from(store.values());
  const exact = all.find((t) => t.title === title);
  if (exact) return exact;
  const partial = all.find((t) =>
    t.title.toLowerCase().includes(title.toLowerCase())
  );
  return partial ?? null;
}

export async function getTaskById(id: string): Promise<Task | null> {
  return store.get(id) ?? null;
}

export async function updateTask(
  id: string,
  updates: Partial<Omit<Task, "id" | "createdAt">>
): Promise<Task | null> {
  const existing = store.get(id);
  if (!existing) return null;
  const updated: Task = { ...existing, ...updates, updatedAt: now() };
  store.set(id, updated);
  return updated;
}

export async function deleteTask(id: string): Promise<void> {
  store.delete(id);
}

export async function getOverdueTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split("T")[0];
  return Array.from(store.values())
    .filter(
      (t) =>
        t.dueDate &&
        t.dueDate < today &&
        (t.status === "todo" || t.status === "in_progress")
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

export async function getTasksByStatus(status: Task["status"]): Promise<Task[]> {
  return Array.from(store.values())
    .filter((t) => t.status === status)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function getTasksByPriority(priority: Task["priority"]): Promise<Task[]> {
  return Array.from(store.values())
    .filter((t) => t.priority === priority)
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

export async function getTopPriorityTasks(limit = 3): Promise<Task[]> {
  const all = Array.from(store.values()).filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );
  const high = all
    .filter((t) => t.priority === "high")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  if (high.length >= limit) return high.slice(0, limit);
  const med = all
    .filter((t) => t.priority === "medium")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  return [...high, ...med].slice(0, limit);
}
