"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

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
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  t: theme,
}: {
  task: Task;
  onStatusChange: (id: string, status: Status) => void;
  onDelete: (id: string) => void;
  t: typeof DARK;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const overdue = isOverdue(task);
  const done = task.status === "done";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "5px", alignItems: "center", marginBottom: "5px", flexWrap: "wrap" }}>
            <span style={{
              fontSize: "9px", fontFamily: "monospace", letterSpacing: "0.12em", fontWeight: 700,
              color: done ? theme.textFaint : PRIORITY_COLOR[task.priority],
              background: done ? "transparent" : PRIORITY_BG[task.priority],
              padding: "2px 6px", borderRadius: "4px",
            }}>{task.priority.toUpperCase()}</span>
            {overdue && <span style={{ fontSize: "9px", background: "rgba(248,113,113,0.12)", color: "#f87171", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>OVERDUE</span>}
            {done && <span style={{ fontSize: "9px", background: "rgba(52,211,153,0.1)", color: "#34d399", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>DONE</span>}
            {task.status === "in_progress" && !done && <span style={{ fontSize: "9px", background: "rgba(251,191,36,0.1)", color: "#fbbf24", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>ACTIVE</span>}
          </div>
          <div style={{
            fontSize: "13px", fontWeight: 500,
            color: done ? theme.textMuted : theme.text,
            textDecoration: done ? "line-through" : "none",
            lineHeight: 1.4,
            overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
          }}>{task.title}</div>
          {task.dueDate && (
            <div style={{ fontSize: "11px", color: overdue ? "#f87171" : theme.textMuted, marginTop: "4px", fontFamily: "monospace" }}>
              📅 {formatDate(task.dueDate)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {!done && (
            <button
              onClick={() => onStatusChange(task.id, "done")}
              title="Mark done"
              style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(52,211,153,0.4)", background: "transparent", cursor: "pointer", color: "#34d399", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(52,211,153,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >✓</button>
          )}
          {task.status !== "in_progress" && !done && (
            <button
              onClick={() => onStatusChange(task.id, "in_progress")}
              title="Start task"
              style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(251,191,36,0.4)", background: "transparent", cursor: "pointer", color: "#fbbf24", fontSize: "10px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(251,191,36,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >▶</button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            title="Delete"
            style={{ width: "26px", height: "26px", borderRadius: "50%", border: `1.5px solid ${theme.border}`, background: "transparent", cursor: "pointer", color: theme.textMuted, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "#f87171"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = theme.textMuted; }}
          >×</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [model, setModel] = useState("gpt-4o-mini");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgHistory = useRef<{ role: string; content: string }[]>([]);

  const T = theme === "dark" ? DARK : LIGHT;

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  // ── Task actions ───────────────────────────────────────────────────────────

  const handleStatusChange = async (id: string, status: Status) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  };

  // ── Chat ───────────────────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setStarted(true);

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    msgHistory.current = [...msgHistory.current, { role: "user", content: text }];
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgHistory.current }),
      });

      const data = await res.json();
      if (data.model) setModel(data.model);

      const replyText = data.text || "I couldn't process that. Please try again.";
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: replyText, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
      msgHistory.current = [...msgHistory.current, { role: "assistant", content: replyText }];

      await fetchTasks();
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: "Something went wrong. Please try again.", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  };

  // ── Derived state ──────────────────────────────────────────────────────────

  const counts: Record<Filter, number> = {
    all: tasks.length,
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    done: tasks.filter(t => t.status === "done").length,
    overdue: tasks.filter(isOverdue).length,
  };

  const filtered = tasks.filter(t => {
    if (filter === "all") return true;
    if (filter === "overdue") return isOverdue(t);
    return t.status === filter;
  });

  const filters: { key: Filter; label: string; icon: string }[] = [
    { key: "all", label: "All", icon: "◈" },
    { key: "todo", label: "Todo", icon: "○" },
    { key: "in_progress", label: "Active", icon: "◑" },
    { key: "done", label: "Done", icon: "●" },
    { key: "overdue", label: "Overdue", icon: "⚠" },
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

      <div style={{ height: "100vh", display: "flex", background: T.bg, color: T.text, fontFamily: "'Syne', sans-serif", transition: "background 0.3s ease, color 0.3s ease" }}>

        {/* Ambient glows — dark mode only */}
        {theme === "dark" && (
          <>
            <div style={{ position: "fixed", top: "-20%", left: "-10%", width: "50vw", height: "50vh", background: "radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
            <div style={{ position: "fixed", bottom: "-20%", right: "-10%", width: "40vw", height: "40vh", background: "radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />
          </>
        )}

        {/* ── Sidebar ── */}
        <div style={{
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
        }}>
          <div style={{ padding: "24px 18px 0", minWidth: "280px" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>◈</div>
              <h1 style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em", color: T.text }}>TaskFlow</h1>
              <span style={{ fontSize: "9px", fontFamily: "'DM Mono', monospace", color: "#8b5cf6", background: T.accentSoft, padding: "2px 6px", borderRadius: "4px", border: `1px solid rgba(139,92,246,0.2)`, letterSpacing: "0.1em" }}>AI</span>
            </div>
            <p style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", color: T.textMuted, marginBottom: "20px", paddingLeft: "38px" }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>

            {/* Filters */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "16px" }}>
              {filters.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "7px 10px", borderRadius: "8px", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: 600, fontFamily: "'Syne', sans-serif",
                  background: filter === f.key ? T.filterActive : "transparent",
                  color: filter === f.key ? T.filterActiveText : T.textMuted,
                  transition: "all 0.15s ease",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace" }}>{f.icon}</span>
                    {f.label}
                  </span>
                  {counts[f.key] > 0 && (
                    <span style={{
                      fontSize: "10px", fontFamily: "'DM Mono', monospace",
                      background: filter === f.key ? T.accentSoft : T.border,
                      color: filter === f.key ? T.filterActiveText : T.textMuted,
                      padding: "1px 6px", borderRadius: "10px", fontWeight: 700,
                    }}>{counts[f.key]}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ height: "1px", background: T.border, margin: "0 0 16px" }} />
          </div>

          {/* Task list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px" }}>
            {filtered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "160px", color: T.textFaint, textAlign: "center" }}>
                <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.3 }}>
                  {filter === "overdue" ? "✓" : filter === "done" ? "◉" : "◈"}
                </div>
                <div style={{ fontSize: "11px", fontFamily: "'DM Mono', monospace", lineHeight: 1.6 }}>
                  {filter === "all" ? "Chat to add your first task" : `No ${filter.replace("_", " ")} tasks`}
                </div>
              </div>
            ) : filtered.map(t => (
              <TaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onDelete={handleDelete} t={T} />
            ))}
          </div>
        </div>

        {/* ── Main chat ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", zIndex: 1 }}>

          {/* Header */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px", backdropFilter: "blur(10px)", background: T.headerBg }}>
            {/* Sidebar toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ width: "30px", height: "30px", borderRadius: "8px", border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.textMuted, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.cardHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >{isSidebarOpen ? "◀" : "▶"}</button>

            {/* Status */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#34d399", animation: "pulse 2.5s infinite" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: T.textMuted }}>AI Assistant</span>
            </div>

            {/* Right side controls */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
              {/* Model badge */}
              <span style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: T.textMuted, background: T.inputBg, padding: "4px 10px", borderRadius: "6px", border: `1px solid ${T.border}` }}>
                ◈ {model}
              </span>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.textMuted, fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s ease" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = T.cardHover; (e.currentTarget as HTMLButtonElement).style.borderColor = T.borderHover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; }}
              >
                {theme === "dark" ? "☀" : "☽"}
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 0" }}>

            {/* Empty state */}
            {messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "260px", textAlign: "center" }}>
                <div style={{ position: "relative", marginBottom: "20px" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", boxShadow: "0 0 60px rgba(139,92,246,0.25)", margin: "0 auto" }}>◈</div>
                </div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: T.text, marginBottom: "8px", letterSpacing: "-0.02em" }}>What can I help with?</h2>
                <p style={{ fontSize: "13px", color: T.textMuted, maxWidth: "260px", lineHeight: 1.7, fontFamily: "'DM Mono', monospace" }}>
                  Manage tasks through natural conversation.
                </p>
              </div>
            )}

            {/* Suggestions */}
            {!started && messages.length === 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", marginBottom: "32px" }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className="suggestion-btn"
                    onClick={() => { setInput(s); setStarted(true); inputRef.current?.focus(); }}
                    style={{ background: T.suggestionBg, border: `1px solid ${T.suggestionBorder}`, borderRadius: "20px", padding: "7px 14px", fontSize: "12px", color: T.textMuted, cursor: "pointer", fontFamily: "'DM Mono', monospace", transition: "all 0.15s" }}
                  >{s}</button>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className="msg-enter" style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", gap: "10px", marginBottom: "16px", alignItems: "flex-end" }}>
                  {!isUser && (
                    <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", flexShrink: 0 }}>◈</div>
                  )}
                  <div style={{ maxWidth: "72%" }}>
                    <div style={{
                      background: isUser ? T.userMsg : T.msgBg,
                      color: isUser ? "#fff" : T.text,
                      border: isUser ? "none" : `1px solid ${T.border}`,
                      borderRadius: isUser ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                      padding: "10px 14px", fontSize: "14px", lineHeight: 1.65, whiteSpace: "pre-wrap",
                      boxShadow: isUser ? "0 4px 20px rgba(139,92,246,0.2)" : "none",
                    }}>{msg.content}</div>
                    <div style={{ fontSize: "10px", fontFamily: "'DM Mono', monospace", color: T.textFaint, marginTop: "4px", textAlign: isUser ? "right" : "left", paddingInline: "4px" }}>
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                  {isUser && (
                    <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: T.userAvatar, border: `1px solid rgba(139,92,246,0.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", flexShrink: 0, color: T.accent, fontWeight: 700 }}>U</div>
                  )}
                </div>
              );
            })}

            {/* Loading */}
            {isLoading && (
              <div className="msg-enter" style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "flex-end" }}>
                <div style={{ width: "28px", height: "28px", borderRadius: "9px", background: "linear-gradient(135deg, #8b5cf6, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>◈</div>
                <div style={{ background: T.msgBg, border: `1px solid ${T.border}`, borderRadius: "4px 16px 16px 16px", padding: "12px 16px", display: "flex", gap: "5px", alignItems: "center" }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#8b5cf6", animation: `bounce 1.2s infinite ${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: "20px" }} />
          </div>

          {/* Input */}
          <div style={{ padding: "14px 20px 22px", borderTop: `1px solid ${T.border}`, backdropFilter: "blur(10px)", background: T.headerBg }}>
            <form onSubmit={onSubmit} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={isLoading}
                placeholder="Add a task, ask a question, or give a command..."
                style={{
                  flex: 1, background: T.inputBg, border: `1px solid ${T.border}`,
                  borderRadius: "12px", padding: "12px 16px",
                  color: T.text, fontSize: "14px", fontFamily: "'Syne', sans-serif",
                  transition: "all 0.2s ease",
                }}
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!input.trim() || isLoading}
                style={{
                  width: "44px", height: "44px", borderRadius: "12px", border: "none", flexShrink: 0,
                  background: input.trim() && !isLoading ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : T.inputBg,
                  color: input.trim() && !isLoading ? "#fff" : T.textFaint,
                  fontSize: "18px", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease",
                  boxShadow: input.trim() && !isLoading ? "0 4px 16px rgba(139,92,246,0.3)" : "none",
                }}
              >↑</button>
            </form>
            <div style={{ marginTop: "8px", textAlign: "center", fontSize: "10px", fontFamily: "'DM Mono', monospace", color: T.textFaint }}>
              Enter to send · Click tasks to expand · ✓ complete · ▶ start · × delete
            </div>
          </div>
        </div>
      </div>
    </>
  );
}