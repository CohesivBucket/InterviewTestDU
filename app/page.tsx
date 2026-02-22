"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import type { UIMessage } from "ai";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high";
type Status = "todo" | "in_progress" | "done";
type Filter = "all" | "todo" | "in_progress" | "done" | "overdue";
type Theme = "dark" | "light";

interface Task {
  id: string;
  title: string;
  priority: Priority;
  status: Status;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

const AVAILABLE_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o Mini", description: "Fast & cheap" },
  { id: "gpt-4o", label: "GPT-4o", description: "Better quality" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Latest mini" },
  { id: "gpt-4.1", label: "GPT-4.1", description: "Flagship" },
];

// ─── Theme tokens ─────────────────────────────────────────────────────────────

const DARK = {
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

const LIGHT = {
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<Priority, string> = {
  high: "#f87171",
  medium: "#fb923c",
  low: "#34d399",
};

const PRIORITY_BG: Record<Priority, string> = {
  high: "rgba(248,113,113,0.1)",
  medium: "rgba(251,146,60,0.1)",
  low: "rgba(52,211,153,0.1)",
};

const STATUS_COLOR: Record<Status, string> = {
  todo: "#a78bfa",
  in_progress: "#fbbf24",
  done: "#34d399",
};

const SUGGESTIONS = [
  "Add task 'Review Q1 report' due Friday high priority",
  "What tasks are overdue?",
  "Show my top priorities",
  "Mark Buy milk as done",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
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

function isOverdue(t: Task): boolean {
  if (!t.dueDate || t.status === "done") return false;
  return t.dueDate < new Date().toISOString().split("T")[0];
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── ToolCard — renders tool invocations as structured cards in chat ─────────

function ToolCard({
  part,
  t: theme,
}: {
  part: {
    type: string;
    toolName: string;
    state: string;
    result?: unknown;
    args?: unknown;
  };
  t: typeof DARK;
}) {
  const result = part.result as Record<string, unknown> | undefined;
  const args = part.args as Record<string, unknown> | undefined;
  const toolName = part.toolName;
  const isSuccess = result?.success === true;
  const isError = result?.success === false;
  const isLoading = part.state === "call" || part.state === "partial-call";

  // ── Task card for create_task result ──
  if (toolName === "create_task" && isSuccess && result?.task) {
    const task = result.task as Task;
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderLeft: `3px solid ${PRIORITY_COLOR[task.priority] ?? theme.accent}`,
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "12px" }}>+</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#34d399",
              fontWeight: 700,
            }}
          >
            CREATED
          </span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.12em",
              fontWeight: 700,
              color: PRIORITY_COLOR[task.priority] ?? theme.textMuted,
              background: PRIORITY_BG[task.priority] ?? "transparent",
              padding: "2px 6px",
              borderRadius: "4px",
            }}
          >
            {task.priority?.toUpperCase()}
          </span>
        </div>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: theme.text,
            marginBottom: "2px",
          }}
        >
          {task.title}
        </div>
        {task.dueDate && (
          <div
            style={{
              fontSize: "11px",
              fontFamily: "monospace",
              color: theme.textMuted,
            }}
          >
            Due: {formatDate(task.dueDate)}
          </div>
        )}
      </div>
    );
  }

  // ── Task list for get_tasks result ──
  if (toolName === "get_tasks" && isSuccess && result?.tasks) {
    const tasks = result.tasks as Task[];
    if (tasks.length === 0) {
      return (
        <div
          style={{
            background: theme.toolCardBg,
            border: `1px solid ${theme.toolCardBorder}`,
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "6px",
            fontSize: "12px",
            color: theme.textMuted,
            fontFamily: "monospace",
          }}
        >
          No tasks found
        </div>
      );
    }
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderRadius: "10px",
          padding: "8px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            fontSize: "9px",
            fontFamily: "monospace",
            letterSpacing: "0.1em",
            color: theme.textMuted,
            padding: "2px 6px",
            marginBottom: "4px",
          }}
        >
          {tasks.length} TASK{tasks.length !== 1 ? "S" : ""}
        </div>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              borderLeft: `3px solid ${task.status === "done" ? theme.border : (PRIORITY_COLOR[task.priority] ?? theme.accent)}`,
              padding: "6px 10px",
              marginBottom: "4px",
              borderRadius: "0 6px 6px 0",
              background: theme.cardBg,
              opacity: task.status === "done" ? 0.5 : 1,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "5px",
                alignItems: "center",
                marginBottom: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "8px",
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: PRIORITY_COLOR[task.priority] ?? theme.textMuted,
                  letterSpacing: "0.1em",
                }}
              >
                {task.priority?.toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: "8px",
                  fontFamily: "monospace",
                  fontWeight: 600,
                  color: STATUS_COLOR[task.status] ?? theme.textMuted,
                }}
              >
                {task.status === "in_progress"
                  ? "ACTIVE"
                  : task.status?.toUpperCase()}
              </span>
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: theme.text,
                textDecoration:
                  task.status === "done" ? "line-through" : "none",
              }}
            >
              {task.title}
            </div>
            {task.dueDate && (
              <div
                style={{
                  fontSize: "10px",
                  fontFamily: "monospace",
                  color: theme.textMuted,
                  marginTop: "2px",
                }}
              >
                {formatDate(task.dueDate)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Update task result ──
  if (toolName === "update_task" && isSuccess && result?.task) {
    const task = result.task as Task;
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderLeft: `3px solid ${STATUS_COLOR[task.status] ?? theme.accent}`,
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            marginBottom: "4px",
          }}
        >
          <span style={{ fontSize: "12px" }}>&#x270E;</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#fbbf24",
              fontWeight: 700,
            }}
          >
            UPDATED
          </span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              fontWeight: 600,
              color: STATUS_COLOR[task.status] ?? theme.textMuted,
            }}
          >
            {task.status === "in_progress"
              ? "ACTIVE"
              : task.status?.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: theme.text }}>
          {task.title}
        </div>
      </div>
    );
  }

  // ── Delete task result ──
  if (toolName === "delete_task" && isSuccess) {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderLeft: "3px solid #f87171",
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px" }}>&#x2716;</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#f87171",
              fontWeight: 700,
            }}
          >
            DELETED
          </span>
          <span
            style={{ fontSize: "12px", color: theme.textMuted, fontWeight: 500 }}
          >
            {String(result?.deleted ?? "")}
          </span>
        </div>
      </div>
    );
  }

  // ── Delete all result ──
  if (toolName === "delete_all_tasks" && isSuccess) {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderLeft: "3px solid #f87171",
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "12px" }}>&#x2716;</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#f87171",
              fontWeight: 700,
            }}
          >
            CLEARED
          </span>
          <span
            style={{
              fontSize: "12px",
              color: theme.textMuted,
              fontFamily: "monospace",
            }}
          >
            {String(result?.deleted_count ?? 0)} tasks removed
          </span>
        </div>
      </div>
    );
  }

  // ── Error result ──
  if (isError) {
    return (
      <div
        style={{
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
          fontSize: "12px",
          color: "#f87171",
          fontFamily: "monospace",
        }}
      >
        {String(result?.error ?? "Tool call failed")}
      </div>
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderRadius: "10px",
          padding: "10px 14px",
          marginBottom: "6px",
          fontSize: "11px",
          color: theme.textMuted,
          fontFamily: "monospace",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={{ animation: "pulse 1.5s infinite" }}>&#x25C8;</span>
        Calling {toolName?.replace(/_/g, " ")}...
      </div>
    );
  }

  // ── Generic fallback for completed tools we don't have special UI for ──
  return (
    <div
      style={{
        background: theme.toolCardBg,
        border: `1px solid ${theme.toolCardBorder}`,
        borderRadius: "10px",
        padding: "8px 12px",
        marginBottom: "6px",
        fontSize: "11px",
        color: theme.textMuted,
        fontFamily: "monospace",
      }}
    >
      {toolName}: {args ? JSON.stringify(args) : "done"}
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  onEdit,
  t: theme,
}: {
  task: Task;
  onStatusChange: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
  t: typeof DARK;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editStatus, setEditStatus] = useState<Status>(task.status);
  const [editDueDate, setEditDueDate] = useState(task.dueDate ?? "");
  const overdue = isOverdue(task);
  const done = task.status === "done";

  const startEditing = () => {
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDueDate(task.dueDate ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    const updates: Partial<Task> = {};
    if (editTitle.trim() && editTitle !== task.title)
      updates.title = editTitle.trim();
    if (editPriority !== task.priority) updates.priority = editPriority;
    if (editStatus !== task.status) updates.status = editStatus;
    const newDue = editDueDate || null;
    if (newDue !== (task.dueDate ?? null)) updates.dueDate = newDue;
    if (Object.keys(updates).length > 0) onEdit(task.id, updates);
    setEditing(false);
  };

  const cancelEdit = () => setEditing(false);

  // ── Edit mode ──
  if (editing) {
    return (
      <div
        style={{
          background: theme.cardHover,
          border: `1px solid ${theme.accent}`,
          borderLeft: `3px solid ${PRIORITY_COLOR[editPriority]}`,
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "8px",
          transition: "all 0.15s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title input */}
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          autoFocus
          style={{
            width: "100%",
            background: theme.inputBg,
            border: `1px solid ${theme.border}`,
            borderRadius: "6px",
            padding: "7px 10px",
            color: theme.text,
            fontSize: "13px",
            fontFamily: "'Syne', sans-serif",
            marginBottom: "8px",
          }}
        />

        {/* Priority toggles */}
        <div style={{ marginBottom: "6px" }}>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              color: theme.textMuted,
              marginBottom: "4px",
              letterSpacing: "0.1em",
            }}
          >
            PRIORITY
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {(["low", "medium", "high"] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => setEditPriority(p)}
                style={{
                  flex: 1,
                  padding: "4px 0",
                  borderRadius: "5px",
                  border: `1.5px solid ${editPriority === p ? PRIORITY_COLOR[p] : theme.border}`,
                  background:
                    editPriority === p ? PRIORITY_BG[p] : "transparent",
                  color:
                    editPriority === p ? PRIORITY_COLOR[p] : theme.textMuted,
                  fontSize: "10px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  transition: "all 0.12s",
                }}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Status toggles */}
        <div style={{ marginBottom: "6px" }}>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              color: theme.textMuted,
              marginBottom: "4px",
              letterSpacing: "0.1em",
            }}
          >
            STATUS
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {(
              [
                ["todo", "Todo", "#a78bfa"],
                ["in_progress", "Active", "#fbbf24"],
                ["done", "Done", "#34d399"],
              ] as [Status, string, string][]
            ).map(([s, label, color]) => (
              <button
                key={s}
                onClick={() => setEditStatus(s)}
                style={{
                  flex: 1,
                  padding: "4px 0",
                  borderRadius: "5px",
                  border: `1.5px solid ${editStatus === s ? color : theme.border}`,
                  background:
                    editStatus === s ? `${color}18` : "transparent",
                  color: editStatus === s ? color : theme.textMuted,
                  fontSize: "10px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  cursor: "pointer",
                  letterSpacing: "0.05em",
                  transition: "all 0.12s",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Due date */}
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              color: theme.textMuted,
              marginBottom: "4px",
              letterSpacing: "0.1em",
            }}
          >
            DUE DATE
          </div>
          <input
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
            style={{
              width: "100%",
              background: theme.inputBg,
              border: `1px solid ${theme.border}`,
              borderRadius: "6px",
              padding: "5px 8px",
              color: theme.text,
              fontSize: "11px",
              fontFamily: "'DM Mono', monospace",
              colorScheme: theme === DARK ? "dark" : "light",
            }}
          />
        </div>

        {/* Save / Cancel */}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={saveEdit}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: "6px",
              border: "none",
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "'Syne', sans-serif",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Save
          </button>
          <button
            onClick={cancelEdit}
            style={{
              flex: 1,
              padding: "6px 0",
              borderRadius: "6px",
              border: `1px solid ${theme.border}`,
              background: "transparent",
              color: theme.textMuted,
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "'Syne', sans-serif",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Normal view ──
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !done ? theme.cardHover : theme.cardBg,
        border: `1px solid ${overdue ? "rgba(248,113,113,0.3)" : theme.border}`,
        borderLeft: `3px solid ${done ? theme.border : PRIORITY_COLOR[task.priority]}`,
        borderRadius: "10px",
        padding: "12px 14px",
        marginBottom: "8px",
        cursor: "pointer",
        opacity: done ? 0.5 : 1,
        transition: "all 0.15s ease",
        userSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              gap: "5px",
              alignItems: "center",
              marginBottom: "5px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "9px",
                fontFamily: "monospace",
                letterSpacing: "0.12em",
                fontWeight: 700,
                color: done
                  ? theme.textFaint
                  : PRIORITY_COLOR[task.priority],
                background: done ? "transparent" : PRIORITY_BG[task.priority],
                padding: "2px 6px",
                borderRadius: "4px",
              }}
            >
              {task.priority.toUpperCase()}
            </span>
            {overdue && (
              <span
                style={{
                  fontSize: "9px",
                  background: "rgba(248,113,113,0.12)",
                  color: "#f87171",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                OVERDUE
              </span>
            )}
            {done && (
              <span
                style={{
                  fontSize: "9px",
                  background: "rgba(52,211,153,0.1)",
                  color: "#34d399",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                DONE
              </span>
            )}
            {task.status === "in_progress" && !done && (
              <span
                style={{
                  fontSize: "9px",
                  background: "rgba(251,191,36,0.1)",
                  color: "#fbbf24",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  fontWeight: 600,
                }}
              >
                ACTIVE
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: done ? theme.textMuted : theme.text,
              textDecoration: done ? "line-through" : "none",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: expanded ? "normal" : "nowrap",
            }}
          >
            {task.title}
          </div>
          {task.dueDate && (
            <div
              style={{
                fontSize: "11px",
                color: overdue ? "#f87171" : theme.textMuted,
                marginTop: "4px",
                fontFamily: "monospace",
              }}
            >
              {formatDate(task.dueDate)}
            </div>
          )}
        </div>

        <div
          style={{ display: "flex", gap: "4px", flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Edit button */}
          <button
            onClick={startEditing}
            title="Edit task"
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              border: "1.5px solid rgba(139,92,246,0.4)",
              background: "transparent",
              cursor: "pointer",
              color: "#a78bfa",
              fontSize: "11px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(139,92,246,0.15)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            &#x270E;
          </button>
          {!done && (
            <button
              onClick={() => onStatusChange(task.id, "done")}
              title="Mark done"
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                border: "1.5px solid rgba(52,211,153,0.4)",
                background: "transparent",
                cursor: "pointer",
                color: "#34d399",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(52,211,153,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              &#x2713;
            </button>
          )}
          {task.status !== "in_progress" && !done && (
            <button
              onClick={() => onStatusChange(task.id, "in_progress")}
              title="Start task"
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                border: "1.5px solid rgba(251,191,36,0.4)",
                background: "transparent",
                cursor: "pointer",
                color: "#fbbf24",
                fontSize: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(251,191,36,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              &#x25B6;
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            title="Delete"
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              border: `1.5px solid ${theme.border}`,
              background: "transparent",
              cursor: "pointer",
              color: theme.textMuted,
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(248,113,113,0.12)";
              (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color =
                theme.textMuted;
            }}
          >
            &#x00D7;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [model, setModel] = useState("gpt-4o-mini");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const T = theme === "dark" ? DARK : LIGHT;

  // ── Vercel AI SDK useChat ──────────────────────────────────────────────────

  const modelRef = useRef(model);
  modelRef.current = model;

  const [chatTransport] = useState(
    () =>
      new TextStreamChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelRef.current }),
      })
  );

  const {
    messages,
    sendMessage,
    status,
    setMessages,
  } = useChat({
    transport: chatTransport,
    onFinish: () => {
      fetchTasks();
    },
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // ── Load saved theme ───────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("taskflow-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("taskflow-theme", next);
  };

  // ── Image handling ─────────────────────────────────────────────────────────

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPendingImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (e) {
      console.error("Failed to fetch tasks:", e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── Task actions ───────────────────────────────────────────────────────────

  const handleStatusChange = async (id: string, status: Status) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  };

  const handleEdit = async (id: string, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  };

  // ── Chat submit ────────────────────────────────────────────────────────────

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && pendingImages.length === 0) return;
    if (isLoading) return;
    setStarted(true);
    setInput("");

    // Build files from pending images for AI SDK
    const files =
      pendingImages.length > 0
        ? pendingImages.map((dataUrl) => {
            // Extract media type from data URL
            const match = dataUrl.match(/^data:(image\/[^;]+);/);
            const mediaType = match ? match[1] : "image/png";
            return { type: "file" as const, mediaType, url: dataUrl };
          })
        : undefined;

    setPendingImages([]);

    // Send message via AI SDK useChat
    await sendMessage({
      text: text || "I've attached an image. Please describe what you see and how it relates to my tasks.",
      files,
    });

    // Refresh tasks after AI responds
    await fetchTasks();
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const counts: Record<Filter, number> = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    done: tasks.filter((t) => t.status === "done").length,
    overdue: tasks.filter(isOverdue).length,
  };

  const filtered = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(t);
    return t.status === filter;
  });

  const filterDefs: { key: Filter; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "\u25C8" },
    { key: "todo", label: "Todo", icon: "\u25CB" },
    { key: "in_progress", label: "Active", icon: "\u25D1" },
    { key: "done", label: "Done", icon: "\u25CF" },
    { key: "overdue", label: "Overdue", icon: "\u26A0" },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.2); border-radius: 2px; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes bounce {
          0%,60%,100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }

        .msg-enter { animation: fadeUp 0.25s ease forwards; }

        .send-btn:hover:not(:disabled) { transform: scale(1.05) !important; }
        .send-btn:active:not(:disabled) { transform: scale(0.95) !important; }

        .suggestion-btn:hover {
          border-color: rgba(139,92,246,0.4) !important;
          color: #a78bfa !important;
        }

        input:focus {
          outline: none;
          border-color: rgba(139,92,246,0.5) !important;
          box-shadow: 0 0 0 3px rgba(139,92,246,0.08) !important;
        }
      `}</style>

      <div
        style={{
          height: "100vh",
          display: "flex",
          background: T.bg,
          color: T.text,
          fontFamily: "'Syne', sans-serif",
          transition: "background 0.3s ease, color 0.3s ease",
        }}
      >
        {/* Ambient glows — dark mode only */}
        {theme === "dark" && (
          <>
            <div
              style={{
                position: "fixed",
                top: "-20%",
                left: "-10%",
                width: "50vw",
                height: "50vh",
                background:
                  "radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: "fixed",
                bottom: "-20%",
                right: "-10%",
                width: "40vw",
                height: "40vh",
                background:
                  "radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          </>
        )}

        {/* ── Sidebar ── */}
        <div
          style={{
            width: isSidebarOpen ? "280px" : "0px",
            minWidth: isSidebarOpen ? "280px" : "0px",
            overflow: "hidden",
            transition: "all 0.3s ease",
            borderRight: `1px solid ${T.border}`,
            background: T.bgSecondary,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ padding: "24px 18px 0", minWidth: "280px" }}>
            {/* Logo */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "4px",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  flexShrink: 0,
                }}
              >
                &#x25C8;
              </div>
              <h1
                style={{
                  fontSize: "16px",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: T.text,
                }}
              >
                TaskFlow
              </h1>
              <span
                style={{
                  fontSize: "9px",
                  fontFamily: "'DM Mono', monospace",
                  color: "#8b5cf6",
                  background: T.accentSoft,
                  padding: "2px 6px",
                  borderRadius: "4px",
                  border: `1px solid rgba(139,92,246,0.2)`,
                  letterSpacing: "0.1em",
                }}
              >
                AI
              </span>
            </div>
            <p
              style={{
                fontSize: "11px",
                fontFamily: "'DM Mono', monospace",
                color: T.textMuted,
                marginBottom: "20px",
                paddingLeft: "38px",
              }}
            >
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </p>

            {/* Filters */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                marginBottom: "16px",
              }}
            >
              {filterDefs.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 10px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                    fontFamily: "'Syne', sans-serif",
                    background:
                      filter === f.key ? T.filterActive : "transparent",
                    color:
                      filter === f.key ? T.filterActiveText : T.textMuted,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {f.icon}
                    </span>
                    {f.label}
                  </span>
                  {counts[f.key] > 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "'DM Mono', monospace",
                        background:
                          filter === f.key ? T.accentSoft : T.border,
                        color:
                          filter === f.key
                            ? T.filterActiveText
                            : T.textMuted,
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {counts[f.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div
              style={{
                height: "1px",
                background: T.border,
                margin: "0 0 16px",
              }}
            />
          </div>

          {/* Task list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0 12px 20px",
            }}
          >
            {filtered.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "160px",
                  color: T.textFaint,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: "28px",
                    marginBottom: "10px",
                    opacity: 0.3,
                  }}
                >
                  {filter === "overdue"
                    ? "\u2713"
                    : filter === "done"
                      ? "\u25C9"
                      : "\u25C8"}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    fontFamily: "'DM Mono', monospace",
                    lineHeight: 1.6,
                  }}
                >
                  {filter === "all"
                    ? "Chat to add your first task"
                    : `No ${filter.replace("_", " ")} tasks`}
                </div>
              </div>
            ) : (
              filtered.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onEdit={handleEdit}
                  t={T}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Main chat ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: "12px",
              backdropFilter: "blur(10px)",
              background: T.headerBg,
            }}
          >
            {/* Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                border: `1px solid ${T.border}`,
                background: "transparent",
                cursor: "pointer",
                color: T.textMuted,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  T.cardHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {isSidebarOpen ? "\u25C0" : "\u25B6"}
            </button>

            {/* Status */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <div
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "#34d399",
                  animation: "pulse 2.5s infinite",
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: T.textMuted,
                }}
              >
                AI Assistant
              </span>
            </div>

            {/* Right side controls */}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {/* Model selector */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  style={{
                    fontSize: "10px",
                    fontFamily: "'DM Mono', monospace",
                    color: T.textMuted,
                    background: T.inputBg,
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: `1px solid ${showModelPicker ? T.accent : T.border}`,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      T.borderHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!showModelPicker)
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        T.border;
                  }}
                >
                  &#x25C8; {model}{" "}
                  <span style={{ fontSize: "8px", opacity: 0.5 }}>
                    &#x25BC;
                  </span>
                </button>
                {showModelPicker && (
                  <>
                    <div
                      style={{ position: "fixed", inset: 0, zIndex: 99 }}
                      onClick={() => setShowModelPicker(false)}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        zIndex: 100,
                        background:
                          theme === "dark" ? "#1a1a2e" : "#fff",
                        border: `1px solid ${T.border}`,
                        borderRadius: "8px",
                        padding: "4px",
                        minWidth: "180px",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                      }}
                    >
                      {AVAILABLE_MODELS.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setModel(m.id);
                            setShowModelPicker(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: "6px",
                            border: "none",
                            background:
                              model === m.id
                                ? T.accentSoft
                                : "transparent",
                            color:
                              model === m.id
                                ? T.filterActiveText
                                : T.text,
                            fontSize: "11px",
                            fontFamily: "'DM Mono', monospace",
                            cursor: "pointer",
                            transition: "all 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (model !== m.id)
                              (
                                e.currentTarget as HTMLButtonElement
                              ).style.background = T.cardHover;
                          }}
                          onMouseLeave={(e) => {
                            if (model !== m.id)
                              (
                                e.currentTarget as HTMLButtonElement
                              ).style.background = "transparent";
                          }}
                        >
                          <span>{m.label}</span>
                          <span
                            style={{
                              fontSize: "9px",
                              color: T.textMuted,
                            }}
                          >
                            {m.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  cursor: "pointer",
                  color: T.textMuted,
                  fontSize: "15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    T.cardHover;
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    T.borderHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    T.border;
                }}
              >
                {theme === "dark" ? "\u2600" : "\u263D"}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px 0",
            }}
          >
            {/* Empty state */}
            {messages.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "260px",
                  textAlign: "center",
                }}
              >
                <div style={{ position: "relative", marginBottom: "20px" }}>
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "20px",
                      background:
                        "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "28px",
                      boxShadow: "0 0 60px rgba(139,92,246,0.25)",
                      margin: "0 auto",
                    }}
                  >
                    &#x25C8;
                  </div>
                </div>
                <h2
                  style={{
                    fontSize: "20px",
                    fontWeight: 800,
                    color: T.text,
                    marginBottom: "8px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  What can I help with?
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: T.textMuted,
                    maxWidth: "260px",
                    lineHeight: 1.7,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  Manage tasks through natural conversation.
                </p>
              </div>
            )}

            {/* Suggestions */}
            {!started && messages.length === 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  justifyContent: "center",
                  marginBottom: "32px",
                }}
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    className="suggestion-btn"
                    onClick={() => {
                      setInput(s);
                      setStarted(true);
                      inputRef.current?.focus();
                    }}
                    style={{
                      background: T.suggestionBg,
                      border: `1px solid ${T.suggestionBorder}`,
                      borderRadius: "20px",
                      padding: "7px 14px",
                      fontSize: "12px",
                      color: T.textMuted,
                      cursor: "pointer",
                      fontFamily: "'DM Mono', monospace",
                      transition: "all 0.15s",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Messages (AI SDK UIMessage format with parts) */}
            {messages.map((msg: UIMessage) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className="msg-enter"
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-end" : "flex-start",
                    gap: "10px",
                    marginBottom: "16px",
                    alignItems: "flex-end",
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "9px",
                        background:
                          "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        flexShrink: 0,
                      }}
                    >
                      &#x25C8;
                    </div>
                  )}
                  <div style={{ maxWidth: "72%" }}>
                    {/* Render parts */}
                    {msg.parts.map((part, idx) => {
                      // Text part
                      if (part.type === "text") {
                        return (
                          <div key={idx}>
                            <div
                              style={{
                                background: isUser ? T.userMsg : T.msgBg,
                                color: isUser ? "#fff" : T.text,
                                border: isUser
                                  ? "none"
                                  : `1px solid ${T.border}`,
                                borderRadius: isUser
                                  ? "16px 16px 4px 16px"
                                  : "4px 16px 16px 16px",
                                padding: "10px 14px",
                                fontSize: "14px",
                                lineHeight: 1.65,
                                whiteSpace: "pre-wrap",
                                boxShadow: isUser
                                  ? "0 4px 20px rgba(139,92,246,0.2)"
                                  : "none",
                              }}
                            >
                              {part.text}
                            </div>
                          </div>
                        );
                      }

                      // File/image part
                      if (part.type === "file") {
                        const filePart = part as {
                          type: "file";
                          mediaType: string;
                          url: string;
                        };
                        if (filePart.mediaType?.startsWith("image/")) {
                          return (
                            <div
                              key={idx}
                              style={{
                                marginBottom: "6px",
                                display: "flex",
                                justifyContent: isUser
                                  ? "flex-end"
                                  : "flex-start",
                              }}
                            >
                              <img
                                src={filePart.url}
                                alt="attachment"
                                style={{
                                  maxWidth: "200px",
                                  maxHeight: "150px",
                                  borderRadius: "10px",
                                  border: `1px solid ${T.border}`,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                          );
                        }
                      }

                      // Tool invocation part — render as structured task card
                      if (
                        part.type?.startsWith("tool-") ||
                        part.type === "dynamic-tool"
                      ) {
                        const toolPart = part as {
                          type: string;
                          toolName: string;
                          state: string;
                          result?: unknown;
                          args?: unknown;
                        };
                        return (
                          <ToolCard
                            key={idx}
                            part={toolPart}
                            t={T}
                          />
                        );
                      }

                      return null;
                    })}

                    {/* Timestamp */}
                    <div
                      style={{
                        fontSize: "10px",
                        fontFamily: "'DM Mono', monospace",
                        color: T.textFaint,
                        marginTop: "4px",
                        textAlign: isUser ? "right" : "left",
                        paddingInline: "4px",
                      }}
                    >
                      {formatTime(new Date())}
                    </div>
                  </div>
                  {isUser && (
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "9px",
                        background: T.userAvatar,
                        border: `1px solid rgba(139,92,246,0.2)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        flexShrink: 0,
                        color: T.accent,
                        fontWeight: 700,
                      }}
                    >
                      U
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading */}
            {isLoading && (
              <div
                className="msg-enter"
                style={{
                  display: "flex",
                  gap: "10px",
                  marginBottom: "16px",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "9px",
                    background:
                      "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "13px",
                  }}
                >
                  &#x25C8;
                </div>
                <div
                  style={{
                    background: T.msgBg,
                    border: `1px solid ${T.border}`,
                    borderRadius: "4px 16px 16px 16px",
                    padding: "12px 16px",
                    display: "flex",
                    gap: "5px",
                    alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: "5px",
                        height: "5px",
                        borderRadius: "50%",
                        background: "#8b5cf6",
                        animation: `bounce 1.2s infinite ${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: "20px" }} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "14px 20px 22px",
              borderTop: `1px solid ${T.border}`,
              backdropFilter: "blur(10px)",
              background: T.headerBg,
            }}
          >
            {/* Pending image previews */}
            {pendingImages.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "10px",
                  flexWrap: "wrap",
                }}
              >
                {pendingImages.map((img, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img
                      src={img}
                      alt="pending"
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "8px",
                        objectFit: "cover",
                        border: `1px solid ${T.border}`,
                      }}
                    />
                    <button
                      onClick={() => removePendingImage(i)}
                      style={{
                        position: "absolute",
                        top: "-6px",
                        right: "-6px",
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "none",
                        background: "#f87171",
                        color: "#fff",
                        fontSize: "10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      &#x00D7;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={onSubmit}
              style={{
                display: "flex",
                gap: "10px",
                alignItems: "center",
              }}
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: "none" }}
              />

              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Attach image"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  flexShrink: 0,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color:
                    pendingImages.length > 0 ? T.accent : T.textMuted,
                  fontSize: "18px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    T.cardHover;
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    T.borderHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    T.border;
                }}
              >
                &#x1F4CE;
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                placeholder={
                  pendingImages.length > 0
                    ? "Describe the image or ask a question..."
                    : "Add a task, ask a question, or give a command..."
                }
                style={{
                  flex: 1,
                  background: T.inputBg,
                  border: `1px solid ${T.border}`,
                  borderRadius: "12px",
                  padding: "12px 16px",
                  color: T.text,
                  fontSize: "14px",
                  fontFamily: "'Syne', sans-serif",
                  transition: "all 0.2s ease",
                }}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={
                  (!input.trim() && pendingImages.length === 0) ||
                  isLoading
                }
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "none",
                  flexShrink: 0,
                  background:
                    (input.trim() || pendingImages.length > 0) &&
                    !isLoading
                      ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
                      : T.inputBg,
                  color:
                    (input.trim() || pendingImages.length > 0) &&
                    !isLoading
                      ? "#fff"
                      : T.textFaint,
                  fontSize: "18px",
                  cursor:
                    (input.trim() || pendingImages.length > 0) &&
                    !isLoading
                      ? "pointer"
                      : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                  boxShadow:
                    (input.trim() || pendingImages.length > 0) &&
                    !isLoading
                      ? "0 4px 16px rgba(139,92,246,0.3)"
                      : "none",
                }}
              >
                &#x2191;
              </button>
            </form>
            <div
              style={{
                marginTop: "8px",
                textAlign: "center",
                fontSize: "10px",
                fontFamily: "'DM Mono', monospace",
                color: T.textFaint,
              }}
            >
              Enter to send &middot; &#x1F4CE; attach image &middot;
              &#x270E; edit &middot; &#x2713; complete &middot; &#x25B6;
              start &middot; &#x00D7; delete
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
