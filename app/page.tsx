"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import type { Task, Filter, Theme, Status } from "@/lib/types";
import { DARK, LIGHT } from "@/lib/theme";
import { Sidebar } from "@/components/Sidebar";
import { ChatHeader } from "@/components/ChatHeader";
import { EmptyState } from "@/components/EmptyState";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { TaskDetailModal } from "@/components/TaskDetailModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PendingFile {
  name: string;
  type: string;
  dataUrl: string;
}

// ─── Global styles (fonts, animations, markdown) ─────────────────────────────

const GLOBAL_CSS = `
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

  /* Markdown styles for AI responses */
  .markdown-body { line-height: 1.65; }
  .markdown-body p { margin: 0 0 8px; }
  .markdown-body p:last-child { margin-bottom: 0; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    margin: 12px 0 6px; font-weight: 700; line-height: 1.3;
  }
  .markdown-body h1 { font-size: 18px; }
  .markdown-body h2 { font-size: 16px; }
  .markdown-body h3 { font-size: 14px; }
  .markdown-body ul, .markdown-body ol { padding-left: 20px; margin: 6px 0; }
  .markdown-body li { margin: 3px 0; }
  .markdown-body code {
    font-family: 'DM Mono', monospace; font-size: 12px;
    padding: 2px 6px; border-radius: 4px; background: rgba(139,92,246,0.12);
  }
  .markdown-body pre {
    margin: 8px 0; padding: 12px; border-radius: 8px;
    overflow-x: auto; background: rgba(0,0,0,0.3) !important;
  }
  .markdown-body pre code { padding: 0; background: transparent; font-size: 12px; }
  .markdown-body strong { font-weight: 700; }
  .markdown-body em { font-style: italic; }
  .markdown-body blockquote {
    border-left: 3px solid rgba(139,92,246,0.4);
    padding: 4px 12px; margin: 8px 0; opacity: 0.85;
  }
  .markdown-body table { border-collapse: collapse; margin: 8px 0; font-size: 12px; width: 100%; }
  .markdown-body th, .markdown-body td {
    padding: 6px 10px; border: 1px solid rgba(128,128,128,0.2); text-align: left;
  }
  .markdown-body th { font-weight: 700; background: rgba(139,92,246,0.08); }
  .markdown-body hr { border: none; border-top: 1px solid rgba(128,128,128,0.2); margin: 12px 0; }
  .markdown-body a { color: #a78bfa; text-decoration: underline; }
`;

// ─── Page component ──────────────────────────────────────────────────────────

export default function Home() {
  // ── State ──
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [model, setModel] = useState("gpt-5-mini");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageTimestamps = useRef<Map<string, Date>>(new Map());

  const T = theme === "dark" ? DARK : LIGHT;

  // ── Chat transport + hook ──
  const modelRef = useRef(model);
  modelRef.current = model;

  const [chatTransport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelRef.current }),
      }),
  );

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    transport: chatTransport,
    onFinish: () => fetchTasks(),
    onError: (error) => console.error("Chat error:", error),
  });

  const isLoading = status === "streaming" || status === "submitted";

  // ── Theme persistence ──
  useEffect(() => {
    const saved = localStorage.getItem("taskflow-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("taskflow-theme", next);
  };

  // ── Track message timestamps (prevents re-render time drift) ──
  useEffect(() => {
    const now = new Date();
    for (const msg of messages) {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, now);
      }
    }
  }, [messages]);

  // ── Data sync ──
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

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && showModelPicker) {
        setShowModelPicker(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showModelPicker]);

  // ── Sidebar task mutations ──
  const handleStatusChange = async (id: string, newStatus: Status) => {
    setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, status: newStatus } : tk)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    setTasks((prev) => prev.filter((tk) => tk.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  };

  const handleEdit = async (id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((tk) => (tk.id === id ? { ...tk, ...updates } : tk)));
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  };

  // ── New chat / reset ──
  const handleNewChat = () => {
    setMessages([]);
    setStarted(false);
    setInput("");
    setPendingFiles([]);
    messageTimestamps.current.clear();
  };

  // ── Send handler ──
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    if (isLoading) return;
    setStarted(true);
    setInput("");

    const files =
      pendingFiles.length > 0
        ? pendingFiles.map((f) => ({
            type: "file" as const,
            mediaType: f.type || "application/octet-stream",
            url: f.dataUrl,
          }))
        : undefined;

    const fileNames = pendingFiles.map((f) => f.name).join(", ");
    const hasImages = pendingFiles.some((f) => f.type.startsWith("image/"));
    const hasDocs = pendingFiles.some((f) => !f.type.startsWith("image/"));

    let fallbackText = text;
    if (!text && pendingFiles.length > 0) {
      if (hasImages && hasDocs)
        fallbackText = `I've attached files (${fileNames}). Please analyze them and relate to my tasks.`;
      else if (hasImages)
        fallbackText = `I've attached an image. Please describe what you see and how it relates to my tasks.`;
      else
        fallbackText = `I've attached a file (${fileNames}). Please analyze its contents and relate to my tasks.`;
    }

    setPendingFiles([]);
    await sendMessage({ text: fallbackText, files });
    await fetchTasks();
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    setStarted(true);
    inputRef.current?.focus();
  };

  // ── Render ──
  return (
    <>
      <style>{GLOBAL_CSS}</style>

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
        {/* Ambient background glows */}
        {theme === "dark" && (
          <>
            <div
              style={{
                position: "fixed", top: "-20%", left: "-10%",
                width: "50vw", height: "50vh",
                background: "radial-gradient(ellipse, rgba(139,92,246,0.06) 0%, transparent 70%)",
                pointerEvents: "none", zIndex: 0,
              }}
            />
            <div
              style={{
                position: "fixed", bottom: "-20%", right: "-10%",
                width: "40vw", height: "40vh",
                background: "radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)",
                pointerEvents: "none", zIndex: 0,
              }}
            />
          </>
        )}

        {/* Sidebar */}
        <Sidebar
          tasks={tasks}
          filter={filter}
          setFilter={setFilter}
          isSidebarOpen={isSidebarOpen}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onOpenDetail={setDetailTask}
          t={T}
        />

        {/* Main chat area */}
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
          <ChatHeader
            theme={theme}
            model={model}
            setModel={setModel}
            toggleTheme={toggleTheme}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            showModelPicker={showModelPicker}
            setShowModelPicker={setShowModelPicker}
            onNewChat={handleNewChat}
            t={T}
          />

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 0" }}>
            <EmptyState
              t={T}
              started={started}
              messagesEmpty={messages.length === 0}
              onSuggestionClick={handleSuggestionClick}
            />

            {messages.map((msg: UIMessage) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                timestamp={messageTimestamps.current.get(msg.id) ?? new Date()}
                t={T}
              />
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div
                className="msg-enter"
                style={{
                  display: "flex", gap: "10px",
                  marginBottom: "16px", alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "28px", height: "28px", borderRadius: "9px",
                    background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: "13px",
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
                    display: "flex", gap: "5px", alignItems: "center",
                  }}
                >
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      style={{
                        width: "5px", height: "5px", borderRadius: "50%",
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

          {/* Chat input with drag-and-drop */}
          <ChatInput
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            onSubmit={onSubmit}
            onStop={() => { stop(); fetchTasks(); }}
            inputRef={inputRef}
            theme={theme}
            t={T}
          />
        </div>
      </div>

      {/* Task detail modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(id, updates) => {
            handleEdit(id, updates);
            setDetailTask((prev) =>
              prev && prev.id === id ? { ...prev, ...updates } : prev,
            );
          }}
          t={T}
        />
      )}
    </>
  );
}
