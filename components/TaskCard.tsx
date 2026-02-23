"use client";

import { useState } from "react";
import type { Task, Priority, Status } from "@/lib/types";
import {
  DARK,
  LIGHT,
  PRIORITY_COLOR,
  PRIORITY_BG,
  STATUS_COLOR,
  hover,
  formatDate,
  isOverdue,
} from "@/lib/theme";

export function TaskCard({
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

  // Edit mode
  if (editing) {
    return (
      <div
        style={{
          background: theme.cardHover,
          borderTop: `1px solid ${theme.accent}`,
          borderRight: `1px solid ${theme.accent}`,
          borderBottom: `1px solid ${theme.accent}`,
          borderLeft: `3px solid ${PRIORITY_COLOR[editPriority]}`,
          borderRadius: "10px",
          padding: "12px 14px",
          marginBottom: "8px",
          transition: "all 0.15s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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

  // Normal view
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !done ? theme.cardHover : theme.cardBg,
        borderTop: `1px solid ${overdue ? "rgba(248,113,113,0.3)" : theme.border}`,
        borderRight: `1px solid ${overdue ? "rgba(248,113,113,0.3)" : theme.border}`,
        borderBottom: `1px solid ${overdue ? "rgba(248,113,113,0.3)" : theme.border}`,
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
            {...hover({ background: "rgba(139,92,246,0.15)" })}
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
              {...hover({ background: "rgba(52,211,153,0.15)" })}
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
              {...hover({ background: "rgba(251,191,36,0.15)" })}
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
            {...hover(
              { background: "rgba(248,113,113,0.12)", color: "#f87171" },
              { background: "transparent", color: theme.textMuted },
            )}
          >
            &#x00D7;
          </button>
        </div>
      </div>
    </div>
  );
}
