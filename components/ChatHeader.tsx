"use client";

import { DARK, hover } from "@/lib/theme";
import { AVAILABLE_MODELS } from "@/lib/types";
import type { Theme } from "@/lib/types";

export function ChatHeader({
  theme,
  model,
  setModel,
  toggleTheme,
  isSidebarOpen,
  setIsSidebarOpen,
  showModelPicker,
  setShowModelPicker,
  t,
}: {
  theme: Theme;
  model: string;
  setModel: (m: string) => void;
  toggleTheme: () => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (v: boolean) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  t: typeof DARK;
}) {
  return (
    <div
      style={{
        padding: "14px 20px",
        borderBottom: `1px solid ${t.border}`,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        backdropFilter: "blur(10px)",
        background: t.headerBg,
      }}
    >
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        style={{
          width: "30px",
          height: "30px",
          borderRadius: "8px",
          border: `1px solid ${t.border}`,
          background: "transparent",
          cursor: "pointer",
          color: t.textMuted,
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
          flexShrink: 0,
        }}
        {...hover({ background: t.cardHover })}
      >
        {isSidebarOpen ? "\u25C0" : "\u25B6"}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <div
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "#34d399",
            animation: "pulse 2.5s infinite",
          }}
        />
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: t.textMuted,
          }}
        >
          AI Assistant
        </span>
      </div>

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {/* Model selector */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            style={{
              fontSize: "10px",
              fontFamily: "'DM Mono', monospace",
              color: t.textMuted,
              background: t.inputBg,
              padding: "4px 10px",
              borderRadius: "6px",
              border: `1px solid ${showModelPicker ? t.accent : t.border}`,
              cursor: "pointer",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            {...hover(
              { borderColor: t.borderHover },
              { borderColor: showModelPicker ? t.accent : t.border },
            )}
          >
            &#x25C8; {model}{" "}
            <span style={{ fontSize: "8px", opacity: 0.5 }}>
              &#x25BC;
            </span>
          </button>
          {showModelPicker && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 9998 }}
                onClick={() => setShowModelPicker(false)}
              />
              <div
                style={{
                  position: "fixed",
                  top: "52px",
                  right: "52px",
                  zIndex: 9999,
                  background:
                    theme === "dark" ? "#1a1a2e" : "#fff",
                  border: `1px solid ${t.border}`,
                  borderRadius: "8px",
                  padding: "4px",
                  minWidth: "200px",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                }}
              >
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setModel(m.id);
                      setShowModelPicker(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: "none",
                      background:
                        model === m.id
                          ? t.accentSoft
                          : "transparent",
                      color:
                        model === m.id
                          ? t.filterActiveText
                          : t.text,
                      fontSize: "11px",
                      fontFamily: "'DM Mono', monospace",
                      cursor: "pointer",
                      transition: "all 0.1s",
                    }}
                    {...(model !== m.id
                      ? hover({ background: t.cardHover })
                      : {})}
                  >
                    <span>{m.label}</span>
                    <span
                      style={{
                        fontSize: "9px",
                        color: t.textMuted,
                      }}
                    >
                      {m.description}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: `1px solid ${t.border}`,
            background: "transparent",
            cursor: "pointer",
            color: t.textMuted,
            fontSize: "15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
          {...hover(
            { background: t.cardHover, borderColor: t.borderHover },
            { background: "transparent", borderColor: t.border },
          )}
        >
          {theme === "dark" ? "\u2600" : "\u263D"}
        </button>
      </div>
    </div>
  );
}
