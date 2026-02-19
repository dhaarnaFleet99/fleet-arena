"use client";

import { useEffect, useState } from "react";
import type { BehavioralFlag } from "@/types";
import { MODELS } from "@/lib/models";

type Stats = {
  totalSessions: number;
  totalPrompts: number;
  refusalRate: string;
  winRates: { model: string; wins: number; pct: number }[];
};

type Tab = "overview" | "behaviors";

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [flags, setFlags] = useState<BehavioralFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [statsRes, behaviorsRes] = await Promise.all([
        fetch("/api/internal/stats"),
        fetch("/api/internal/behaviors"),
      ]);
      const statsData = await statsRes.json();
      const behaviorsData = await behaviorsRes.json();
      setStats(statsData);
      setFlags(behaviorsData.flags ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{
        height: 54, borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 24px",
        background: "var(--surface)", gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>Analytics</span>
        <span style={{
          fontSize: 10, letterSpacing: "0.5px", padding: "2px 8px",
          background: "rgba(192,132,252,0.1)", color: "var(--accent2)",
          borderRadius: 20, fontWeight: 700,
        }}>INTERNAL</span>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {/* Tabs */}
        <div style={{
          display: "flex", gap: 4, background: "var(--surface2)",
          borderRadius: 8, padding: 4, width: "fit-content", marginBottom: 24,
        }}>
          {(["overview", "behaviors"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "7px 16px", borderRadius: 6, border: "none",
              background: tab === t ? "var(--surface)" : "transparent",
              color: tab === t ? "var(--text)" : "var(--muted)",
              cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              transition: "all 0.12s", textTransform: "capitalize",
            }}>
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        ) : tab === "overview" ? (
          <OverviewTab stats={stats!} />
        ) : (
          <BehaviorsTab flags={flags} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ stats }: { stats: Stats }) {
  const cards = [
    { label: "Total Sessions", value: stats.totalSessions.toLocaleString() },
    { label: "Prompts Evaluated", value: stats.totalPrompts.toLocaleString() },
    { label: "Refusal Rate", value: `${stats.refusalRate}%` },
    { label: "Models Available", value: MODELS.length.toString() },
  ];

  return (
    <>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {cards.map((c) => (
          <div key={c.label} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "18px 20px",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--muted)", fontWeight: 600, marginBottom: 10 }}>
              {c.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Win rates */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>🏆 Win Rate by Model</div>
        {stats.winRates.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--muted)" }}>No ranked data yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.winRates.map((w) => {
              const model = MODELS.find((m) => m.id === w.model);
              const max = stats.winRates[0].pct;
              return (
                <div key={w.model} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 110, fontSize: 12, color: "var(--muted)", textAlign: "right", flexShrink: 0 }}>
                    {model?.label ?? w.model}
                  </div>
                  <div style={{
                    flex: 1, height: 8,
                    background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      width: `${(w.pct / max) * 100}%`,
                      background: model?.color ?? "#4F8EF7",
                      transition: "width 1s ease",
                    }} />
                  </div>
                  <div style={{ width: 36, fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>
                    {w.pct}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function BehaviorsTab({ flags }: { flags: BehavioralFlag[] }) {
  const typeColors: Record<string, string> = {
    refusal: "var(--danger)",
    context_loss: "var(--warn)",
    sycophancy: "var(--accent2)",
    verbosity: "var(--accent)",
    rank_reversal: "var(--success)",
  };

  return (
    <>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
        Automatically surfaced by LLM-as-judge analysis. Runs async after each session completes.
      </div>
      {flags.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", fontSize: 13 }}>
          No behavioral flags yet. They appear after sessions are analyzed.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flags.map((f) => (
            <div key={f.id} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, padding: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, letterSpacing: "0.8px", fontWeight: 700,
                  padding: "2px 8px", borderRadius: 4, textTransform: "uppercase",
                  background: (typeColors[f.flagType] ?? "#fff") + "18",
                  color: typeColors[f.flagType] ?? "var(--text)",
                }}>
                  {f.flagType.replace("_", " ")}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "capitalize",
                  color: f.severity === "high" ? "var(--danger)" : f.severity === "medium" ? "var(--warn)" : "var(--success)",
                }}>
                  {f.severity}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 4 }}>
                  {MODELS.find((m) => m.id === f.modelId)?.label ?? f.modelId}
                </span>
                <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", color: "var(--muted)" }}>
                  conf: {(f.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: "rgba(232,237,245,0.7)", marginBottom: 6, lineHeight: 1.5 }}>
                {f.description}
              </div>
              {f.evidence && (
                <div style={{
                  fontSize: 11, color: "var(--muted)", fontFamily: "monospace",
                  background: "rgba(0,0,0,0.25)", padding: "8px 10px",
                  borderRadius: 6, borderLeft: "2px solid var(--border-bright)",
                }}>
                  {JSON.stringify(f.evidence).slice(0, 200)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
