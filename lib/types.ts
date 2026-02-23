export type Priority = "low" | "medium" | "high";
export type Status = "todo" | "in_progress" | "done";
export type Filter = "all" | "todo" | "in_progress" | "done" | "overdue";
export type Theme = "dark" | "light";

export interface TaskAttachment {
  name: string;
  type: string;
  dataUrl: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: Priority;
  status: Status;
  dueDate?: string | null;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export const AVAILABLE_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", description: "Cheapest" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", description: "Fast & light" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", description: "Balanced" },
  { id: "gpt-5", label: "GPT-5", description: "Strong" },
  { id: "gpt-5.1", label: "GPT-5.1", description: "Smarter" },
  { id: "gpt-5.2", label: "GPT-5.2", description: "Flagship" },
  { id: "gpt-5.2-pro", label: "GPT-5.2 Pro", description: "Best quality" },
  { id: "o4-mini", label: "o4-mini", description: "Reasoning" },
];
