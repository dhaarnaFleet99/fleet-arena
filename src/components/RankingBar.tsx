"use client";

import { useState, useEffect } from "react";
import type { Turn } from "@/types";

export default function RankingBar({
  turn, onSubmit, onSkip,
}: {
  turn: Turn;
  onSubmit: (rankings: Record<string, number>) => void;
  onSkip: () => void;
}) {
  // Draft is keyed by slotLabel ("A"/"B"/"C") — always set, never collides on empty id
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);

  const allStreamingDone = turn.responses.every(r => !r.streaming);
  // All non-streaming responses are rankable — no r.id dependency
  const rankableResponses = turn.responses.filter(r => !r.streaming);

  // Auto-expand once streaming finishes
  useEffect(() => {
    if (allStreamingDone && rankableResponses.length > 0 && !turn.rankingSubmitted && !turn.rankingSkipped) {
      setExpanded(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStreamingDone, turn.rankingSubmitted, turn.rankingSkipped]);

  // Already ranked — show result
  if (turn.rankingSubmitted) {
    const ordered = Object.entries(turn.rankings)
      .sort(([, a], [, b]) => a - b)
      .map(([key]) => {
        const r = turn.responses.find(t => t.slotLabel === key) ?? turn.responses.find(t => t.id === key);
        return r?.model?.label ?? r?.slotLabel ?? key;
      })
      .filter(Boolean);

    return (
      <div style={{
        padding: "10px 16px", background: "rgba(52,211,153,0.06)",
        border: "1px solid rgba(52,211,153,0.18)", borderRadius: 10,
        fontSize: 12, color: "var(--success)", display: "flex", alignItems: "center", gap: 8,
      }}>
        ✓ Ranked — models revealed
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>
          {ordered.join(" › ")}
        </span>
      </div>
    );
  }

  // Skipped
  if (turn.rankingSkipped) {
    return (
      <div style={{
        padding: "10px 16px", background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border)", borderRadius: 10,
        fontSize: 12, color: "var(--muted)",
      }}>
        Ranking skipped for this turn.
      </div>
    );
  }

  // Still streaming
  if (!allStreamingDone) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 2px" }}>
        Waiting for all responses…
      </div>
    );
  }

  if (rankableResponses.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "var(--muted)", padding: "10px 2px" }}>
        No responses to rank.
      </div>
    );
  }

  const n = rankableResponses.length;
  const allRanked = Object.keys(draft).length === n;

  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
      {!expanded ? (
        <div onClick={() => setExpanded(true)} style={{
          padding: "10px 16px", display: "flex", alignItems: "center",
          cursor: "pointer", fontSize: 13, gap: 10,
        }}>
          <span style={{ color: "var(--muted)" }}>Which response was best?</span>
          <span style={{
            fontSize: 10, color: "var(--accent)", marginLeft: "auto",
            fontWeight: 600, letterSpacing: "0.5px",
          }}>
            RANK ↓
          </span>
        </div>
      ) : (
        <div style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            Rank responses — best to worst
            <span style={{ fontWeight: 400, color: "var(--muted)" }}>(1 = best)</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            {rankableResponses.map(r => {
              const rank = draft[r.slotLabel];
              return (
                <div key={r.slotLabel} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Slot label */}
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800, color: "var(--muted)", flexShrink: 0,
                  }}>
                    {r.slotLabel}
                  </div>
                  {/* Preview */}
                  <div style={{ flex: 1, fontSize: 11, color: "var(--muted)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {r.content.replace(/\n/g, " ").slice(0, 70)}…
                  </div>
                  {/* Rank buttons */}
                  <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    {Array.from({ length: n }, (_, i) => i + 1).map(pos => {
                      const active = rank === pos;
                      return (
                        <button key={pos} onClick={() => {
                          const newDraft = { ...draft };
                          // Remove this rank from any other slot
                          const prev = Object.entries(newDraft).find(([slot, v]) => v === pos && slot !== r.slotLabel);
                          if (prev) delete newDraft[prev[0]];
                          newDraft[r.slotLabel] = pos;
                          setDraft(newDraft);
                        }} style={{
                          width: 28, height: 28, borderRadius: "50%",
                          border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
                          background: active ? "var(--accent)" : "transparent",
                          color: active ? "#fff" : "var(--muted)",
                          cursor: "pointer", fontSize: 12, fontWeight: 700,
                          fontFamily: "inherit", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          transition: "all 0.12s",
                        }}>
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setExpanded(false)} style={{
              padding: "7px 14px", background: "transparent",
              border: "1px solid var(--border)", borderRadius: 8,
              color: "var(--muted)", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            }}>
              Collapse
            </button>
            <button onClick={() => allRanked && onSubmit(draft)} disabled={!allRanked} style={{
              padding: "7px 18px",
              background: allRanked ? "var(--accent)" : "rgba(79,142,247,0.2)",
              color: allRanked ? "#fff" : "rgba(255,255,255,0.3)",
              border: "none", borderRadius: 8,
              cursor: allRanked ? "pointer" : "not-allowed",
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            }}>
              Submit & Reveal →
            </button>
            <button onClick={onSkip} style={{
              marginLeft: "auto", padding: "7px 14px", background: "transparent",
              border: "none", color: "var(--muted)", cursor: "pointer",
              fontSize: 11, fontFamily: "inherit", textDecoration: "underline",
            }}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
