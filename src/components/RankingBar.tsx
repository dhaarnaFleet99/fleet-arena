"use client";

import { useState } from "react";
import type { Turn } from "@/types";

export default function RankingBar({
  turn,
  onSubmit,
}: {
  turn: Turn;
  onSubmit: (rankings: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);

  if (turn.rankingSubmitted) {
    return (
      <div style={{
        padding: "10px 14px", background: "rgba(52,211,153,0.06)",
        border: "1px solid rgba(52,211,153,0.18)", borderRadius: 10,
        fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 8,
      }}>
        ✓ Rankings saved — models revealed
        <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>
          {Object.entries(turn.rankings)
            .sort(([, a], [, b]) => a - b)
            .map(([id]) => {
              const r = turn.responses.find((x) => x.id === id);
              return r?.model?.label ?? r?.slotLabel;
            }).join(" › ")}
        </span>
      </div>
    );
  }

  const n = turn.responses.length;
  const allRanked = Object.keys(draft).length === n;
  const responses = turn.responses.filter((r) => !r.streaming && r.id);

  if (responses.length < n) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 2px" }}>
        Waiting for all responses to finish…
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 10, border: "1px solid var(--border)",
      background: "var(--surface)", overflow: "hidden",
    }}>
      {/* Collapsed pill */}
      {!expanded ? (
        <div
          onClick={() => setExpanded(true)}
          style={{
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer", fontSize: 13,
          }}
        >
          <span style={{ color: "var(--muted)" }}>Rank these responses</span>
          <span style={{ fontSize: 10, color: "var(--accent)", marginLeft: "auto", fontWeight: 600 }}>
            optional ↓
          </span>
        </div>
      ) : (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
            Rank responses — best to worst
            <span style={{ fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>
              (required to continue)
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {responses.map((r) => {
              const rank = draft[r.id];
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "var(--muted)", flexShrink: 0,
                  }}>
                    {r.slotLabel}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: "var(--muted)" }}>
                    {r.content.slice(0, 60).replace(/\n/g, " ")}…
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {Array.from({ length: n }, (_, i) => i + 1).map((pos) => {
                      const taken = Object.entries(draft).find(([id, r]) => r === pos && id !== r)?.[0];
                      const active = rank === pos;
                      return (
                        <button
                          key={pos}
                          onClick={() => {
                            // If this rank is taken by another, swap
                            const newDraft = { ...draft };
                            const prev = Object.entries(newDraft).find(([, v]) => v === pos);
                            if (prev) delete newDraft[prev[0]];
                            newDraft[r.id] = pos;
                            setDraft(newDraft);
                          }}
                          style={{
                            width: 26, height: 26, borderRadius: "50%",
                            border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                            background: active ? "var(--accent)" : "transparent",
                            color: active ? "#fff" : "var(--muted)",
                            cursor: "pointer", fontSize: 12, fontWeight: 700,
                            fontFamily: "inherit", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            transition: "all 0.12s",
                          }}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button
              onClick={() => { setExpanded(false); }}
              style={{
                padding: "8px 14px", background: "transparent",
                border: "1px solid var(--border)", borderRadius: 8,
                color: "var(--muted)", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}
            >
              Collapse
            </button>
            <button
              onClick={() => allRanked && onSubmit(draft)}
              disabled={!allRanked}
              style={{
                padding: "8px 18px",
                background: allRanked ? "var(--accent)" : "rgba(79,142,247,0.2)",
                color: allRanked ? "#fff" : "rgba(255,255,255,0.3)",
                border: "none", borderRadius: 8,
                cursor: allRanked ? "pointer" : "not-allowed",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
              }}
            >
              Submit & Reveal →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
