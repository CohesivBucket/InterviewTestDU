"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Task, Filter, Theme, Status } from "@/lib/types";
import { DARK, LIGHT, formatTime, isOverdue, hover } from "@/lib/theme";
import { ToolCard } from "@/components/ToolCard";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import { ChatHeader } from "@/components/ChatHeader";
import { EmptyState } from "@/components/EmptyState";

// Types

interface PendingFile {
  name: string;
  type: string;
  dataUrl: string;
}

// Filter definitions

const FILTER_DEFS: { key: Filter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "\u25C8" },
  { key: "todo", label: "Todo", icon: "\u25CB" },
  { key: "in_progress", label: "Active", icon: "\u25D1" },
  { key: "done", label: "Done", icon: "\u25CF" },
  { key: "overdue", label: "Overdue", icon: "\u26A0" },
];

// Accepted file types for upload
const ACCEPTED_TYPES = "image/*,application/pdf,.txt,.csv,.md,.json,.xml,.html";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>("dark");
  const [model, setModel] = useState("gpt-5-mini");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTimestamps = useRef<Map<string, Date>>(new Map());
  const dragCounter = useRef(0);

  const T = theme === "dark" ? DARK : LIGHT;

  // Chat transport + hook

  const modelRef = useRef(model);
  modelRef.current = model;

  const [chatTransport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ model: modelRef.current }),
      })
  );

  const { messages, sendMessage, stop, status, setMessages } = useChat({
    transport: chatTransport,
    onFinish: () => {
      fetchTasks();
    },
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Persist theme

  useEffect(() => {
    const saved = localStorage.getItem("taskflow-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("taskflow-theme", next);
  };

  // Track message timestamps (fixes re-render bug)

  useEffect(() => {
    const now = new Date();
    for (const msg of messages) {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, now);
      }
    }
  }, [messages]);

  // File attachments (images, PDFs, text files, etc.)

  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setPendingFiles((prev) => [
            ...prev,
            { name: file.name, type: file.type, dataUrl: reader.result as string },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Drag and drop

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Data sync

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

  // Keyboard shortcuts

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModKey = e.metaKey || e.ctrlKey;

      if (isModKey && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }

      if (e.key === "Escape") {
        if (showModelPicker) setShowModelPicker(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showModelPicker]);

  // Sidebar task mutations

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

  // New chat / reset
  const handleNewChat = () => {
    setMessages([]);
    setStarted(false);
    setInput("");
    setPendingFiles([]);
    messageTimestamps.current.clear();
  };

  // Send handler

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && pendingFiles.length === 0) return;
    if (isLoading) return;
    setStarted(true);
    setInput("");

    const files =
      pendingFiles.length > 0
        ? pendingFiles.map((f) => {
            const mediaType = f.type || "application/octet-stream";
            return { type: "file" as const, mediaType, url: f.dataUrl };
          })
        : undefined;

    setPendingFiles([]);

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

    await sendMessage({ text: fallbackText, files });
    await fetchTasks();
  };

  // Filter state

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

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    setStarted(true);
    inputRef.current?.focus();
  };

  // File preview helper

  const getFileIcon = (type: string) => {
    if (type === "application/pdf") return "PDF";
    if (type.startsWith("text/")) return "TXT";
    if (type === "application/json") return "JSON";
    if (type.includes("csv")) return "CSV";
    if (type.includes("xml") || type.includes("html")) return "XML";
    return "FILE";
  };

  // Render

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

        /* Markdown styles for AI responses */
        .markdown-body { line-height: 1.65; }
        .markdown-body p { margin: 0 0 8px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          margin: 12px 0 6px;
          font-weight: 700;
          line-height: 1.3;
        }
        .markdown-body h1 { font-size: 18px; }
        .markdown-body h2 { font-size: 16px; }
        .markdown-body h3 { font-size: 14px; }
        .markdown-body ul, .markdown-body ol {
          padding-left: 20px;
          margin: 6px 0;
        }
        .markdown-body li { margin: 3px 0; }
        .markdown-body code {
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(139,92,246,0.12);
        }
        .markdown-body pre {
          margin: 8px 0;
          padding: 12px;
          border-radius: 8px;
          overflow-x: auto;
          background: rgba(0,0,0,0.3) !important;
        }
        .markdown-body pre code {
          padding: 0;
          background: transparent;
          font-size: 12px;
        }
        .markdown-body strong { font-weight: 700; }
        .markdown-body em { font-style: italic; }
        .markdown-body blockquote {
          border-left: 3px solid rgba(139,92,246,0.4);
          padding: 4px 12px;
          margin: 8px 0;
          opacity: 0.85;
        }
        .markdown-body table {
          border-collapse: collapse;
          margin: 8px 0;
          font-size: 12px;
          width: 100%;
        }
        .markdown-body th, .markdown-body td {
          padding: 6px 10px;
          border: 1px solid rgba(128,128,128,0.2);
          text-align: left;
        }
        .markdown-body th {
          font-weight: 700;
          background: rgba(139,92,246,0.08);
        }
        .markdown-body hr {
          border: none;
          border-top: 1px solid rgba(128,128,128,0.2);
          margin: 12px 0;
        }
        .markdown-body a {
          color: #a78bfa;
          text-decoration: underline;
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
        {/* Ambient glows */}
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

        {/* Sidebar */}
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
                  onOpenDetail={setDetailTask}
                  t={T}
                />
              ))
            )}
          </div>
        </div>

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
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px 0",
            }}
          >
            <EmptyState
              t={T}
              started={started}
              messagesEmpty={messages.length === 0}
              onSuggestionClick={handleSuggestionClick}
            />

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
                    {msg.parts.map((part, idx) => {
                      if (part.type === "step-start") return null;

                      if (part.type === "text") {
                        if (!part.text) return null;
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
                                boxShadow: isUser
                                  ? "0 4px 20px rgba(139,92,246,0.2)"
                                  : "none",
                              }}
                            >
                              {isUser ? (
                                <span style={{ whiteSpace: "pre-wrap" }}>
                                  {part.text}
                                </span>
                              ) : (
                                <div className="markdown-body">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {part.text}
                                  </ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

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
                        // Non-image file attachment in chat
                        return (
                          <div
                            key={idx}
                            style={{
                              marginBottom: "6px",
                              background: T.toolCardBg,
                              border: `1px solid ${T.toolCardBorder}`,
                              borderRadius: "10px",
                              padding: "8px 12px",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "9px",
                                fontFamily: "monospace",
                                fontWeight: 700,
                                color: T.accent,
                                background: T.accentSoft,
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {getFileIcon(filePart.mediaType)}
                            </span>
                            <span
                              style={{
                                fontSize: "12px",
                                color: T.textMuted,
                                fontFamily: "'DM Mono', monospace",
                              }}
                            >
                              Attached file
                            </span>
                          </div>
                        );
                      }

                      if (
                        part.type?.startsWith("tool-") ||
                        part.type === "dynamic-tool"
                      ) {
                        return (
                          <ToolCard
                            key={idx}
                            part={part as Record<string, unknown>}
                            t={T}
                          />
                        );
                      }

                      return null;
                    })}

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
                      {formatTime(
                        messageTimestamps.current.get(msg.id) ?? new Date()
                      )}
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

            {/* Loading indicator */}
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

          {/* Input area with drag-and-drop */}
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              padding: "14px 20px 22px",
              borderTop: `1px solid ${isDragging ? T.accent : T.border}`,
              background: isDragging
                ? (theme === "dark"
                    ? "rgba(139,92,246,0.08)"
                    : "rgba(124,58,237,0.06)")
                : T.headerBg,
              transition: "all 0.2s ease",
              position: "relative",
            }}
          >
            {/* Drag overlay */}
            {isDragging && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    theme === "dark"
                      ? "rgba(8,8,16,0.85)"
                      : "rgba(248,247,255,0.9)",
                  borderRadius: "0",
                  zIndex: 10,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "14px",
                      background: T.accentSoft,
                      border: `2px dashed ${T.accent}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      color: T.accent,
                    }}
                  >
                    +
                  </div>
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: T.accent,
                    }}
                  >
                    Drop files here
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: T.textMuted,
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    Images, PDFs, text files
                  </span>
                </div>
              </div>
            )}

            {/* Pending file previews */}
            {pendingFiles.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "10px",
                  flexWrap: "wrap",
                }}
              >
                {pendingFiles.map((file, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    {file.type.startsWith("image/") ? (
                      <img
                        src={file.dataUrl}
                        alt={file.name}
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "8px",
                          objectFit: "cover",
                          border: `1px solid ${T.border}`,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "8px",
                          border: `1px solid ${T.border}`,
                          background: T.cardBg,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "2px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: T.accent,
                          }}
                        >
                          {getFileIcon(file.type)}
                        </span>
                        <span
                          style={{
                            fontSize: "8px",
                            color: T.textMuted,
                            fontFamily: "'DM Mono', monospace",
                            maxWidth: "52px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textAlign: "center",
                          }}
                        >
                          {file.name}
                        </span>
                      </div>
                    )}
                    <button
                      onClick={() => removePendingFile(i)}
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
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Attach file (images, PDFs, text)"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  flexShrink: 0,
                  border: `1px solid ${T.border}`,
                  background: "transparent",
                  color:
                    pendingFiles.length > 0 ? T.accent : T.textMuted,
                  fontSize: "18px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s",
                }}
                {...hover(
                  { background: T.cardHover, borderColor: T.borderHover },
                  { background: "transparent", borderColor: T.border },
                )}
              >
                +
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    (e.metaKey || e.ctrlKey) &&
                    e.key === "Enter"
                  ) {
                    e.preventDefault();
                    onSubmit(e as unknown as React.FormEvent);
                  }
                }}
                disabled={isLoading}
                placeholder={
                  pendingFiles.length > 0
                    ? "Describe the file or ask a question..."
                    : "Add a task, ask a question, or drop a file..."
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
              {isLoading ? (
                <button
                  type="button"
                  onClick={() => {
                    stop();
                    fetchTasks();
                  }}
                  title="Stop generating"
                  className="send-btn"
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    border: "none",
                    flexShrink: 0,
                    background: "linear-gradient(135deg, #f87171, #ef4444)",
                    color: "#fff",
                    fontSize: "14px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    boxShadow: "0 4px 16px rgba(248,113,113,0.3)",
                  }}
                >
                  &#x25A0;
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-btn"
                  disabled={
                    !input.trim() && pendingFiles.length === 0
                  }
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    border: "none",
                    flexShrink: 0,
                    background:
                      input.trim() || pendingFiles.length > 0
                        ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
                        : T.inputBg,
                    color:
                      input.trim() || pendingFiles.length > 0
                        ? "#fff"
                        : T.textFaint,
                    fontSize: "18px",
                    cursor:
                      input.trim() || pendingFiles.length > 0
                        ? "pointer"
                        : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                    boxShadow:
                      input.trim() || pendingFiles.length > 0
                        ? "0 4px 16px rgba(139,92,246,0.3)"
                        : "none",
                  }}
                >
                  &#x2191;
                </button>
              )}
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
              Cmd+K focus &middot; Enter send &middot; Stop &middot;
              Attach &middot; Drop files &middot; Edit &middot; Complete
              &middot; Start &middot; Delete
            </div>
          </div>
        </div>
      </div>

      {/* Task detail modal */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(id, updates) => {
            handleEdit(id, updates);
            // Update the detail modal's task in real-time
            setDetailTask((prev) =>
              prev && prev.id === id ? { ...prev, ...updates } : prev
            );
          }}
          t={T}
        />
      )}
    </>
  );
}
