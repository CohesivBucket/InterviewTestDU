"use client";

import type { Task, Filter, Status, ThemeTokens } from "@/lib/types";
import { isOverdue } from "@/lib/theme";
import { TaskCard } from "./TaskCard";

const FILTER_DEFS: { key: Filter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "\u25C8" },
  { key: "todo", label: "Todo", icon: "\u25CB" },
  { key: "in_progress", label: "Active", icon: "\u25D1" },
  { key: "done", label: "Done", icon: "\u25CF" },
  { key: "overdue", label: "Overdue", icon: "\u26A0" },
];

interface SidebarProps {
  tasks: Task[];
  filter: Filter;
  setFilter: (f: Filter) => void;
  isSidebarOpen: boolean;
  onStatusChange: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
  onOpenDetail: (task: Task) => void;
  t: ThemeTokens;
}

export function Sidebar({
  tasks,
  filter,
  setFilter,
  isSidebarOpen,
  onStatusChange,
  onDelete,
  onEdit,
  onOpenDetail,
  t,
}: SidebarProps) {
  const counts: Record<Filter, number> = {
    all: tasks.length,
    todo: tasks.filter((tk) => tk.status === "todo").length,
    in_progress: tasks.filter((tk) => tk.status === "in_progress").length,
    done: tasks.filter((tk) => tk.status === "done").length,
    overdue: tasks.filter(isOverdue).length,
  };

  const filtered = tasks.filter((tk) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(tk);
    return tk.status === filter;
  });

  return (
    <div
      style={{
        width: isSidebarOpen ? "280px" : "0px",
        minWidth: isSidebarOpen ? "280px" : "0px",
        overflow: "hidden",
        transition: "all 0.3s ease",
        borderRight: `1px solid ${t.border}`,
        background: t.bgSecondary,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      <div style={{ padding: "24px 18px 0", minWidth: "280px" }}>
        {/* Brand */}
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
              fontSize: "13px",
              color: "#fff",
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
              color: t.text,
            }}
          >
            TaskFlow
          </h1>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "'DM Mono', monospace",
              color: "#8b5cf6",
              background: t.accentSoft,
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid rgba(139,92,246,0.2)",
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
            color: t.textMuted,
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
          {FILTER_DEFS.map((f) => (
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
                  filter === f.key ? t.filterActive : "transparent",
                color:
                  filter === f.key ? t.filterActiveText : t.textMuted,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                    background: filter === f.key ? t.accentSoft : t.border,
                    color: filter === f.key ? t.filterActiveText : t.textMuted,
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

        <div style={{ height: "1px", background: t.border, margin: "0 0 16px" }} />
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "160px",
              color: t.textFaint,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.3 }}>
              {filter === "overdue" ? "\u2713" : filter === "done" ? "\u25C9" : "\u25C8"}
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
          filtered.map((tk) => (
            <TaskCard
              key={tk.id}
              task={tk}
              onStatusChange={onStatusChange}
              onDelete={onDelete}
              onEdit={onEdit}
              onOpenDetail={onOpenDetail}
              t={t}
            />
          ))
        )}
      </div>
    </div>
  );
}
