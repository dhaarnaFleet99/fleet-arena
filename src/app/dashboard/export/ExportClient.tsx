"use client";

import { useState } from "react";
import { Topbar } from "../DashboardClient";
import { Download } from "lucide-react";

const FORMATS = [
  {
    id: "preference_pairs",
    label: "JSONL — Preference Pairs",
    desc: "One JSON object per ranked turn. Format: { prompt, response_a, response_b, winner, loser, session_id, turn_number }. Compatible with standard RLHF pipelines.",
    ext: ".jsonl",
  },
  {
    id: "trajectories",
    label: "JSON — Multi-turn Trajectories",
    desc: "Full session objects with per-turn rankings and model identities revealed. Includes ranking_trajectory array showing rank changes across turns.",
    ext: ".json",
  },
  {
    id: "behavioral_flags",
    label: "CSV — Behavioral Flags",
    desc: "Flat table of all LLM-as-judge annotations: session_id, turn_id, model, flag_type, severity, confidence, description.",
    ext: ".csv",
  },
  {
    id: "user_cohorts",
    label: "CSV — User Cohorts",
    desc: "Per-user stats: first_seen, total_sessions, total_rankings, returning (bool). Useful for segmenting preference analysis.",
    ext: ".csv",
  },
];

export default function ExportClient() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/internal/export?format=${selected}`);
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: "Export failed" }));
        setError(msg ?? "Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fmt = FORMATS.find(f => f.id === selected);
      a.download = `fleet-arena-${selected}-${new Date().toISOString().slice(0, 10)}${fmt?.ext ?? ".json"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Topbar title="Export Data" />
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 24, maxWidth: 600 }}>
          Export structured data for AI lab research partners. All exports include only complete sessions with at least one ranking submitted.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680, marginBottom: 24 }}>
          {FORMATS.map(f => (
            <div
              key={f.id}
              onClick={() => setSelected(f.id)}
              style={{
                padding: "16px 18px", borderRadius: 10, cursor: "pointer",
                border: "1px solid " + (selected === f.id ? "var(--accent)" : "var(--border)"),
                background: selected === f.id ? "rgba(79,142,247,0.06)" : "var(--surface)",
                transition: "all 0.12s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", border: "1.5px solid",
                  borderColor: selected === f.id ? "var(--accent)" : "var(--muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {selected === f.id && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)" }} />
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--muted)", marginLeft: "auto" }}>{f.ext}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginLeft: 26 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleExport} disabled={!selected || loading} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "11px 22px",
          background: !selected || loading ? "rgba(79,142,247,0.2)" : "var(--accent)",
          color: !selected || loading ? "rgba(255,255,255,0.3)" : "#fff",
          border: "none", borderRadius: 8, fontWeight: 700,
          cursor: !selected || loading ? "not-allowed" : "pointer",
          fontSize: 13, fontFamily: "inherit",
        }}>
          <Download size={15} />
          {loading ? "Preparing…" : done ? "✓ Downloaded" : "Export →"}
        </button>

        {error && (
          <div style={{ marginTop: 16, fontSize: 12, color: "var(--error, #ef4444)" }}>
            Export failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
