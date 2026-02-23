import type { Priority, Status, Task } from "./types";

// Theme tokens

export const DARK = {
  bg: "#080810",
  bgSecondary: "rgba(255,255,255,0.02)",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  text: "rgba(255,255,255,0.85)",
  textMuted: "rgba(255,255,255,0.3)",
  textFaint: "rgba(255,255,255,0.15)",
  inputBg: "rgba(255,255,255,0.05)",
  msgBg: "rgba(255,255,255,0.05)",
  cardBg: "rgba(255,255,255,0.04)",
  cardHover: "rgba(255,255,255,0.06)",
  accent: "#8b5cf6",
  accentSoft: "rgba(139,92,246,0.12)",
  filterActive: "rgba(139,92,246,0.12)",
  filterActiveText: "#a78bfa",
  suggestionBg: "rgba(255,255,255,0.04)",
  suggestionBorder: "rgba(255,255,255,0.08)",
  userMsg: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
  userAvatar: "rgba(139,92,246,0.15)",
  headerBg: "rgba(8,8,16,0.8)",
  toolCardBg: "rgba(139,92,246,0.06)",
  toolCardBorder: "rgba(139,92,246,0.15)",
};

export const LIGHT = {
  bg: "#f8f7ff",
  bgSecondary: "rgba(0,0,0,0.02)",
  border: "rgba(0,0,0,0.08)",
  borderHover: "rgba(0,0,0,0.15)",
  text: "rgba(0,0,0,0.85)",
  textMuted: "rgba(0,0,0,0.4)",
  textFaint: "rgba(0,0,0,0.2)",
  inputBg: "rgba(0,0,0,0.04)",
  msgBg: "rgba(0,0,0,0.04)",
  cardBg: "rgba(0,0,0,0.03)",
  cardHover: "rgba(0,0,0,0.06)",
  accent: "#7c3aed",
  accentSoft: "rgba(124,58,237,0.08)",
  filterActive: "rgba(124,58,237,0.1)",
  filterActiveText: "#7c3aed",
  suggestionBg: "rgba(0,0,0,0.03)",
  suggestionBorder: "rgba(0,0,0,0.08)",
  userMsg: "linear-gradient(135deg, #7c3aed, #6d28d9)",
  userAvatar: "rgba(124,58,237,0.12)",
  headerBg: "rgba(248,247,255,0.9)",
  toolCardBg: "rgba(124,58,237,0.04)",
  toolCardBorder: "rgba(124,58,237,0.1)",
};

// Visual constants

export const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#f87171",
  medium: "#fb923c",
  low: "#34d399",
};

export const PRIORITY_BG: Record<Priority, string> = {
  high: "rgba(248,113,113,0.1)",
  medium: "rgba(251,146,60,0.1)",
  low: "rgba(52,211,153,0.1)",
};

export const STATUS_COLOR: Record<Status, string> = {
  todo: "#a78bfa",
  in_progress: "#fbbf24",
  done: "#34d399",
};

export const SUGGESTIONS = [
  "Add task 'Review Q1 report' due Friday high priority",
  "What tasks are overdue?",
  "Show my top priorities",
  "Mark Buy milk as done",
];

// Helpers

/** Spread onto a button/div to apply hover styles without CSS classes. */
export function hover(
  on: Record<string, string>,
  off?: Record<string, string>,
) {
  const reset =
    off ??
    Object.fromEntries(
      Object.keys(on).map((k) => [k, k === "background" ? "transparent" : ""]),
    );
  return {
    onMouseEnter: (e: React.MouseEvent) =>
      Object.assign((e.currentTarget as HTMLElement).style, on),
    onMouseLeave: (e: React.MouseEvent) =>
      Object.assign((e.currentTarget as HTMLElement).style, reset),
  };
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isOverdue(t: Task): boolean {
  if (!t.dueDate || t.status === "done") return false;
  return t.dueDate < new Date().toISOString().split("T")[0];
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
