"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UIMessage } from "ai";
import type { ThemeTokens } from "@/lib/types";
import { formatTime } from "@/lib/theme";
import { ToolCard } from "./ToolCard";

function getFileIcon(type: string) {
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("text/")) return "TXT";
  if (type === "application/json") return "JSON";
  if (type.includes("csv")) return "CSV";
  if (type.includes("xml") || type.includes("html")) return "XML";
  return "FILE";
}

interface MessageBubbleProps {
  msg: UIMessage;
  timestamp: Date;
  t: ThemeTokens;
}

export function MessageBubble({ msg, timestamp, t }: MessageBubbleProps) {
  const isUser = msg.role === "user";

  return (
    <div
      className="msg-enter"
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        gap: "10px",
        marginBottom: "16px",
        alignItems: "flex-end",
      }}
    >
      {/* AI avatar */}
      {!isUser && (
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "9px",
            background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
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
                    background: isUser ? t.userMsg : t.msgBg,
                    color: isUser ? "#fff" : t.text,
                    border: isUser ? "none" : `1px solid ${t.border}`,
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
                    <span style={{ whiteSpace: "pre-wrap" }}>{part.text}</span>
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
                    justifyContent: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <img
                    src={filePart.url}
                    alt="attachment"
                    style={{
                      maxWidth: "200px",
                      maxHeight: "150px",
                      borderRadius: "10px",
                      border: `1px solid ${t.border}`,
                      objectFit: "cover",
                    }}
                  />
                </div>
              );
            }
            return (
              <div
                key={idx}
                style={{
                  marginBottom: "6px",
                  background: t.toolCardBg,
                  border: `1px solid ${t.toolCardBorder}`,
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
                    color: t.accent,
                    background: t.accentSoft,
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  {getFileIcon(filePart.mediaType)}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: t.textMuted,
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
                t={t}
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
            color: t.textFaint,
            marginTop: "4px",
            textAlign: isUser ? "right" : "left",
            paddingInline: "4px",
          }}
        >
          {formatTime(timestamp)}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "9px",
            background: t.userAvatar,
            border: "1px solid rgba(139,92,246,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            flexShrink: 0,
            color: t.accent,
            fontWeight: 700,
          }}
        >
          U
        </div>
      )}
    </div>
  );
}
