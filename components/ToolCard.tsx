"use client";

import { useState, useEffect, useCallback } from "react";
import type { Task } from "@/lib/types";
import {
  DARK,
  PRIORITY_COLOR,
  PRIORITY_BG,
  STATUS_COLOR,
  formatDate,
} from "@/lib/theme";

// AI SDK v6 UIMessage parts use:
//   type: "tool-<name>" | "dynamic-tool"
//   input (not args), output (not result)
//   state: "input-streaming" | "input-available" | "output-available" | "output-error"

export function ToolCard({
  part,
  t: theme,
}: {
  part: Record<string, unknown>;
  t: typeof DARK;
}) {
  const toolName =
    (part.toolName as string) ??
    (typeof part.type === "string" && (part.type as string).startsWith("tool-")
      ? (part.type as string).slice(5)
      : "unknown");

  const output = part.output as Record<string, unknown> | undefined;
  const input = part.input as Record<string, unknown> | undefined;
  const state = part.state as string;

  const isSuccess = state === "output-available" && output?.success === true;
  const isError =
    state === "output-error" ||
    (state === "output-available" && output?.success === false);
  const isLoading =
    state === "input-streaming" || state === "input-available";

  // create_task
  if (toolName === "create_task" && isSuccess && output?.task) {
    const task = output.task as Task;
    return (
      <div
        style={{
          background: theme.toolCardBg,
          borderTop: `1px solid ${theme.toolCardBorder}`,
          borderRight: `1px solid ${theme.toolCardBorder}`,
          borderBottom: `1px solid ${theme.toolCardBorder}`,
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
        {(output?.attachedImages as number) > 0 && (
          <div
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              color: "#c084fc",
              marginTop: "3px",
            }}
          >
            &#x1F4CE; {String(output.attachedImages)} image{(output.attachedImages as number) > 1 ? "s" : ""} attached
          </div>
        )}
      </div>
    );
  }

  // get_tasks
  if (toolName === "get_tasks" && isSuccess && output?.tasks) {
    const tasks = output.tasks as Task[];
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

  // update_task
  if (toolName === "update_task" && isSuccess && output?.task) {
    const task = output.task as Task;
    return (
      <div
        style={{
          background: theme.toolCardBg,
          borderTop: `1px solid ${theme.toolCardBorder}`,
          borderRight: `1px solid ${theme.toolCardBorder}`,
          borderBottom: `1px solid ${theme.toolCardBorder}`,
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

  // delete_task
  if (toolName === "delete_task" && isSuccess) {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          borderTop: `1px solid ${theme.toolCardBorder}`,
          borderRight: `1px solid ${theme.toolCardBorder}`,
          borderBottom: `1px solid ${theme.toolCardBorder}`,
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
            {String(output?.deleted ?? "")}
          </span>
        </div>
      </div>
    );
  }

  // delete_all_tasks
  if (toolName === "delete_all_tasks" && isSuccess) {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          borderTop: `1px solid ${theme.toolCardBorder}`,
          borderRight: `1px solid ${theme.toolCardBorder}`,
          borderBottom: `1px solid ${theme.toolCardBorder}`,
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
            {String(output?.deleted_count ?? 0)} tasks removed
          </span>
        </div>
      </div>
    );
  }

  // generate_image
  if (toolName === "generate_image" && isSuccess && output?.status === "ready") {
    return (
      <ImageGenCard
        prompt={String(output?.prompt ?? "")}
        theme={theme}
      />
    );
  }

  // Error fallback
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
        {String(output?.error ?? (part.errorText as string) ?? "Tool call failed")}
      </div>
    );
  }

  // Loading
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

  // Generic fallback
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
      {toolName}: {input ? JSON.stringify(input) : "done"}
    </div>
  );
}

// ─── Image generation card (fetches image client-side) ──────────────

function ImageGenCard({
  prompt,
  theme,
}: {
  prompt: string;
  theme: typeof DARK;
}) {
  const [state, setState] = useState<
    "loading" | "done" | "error"
  >("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const fetchImage = useCallback(async () => {
    try {
      setState("loading");
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate image");
        setState("error");
        return;
      }
      setImageUrl(data.imageDataUrl);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setState("error");
    }
  }, [prompt]);

  useEffect(() => {
    fetchImage();
  }, [fetchImage]);

  // Loading state
  if (state === "loading") {
    return (
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "10px",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              animation: "pulse 1.5s infinite",
            }}
          >
            &#x1F3A8;
          </span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#c084fc",
              fontWeight: 700,
            }}
          >
            GENERATING IMAGE
          </span>
        </div>
        <div
          style={{
            fontSize: "12px",
            color: theme.textMuted,
            fontStyle: "italic",
            marginBottom: "10px",
          }}
        >
          &ldquo;{prompt}&rdquo;
        </div>
        <div
          style={{
            background: `linear-gradient(135deg, rgba(168,85,247,0.08), rgba(59,130,246,0.08))`,
            borderRadius: "10px",
            height: "200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "3px solid rgba(168,85,247,0.3)",
              borderTopColor: "#a855f7",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div
        style={{
          background: "rgba(248,113,113,0.06)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "12px",
          padding: "14px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            marginBottom: "6px",
          }}
        >
          <span style={{ fontSize: "12px" }}>&#x26A0;</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#f87171",
              fontWeight: 700,
            }}
          >
            IMAGE GENERATION FAILED
          </span>
        </div>
        <div
          style={{
            fontSize: "12px",
            color: "#f87171",
            fontFamily: "monospace",
          }}
        >
          {error}
        </div>
        <button
          onClick={fetchImage}
          style={{
            marginTop: "8px",
            fontSize: "11px",
            fontFamily: "monospace",
            color: theme.accent,
            background: "none",
            border: `1px solid ${theme.accent}`,
            borderRadius: "6px",
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Success — show the image
  return (
    <>
      <div
        style={{
          background: theme.toolCardBg,
          border: `1px solid ${theme.toolCardBorder}`,
          borderRadius: "12px",
          padding: "12px",
          marginBottom: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          <span style={{ fontSize: "14px" }}>&#x1F3A8;</span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              letterSpacing: "0.1em",
              color: "#34d399",
              fontWeight: 700,
            }}
          >
            IMAGE GENERATED
          </span>
          <span
            style={{
              fontSize: "9px",
              fontFamily: "monospace",
              color: theme.textMuted,
              marginLeft: "auto",
            }}
          >
            DALL-E
          </span>
        </div>
        {imageUrl && (
          <img
            src={imageUrl}
            alt={prompt}
            onClick={() => setLightbox(true)}
            style={{
              width: "100%",
              maxWidth: "512px",
              borderRadius: "10px",
              cursor: "pointer",
              transition: "transform 0.2s",
            }}
            onMouseOver={(e) =>
              ((e.target as HTMLElement).style.transform = "scale(1.01)")
            }
            onMouseOut={(e) =>
              ((e.target as HTMLElement).style.transform = "scale(1)")
            }
          />
        )}
        <div
          style={{
            fontSize: "11px",
            color: theme.textMuted,
            fontStyle: "italic",
            marginTop: "8px",
            opacity: 0.7,
          }}
        >
          &ldquo;{prompt}&rdquo;
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && imageUrl && (
        <div
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            cursor: "zoom-out",
          }}
        >
          <img
            src={imageUrl}
            alt={prompt}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: "12px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "20px",
              right: "24px",
              color: "white",
              fontSize: "24px",
              cursor: "pointer",
              opacity: 0.7,
            }}
          >
            &#x2715;
          </div>
        </div>
      )}
    </>
  );
}
