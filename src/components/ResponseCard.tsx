"use client";

import type { ResponseCard } from "@/types";
import { AlertCircle } from "lucide-react";

export default function ResponseCardComponent({ response }: { response: ResponseCard }) {
  const isRefusal = response.finishReason === "content_filter";

  return (
    <div
      className="fade-up"
      style={{
        background: "var(--surface)",
        border: `1px solid ${response.model ? response.model.color + "35" : "var(--border)"}`,
        borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
        minHeight: 200,
      }}
    >
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {response.model ? (
          <>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: response.model.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{response.model.label}</span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{response.model.provider}</span>
            {response.latencyMs && (
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>
                {(response.latencyMs / 1000).toFixed(1)}s
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{
              width: 22, height: 22, borderRadius: 6,
              background: "var(--surface2)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, color: "var(--muted)",
            }}>
              {response.slotLabel}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Model {response.slotLabel}</span>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{
        padding: "14px 16px", fontSize: 13, lineHeight: 1.7,
        color: "rgba(232,237,245,0.82)", flex: 1,
        fontFamily: "'JetBrains Mono', monospace",
        whiteSpace: "pre-wrap", overflowY: "auto", maxHeight: 340,
      }}>
        {isRefusal ? (
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--danger)" }}>
            <AlertCircle size={13} /> Refused to respond
          </span>
        ) : (
          <>
            {response.content}
            {response.streaming && <span className="typing-cursor" />}
          </>
        )}
      </div>
    </div>
  );
}
