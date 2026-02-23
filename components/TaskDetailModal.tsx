"use client";

import { useState, useRef } from "react";
import type { Task, TaskAttachment, Priority, Status } from "@/lib/types";
import {
  DARK,
  PRIORITY_COLOR,
  PRIORITY_BG,
  hover,
  formatDate,
  isOverdue,
} from "@/lib/theme";

const ACCEPTED_TYPES =
  "image/*,application/pdf,.txt,.csv,.md,.json,.xml,.html";

function getFileIcon(type: string) {
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("text/")) return "TXT";
  if (type === "application/json") return "JSON";
  if (type.includes("csv")) return "CSV";
  if (type.includes("xml") || type.includes("html")) return "XML";
  return "FILE";
}

export function TaskDetailModal({
  task,
  onClose,
  onEdit,
  t: theme,
}: {
  task: Task;
  onClose: () => void;
  onEdit: (id: string, updates: Partial<Task>) => void;
  t: typeof DARK;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overdue = isOverdue(task);
  const done = task.status === "done";
  const attachments = task.attachments ?? [];

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newAttachments: TaskAttachment[] = [];
    let loaded = 0;
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          newAttachments.push({
            name: file.name,
            type: file.type,
            dataUrl: reader.result,
          });
        }
        loaded++;
        if (loaded === files.length) {
          onEdit(task.id, {
            attachments: [...attachments, ...newAttachments],
          });
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleRemoveAttachment = (idx: number) => {
    const updated = attachments.filter((_, i) => i !== idx);
    onEdit(task.id, { attachments: updated });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 10000,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, 90vw)",
          maxHeight: "85vh",
          background: theme.bgSecondary,
          border: `1px solid ${theme.border}`,
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          zIndex: 10001,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeUp 0.2s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                marginBottom: "8px",
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
                  background: done
                    ? "transparent"
                    : PRIORITY_BG[task.priority],
                  padding: "2px 8px",
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
                    padding: "2px 8px",
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
                    padding: "2px 8px",
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
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 600,
                  }}
                >
                  ACTIVE
                </span>
              )}
            </div>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 700,
                color: done ? theme.textMuted : theme.text,
                textDecoration: done ? "line-through" : "none",
                lineHeight: 1.4,
                fontFamily: "'Syne', sans-serif",
              }}
            >
              {task.title}
            </h2>
            {task.dueDate && (
              <div
                style={{
                  fontSize: "12px",
                  color: overdue ? "#f87171" : theme.textMuted,
                  marginTop: "6px",
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                Due: {formatDate(task.dueDate)}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: `1px solid ${theme.border}`,
              background: "transparent",
              color: theme.textMuted,
              fontSize: "16px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
            {...hover(
              { background: theme.cardHover, borderColor: theme.borderHover },
              { background: "transparent", borderColor: theme.border }
            )}
          >
            &#x00D7;
          </button>
        </div>

        {/* Body — scrollable */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px 24px",
          }}
        >
          {/* Attachments section */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "14px",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontFamily: "monospace",
                color: theme.textMuted,
                letterSpacing: "0.1em",
                fontWeight: 700,
              }}
            >
              ATTACHMENTS ({attachments.length})
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              onChange={handleAddFiles}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                fontSize: "11px",
                fontFamily: "'Syne', sans-serif",
                fontWeight: 600,
                color: theme.accent,
                background: theme.accentSoft,
                border: `1px solid rgba(139,92,246,0.3)`,
                borderRadius: "6px",
                padding: "4px 12px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              {...hover(
                { background: "rgba(139,92,246,0.2)" },
                { background: theme.accentSoft }
              )}
            >
              + Add Files
            </button>
          </div>

          {attachments.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${theme.border}`,
                borderRadius: "12px",
                padding: "32px 20px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  fontSize: "24px",
                  marginBottom: "8px",
                  opacity: 0.3,
                  color: theme.textMuted,
                }}
              >
                +
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: theme.textMuted,
                  fontFamily: "'DM Mono', monospace",
                  marginBottom: "4px",
                }}
              >
                Drop or click to attach files
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: theme.textFaint,
                  fontFamily: "'DM Mono', monospace",
                }}
              >
                Images, PDFs, text, CSV, JSON
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "10px",
              }}
            >
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  style={{
                    position: "relative",
                    borderRadius: "10px",
                    border: `1px solid ${theme.border}`,
                    overflow: "hidden",
                    background: theme.cardBg,
                    transition: "all 0.15s",
                  }}
                >
                  {att.type.startsWith("image/") ? (
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      onClick={() => setLightboxUrl(att.dataUrl)}
                      style={{
                        width: "100%",
                        height: "120px",
                        objectFit: "cover",
                        cursor: "pointer",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "120px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        background: theme.inputBg,
                      }}
                    >
                      <span
                        style={{
                          fontSize: "16px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          color: theme.accent,
                          background: theme.accentSoft,
                          padding: "6px 12px",
                          borderRadius: "6px",
                        }}
                      >
                        {getFileIcon(att.type)}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      padding: "6px 8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontFamily: "'DM Mono', monospace",
                        color: theme.textMuted,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {att.name}
                    </span>
                    <button
                      onClick={() => handleRemoveAttachment(idx)}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: "none",
                        background: "rgba(248,113,113,0.15)",
                        color: "#f87171",
                        fontSize: "10px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        transition: "all 0.15s",
                      }}
                    >
                      &#x00D7;
                    </button>
                  </div>
                </div>
              ))}

              {/* Add more button card */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  borderRadius: "10px",
                  border: `2px dashed ${theme.border}`,
                  minHeight: "120px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  gap: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "20px",
                    color: theme.textFaint,
                  }}
                >
                  +
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    fontFamily: "'DM Mono', monospace",
                    color: theme.textFaint,
                  }}
                >
                  Add more
                </span>
              </div>
            </div>
          )}

          {/* Task metadata */}
          <div
            style={{
              marginTop: "20px",
              padding: "14px 16px",
              background: theme.cardBg,
              border: `1px solid ${theme.border}`,
              borderRadius: "10px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                fontSize: "11px",
                fontFamily: "'DM Mono', monospace",
              }}
            >
              <div>
                <div
                  style={{
                    color: theme.textFaint,
                    marginBottom: "2px",
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                  }}
                >
                  CREATED
                </div>
                <div style={{ color: theme.textMuted }}>
                  {new Date(task.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: theme.textFaint,
                    marginBottom: "2px",
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                  }}
                >
                  UPDATED
                </div>
                <div style={{ color: theme.textMuted }}>
                  {new Date(task.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: theme.textFaint,
                    marginBottom: "2px",
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                  }}
                >
                  STATUS
                </div>
                <div style={{ color: theme.textMuted }}>
                  {task.status === "in_progress"
                    ? "In Progress"
                    : task.status === "todo"
                      ? "To Do"
                      : "Done"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: theme.textFaint,
                    marginBottom: "2px",
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                  }}
                >
                  ID
                </div>
                <div
                  style={{
                    color: theme.textFaint,
                    fontSize: "9px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {task.id.slice(0, 12)}...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxUrl && (
        <>
          <div
            onClick={() => setLightboxUrl(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.85)",
              zIndex: 10010,
              cursor: "zoom-out",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "fadeIn 0.15s ease",
            }}
          >
            <img
              src={lightboxUrl}
              alt="Full size"
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "8px",
                boxShadow: "0 0 60px rgba(0,0,0,0.5)",
              }}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(0,0,0,0.5)",
                color: "#fff",
                fontSize: "20px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &#x00D7;
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
