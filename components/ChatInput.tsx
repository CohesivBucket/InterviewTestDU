"use client";

import { useRef, useState } from "react";
import type { ThemeTokens, Theme } from "@/lib/types";
import { hover } from "@/lib/theme";

interface PendingFile {
  name: string;
  type: string;
  dataUrl: string;
}

interface ChatInputProps {
  input: string;
  setInput: (v: string) => void;
  isLoading: boolean;
  pendingFiles: PendingFile[];
  setPendingFiles: React.Dispatch<React.SetStateAction<PendingFile[]>>;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  theme: Theme;
  t: ThemeTokens;
}

const ACCEPTED_TYPES = "image/*,application/pdf,.txt,.csv,.md,.json,.xml,.html";

function getFileIcon(type: string) {
  if (type === "application/pdf") return "PDF";
  if (type.startsWith("text/")) return "TXT";
  if (type === "application/json") return "JSON";
  if (type.includes("csv")) return "CSV";
  if (type.includes("xml") || type.includes("html")) return "XML";
  return "FILE";
}

export function ChatInput({
  input,
  setInput,
  isLoading,
  pendingFiles,
  setPendingFiles,
  onSubmit,
  onStop,
  inputRef,
  theme,
  t,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = (fileList: FileList | File[]) => {
    Array.from(fileList).forEach((file) => {
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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
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
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  const hasContent = input.trim() || pendingFiles.length > 0;

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        padding: "14px 20px 22px",
        borderTop: `1px solid ${isDragging ? t.accent : t.border}`,
        background: isDragging
          ? theme === "dark"
            ? "rgba(139,92,246,0.08)"
            : "rgba(124,58,237,0.06)"
          : t.headerBg,
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
                background: t.accentSoft,
                border: `2px dashed ${t.accent}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: t.accent,
              }}
            >
              +
            </div>
            <span style={{ fontSize: "13px", fontWeight: 600, color: t.accent }}>
              Drop files here
            </span>
            <span
              style={{
                fontSize: "11px",
                color: t.textMuted,
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
                    border: `1px solid ${t.border}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    borderRadius: "8px",
                    border: `1px solid ${t.border}`,
                    background: t.cardBg,
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
                      color: t.accent,
                    }}
                  >
                    {getFileIcon(file.type)}
                  </span>
                  <span
                    style={{
                      fontSize: "8px",
                      color: t.textMuted,
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

      <form onSubmit={onSubmit} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />

        {/* Attach button */}
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
            border: `1px solid ${t.border}`,
            background: "transparent",
            color: pendingFiles.length > 0 ? t.accent : t.textMuted,
            fontSize: "18px",
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
          {...hover(
            { background: t.cardHover, borderColor: t.borderHover },
            { background: "transparent", borderColor: t.border },
          )}
        >
          +
        </button>

        {/* Text input */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
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
            background: t.inputBg,
            border: `1px solid ${t.border}`,
            borderRadius: "12px",
            padding: "12px 16px",
            color: t.text,
            fontSize: "14px",
            fontFamily: "'Syne', sans-serif",
            transition: "all 0.2s ease",
          }}
        />

        {/* Send / Stop button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
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
            disabled={!hasContent}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              border: "none",
              flexShrink: 0,
              background: hasContent
                ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
                : t.inputBg,
              color: hasContent ? "#fff" : t.textFaint,
              fontSize: "18px",
              cursor: hasContent ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
              boxShadow: hasContent
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
          color: t.textFaint,
        }}
      >
        Cmd+K focus &middot; Enter send &middot; Stop &middot; Attach &middot;
        Drop files &middot; Edit &middot; Complete &middot; Start &middot; Delete
      </div>
    </div>
  );
}
