"use client";

import { DARK, SUGGESTIONS } from "@/lib/theme";

export function EmptyState({
  t,
  started,
  messagesEmpty,
  onSuggestionClick,
}: {
  t: typeof DARK;
  started: boolean;
  messagesEmpty: boolean;
  onSuggestionClick: (text: string) => void;
}) {
  if (!messagesEmpty) return null;

  return (
    <>
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
            color: t.text,
            marginBottom: "8px",
            letterSpacing: "-0.02em",
          }}
        >
          What can I help with?
        </h2>
        <p
          style={{
            fontSize: "13px",
            color: t.textMuted,
            maxWidth: "260px",
            lineHeight: 1.7,
            fontFamily: "'DM Mono', monospace",
          }}
        >
          Manage tasks through natural conversation.
        </p>
      </div>

      {!started && (
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
              onClick={() => onSuggestionClick(s)}
              style={{
                background: t.suggestionBg,
                border: `1px solid ${t.suggestionBorder}`,
                borderRadius: "20px",
                padding: "7px 14px",
                fontSize: "12px",
                color: t.textMuted,
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
    </>
  );
}
