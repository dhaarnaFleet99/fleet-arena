"use client";

import { useEffect, useState } from "react";
import { MODELS } from "@/lib/models";
import type { BehavioralFlag } from "@/types";
import { Topbar } from "../DashboardClient";

const FLAG_TYPES = ["refusal", "context_loss", "sycophancy", "verbosity", "rank_reversal"] as const;
type FlagType = typeof FLAG_TYPES[number];

const TYPE_META: Record<FlagType, { label: string; color: string; desc: string }> = {
  refusal:       { label: "Refusal",       color: "239,68,68",   desc: "Model refused or heavily hedged a reasonable request" },
  context_loss:  { label: "Context Loss",  color: "251,191,36",  desc: "Model ranked high early, dropped later — likely lost context" },
  sycophancy:    { label: "Sycophancy",    color: "192,132,252", desc: "Model changed position without new evidence when challenged" },
  verbosity:     { label: "Verbosity",     color: "96,165,250",  desc: "Model was 2×+ longer than peers and ranked lower" },
  rank_reversal: { label: "Rank Reversal", color: "52,211,153",  desc: "Model ranked #1 in one turn then last in the next" },
};

type FlagMatrixRow = {
  model: string;
  refusal: number;
  context_loss: number;
  sycophancy: number;
  verbosity: number;
  rank_reversal: number;
  total: number;
};

type DriftRow = {
  model: string;
  drops: number;
  rises: number;
  avgDelta: number;
  count: number;
};

type BehaviorData = {
  flags: (BehavioralFlag & { createdAt?: string })[];
  modelFlagMatrix: FlagMatrixRow[];
  rankDriftSummary: DriftRow[];
  severityBreakdown: { high: number; medium: number; low: number };
  flagTypeTotals: { type: FlagType; count: number }[];
  totalFlags: number;
};

export default function BehaviorsClient() {
  const [data, setData] = useState<BehaviorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/internal/behaviors")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading || !data) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar title="Behavioral Analysis" />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
          Loading…
        </div>
      </div>
    );
  }

  const { flags, modelFlagMatrix, rankDriftSummary, severityBreakdown, flagTypeTotals } = data;
  const filtered = filter === "all" ? flags : flags.filter(f => f.flagType === filter);
  const topFlagType = flagTypeTotals?.[0];
  const mostFlaggedModel = modelFlagMatrix?.[0];
  const totalRankShifts = rankDriftSummary?.reduce((s, r) => s + r.count, 0) ?? 0;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Topbar title="Behavioral Analysis" />
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
          LLM-as-judge analysis run after each completed session. Flags are detected automatically using Claude as an evaluator.
        </div>

        {/* ── Summary stat cards ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Flags", value: flags.length.toString(), sub: `${severityBreakdown.high} high severity` },
            {
              label: "Most Common",
              value: topFlagType && topFlagType.count > 0 ? TYPE_META[topFlagType.type].label : "—",
              sub: topFlagType && topFlagType.count > 0 ? `${topFlagType.count} instances` : "No data yet",
            },
            {
              label: "Most Flagged Model",
              value: mostFlaggedModel ? (MODELS.find(m => m.id === mostFlaggedModel.model)?.label ?? mostFlaggedModel.model.split("/")[1]) : "—",
              sub: mostFlaggedModel ? `${mostFlaggedModel.total} total flags` : "No data yet",
            },
            { label: "Rank Shifts Tracked", value: totalRankShifts.toString(), sub: "cross-turn rank changes" },
          ].map(c => (
            <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
              <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--muted)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 4 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Flag type overview + severity ────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Behavior Type Breakdown</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Count of each detected behavior across all sessions</div>
            {!flagTypeTotals || flagTypeTotals.every(t => t.count === 0) ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>No flags yet. Complete sessions to trigger analysis.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {flagTypeTotals.map(({ type, count }) => {
                  const meta = TYPE_META[type];
                  const max = flagTypeTotals[0].count || 1;
                  return (
                    <div key={type}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 11, color: `rgb(${meta.color})`, fontWeight: 600 }}>{meta.label}</span>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                        <div style={{ height: "100%", borderRadius: 3, width: (count / max * 100) + "%", background: `rgb(${meta.color})`, opacity: 0.7, transition: "width 0.8s ease" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>{meta.desc}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>Severity Distribution</div>
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              {(["high", "medium", "low"] as const).map(s => {
                const colors = { high: "239,68,68", medium: "251,191,36", low: "52,211,153" };
                return (
                  <div key={s} style={{ flex: 1, textAlign: "center", padding: "16px 10px", background: `rgba(${colors[s]},0.06)`, borderRadius: 10, border: `1px solid rgba(${colors[s]},0.2)` }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: `rgb(${colors[s]})` }}>{severityBreakdown[s]}</div>
                    <div style={{ fontSize: 10, color: `rgb(${colors[s]})`, fontWeight: 600, textTransform: "capitalize", marginTop: 5 }}>{s}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
              <strong style={{ color: "rgb(239,68,68)" }}>High</strong> severity flags indicate consistent, clear-cut patterns.{" "}
              <strong style={{ color: "rgb(251,191,36)" }}>Medium</strong> are likely but need more data.{" "}
              <strong style={{ color: "rgb(52,211,153)" }}>Low</strong> are possible signals requiring verification.
            </div>
          </div>
        </div>

        {/* ── Model behavior matrix ────────────────────────────────────────── */}
        {modelFlagMatrix && modelFlagMatrix.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Model Behavior Matrix</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Flag counts per model by behavior type. Darker cells = more frequent. Useful for identifying models with systematic weaknesses.</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Model</th>
                    {FLAG_TYPES.map(t => (
                      <th key={t} style={{ textAlign: "center", padding: "6px 12px", color: `rgb(${TYPE_META[t].color})`, fontWeight: 700, fontSize: 10, letterSpacing: "0.5px", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                        {TYPE_META[t].label}
                      </th>
                    ))}
                    <th style={{ textAlign: "center", padding: "6px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {modelFlagMatrix.map(row => {
                    const model = MODELS.find(m => m.id === row.model);
                    const maxInRow = Math.max(row.refusal, row.context_loss, row.sycophancy, row.verbosity, row.rank_reversal, 1);
                    return (
                      <tr key={row.model} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: model?.color ?? "#666", display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{model?.label ?? row.model.split("/")[1]}</span>
                          </div>
                        </td>
                        {FLAG_TYPES.map(t => {
                          const count = row[t as keyof FlagMatrixRow] as number;
                          const intensity = count === 0 ? 0 : Math.max(0.08, Math.min(0.65, (count / maxInRow) * 0.65));
                          const col = TYPE_META[t].color;
                          return (
                            <td key={t} style={{ textAlign: "center", padding: "10px 12px" }}>
                              <span style={{
                                display: "inline-block", minWidth: 28, padding: "3px 8px", borderRadius: 6,
                                background: count > 0 ? `rgba(${col},${intensity})` : "transparent",
                                color: count > 0 ? `rgb(${col})` : "var(--muted)",
                                fontFamily: "monospace", fontWeight: count > 0 ? 700 : 400, fontSize: 12,
                              }}>
                                {count === 0 ? "—" : count}
                              </span>
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center", padding: "10px 12px" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>{row.total}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Rank drift analysis ──────────────────────────────────────────── */}
        {rankDriftSummary && rankDriftSummary.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Rank Drift — Why Users Change Their Preference</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
              Tracks when a model's rank worsens (drop) or improves (rise) between consecutive turns in the same session.
              Drops often signal context loss, refusal, or verbosity. Rises suggest the model improves as context accumulates.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Model</th>
                    <th style={{ textAlign: "center", padding: "6px 12px", color: "rgb(239,68,68)", fontWeight: 700, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Drops</th>
                    <th style={{ textAlign: "center", padding: "6px 12px", color: "rgb(52,211,153)", fontWeight: 700, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Rises</th>
                    <th style={{ textAlign: "center", padding: "6px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Avg Rank Δ</th>
                    <th style={{ textAlign: "center", padding: "6px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--border)" }}>Stability</th>
                  </tr>
                </thead>
                <tbody>
                  {rankDriftSummary.map(row => {
                    const model = MODELS.find(m => m.id === row.model);
                    const dropRate = row.count > 0 ? Math.round((row.drops / row.count) * 100) : 0;
                    const stability = dropRate <= 25
                      ? { label: "Stable", color: "52,211,153" }
                      : dropRate <= 50
                      ? { label: "Moderate", color: "251,191,36" }
                      : { label: "Volatile", color: "239,68,68" };
                    return (
                      <tr key={row.model} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: model?.color ?? "#666", display: "inline-block", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{model?.label ?? row.model.split("/")[1]}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 12px" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: row.drops > 0 ? "rgb(239,68,68)" : "var(--muted)", fontFamily: "monospace" }}>
                            {row.drops > 0 ? "↓ " : ""}{row.drops}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 12px" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: row.rises > 0 ? "rgb(52,211,153)" : "var(--muted)", fontFamily: "monospace" }}>
                            {row.rises > 0 ? "↑ " : ""}{row.rises}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 12px" }}>
                          <span style={{
                            fontSize: 12, fontFamily: "monospace", fontWeight: 700,
                            color: row.avgDelta > 0.1 ? "rgb(239,68,68)" : row.avgDelta < -0.1 ? "rgb(52,211,153)" : "var(--muted)",
                          }}>
                            {row.avgDelta > 0 ? "+" : ""}{row.avgDelta}
                          </span>
                        </td>
                        <td style={{ textAlign: "center", padding: "10px 12px" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
                            background: `rgba(${stability.color},0.1)`, color: `rgb(${stability.color})`,
                            textTransform: "uppercase", letterSpacing: "0.5px",
                          }}>
                            {stability.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
              <strong style={{ color: "rgb(239,68,68)" }}>Drop</strong> = ranked worse in turn N+1 vs turn N in the same session.&nbsp;
              <strong style={{ color: "rgb(251,191,36)" }}>Avg Δ &gt; 0</strong> = net drift downward.&nbsp;
              <strong style={{ color: "rgb(52,211,153)" }}>Stable</strong> = drops in ≤25% of observed turns.
            </div>
          </div>
        )}

        {/* ── Flag feed ────────────────────────────────────────────────────── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Flag Feed</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => setFilter("all")} style={chipStyle(filter === "all", "255,255,255")}>
              All ({flags.length})
            </button>
            {FLAG_TYPES.map(t => {
              const count = flags.filter(f => f.flagType === t).length;
              return (
                <button key={t} onClick={() => setFilter(t)} style={chipStyle(filter === t, TYPE_META[t].color)}>
                  {TYPE_META[t].label} ({count})
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--muted)", fontSize: 13 }}>
              {flags.length === 0
                ? "No flags yet. Complete sessions and click End Session to trigger LLM analysis."
                : "No flags matching this filter."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(f => {
                const model = MODELS.find(m => m.id === f.modelId);
                const meta = TYPE_META[f.flagType as FlagType];
                const col = meta?.color ?? "255,255,255";
                return (
                  <div key={f.id} style={{
                    background: "rgba(0,0,0,0.15)",
                    border: "1px solid var(--border)",
                    borderLeft: `3px solid rgba(${col},0.5)`,
                    borderRadius: 8, padding: "14px 16px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{
                        fontSize: 10, letterSpacing: "0.8px", fontWeight: 700,
                        padding: "2px 8px", borderRadius: 4,
                        background: `rgba(${col},0.12)`,
                        color: `rgb(${col})`,
                      }}>
                        {meta?.label ?? f.flagType}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: "capitalize",
                        color: f.severity === "high" ? "rgb(239,68,68)" : f.severity === "medium" ? "rgb(251,191,36)" : "rgb(52,211,153)",
                      }}>
                        {f.severity}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: model?.color ?? "var(--text)" }}>
                        {model?.label ?? f.modelId.split("/")[1]}
                      </span>
                      <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace", color: "var(--muted)" }}>
                        {Math.round(f.confidence * 100)}% conf
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(232,237,245,0.8)", marginBottom: f.evidence && Object.keys(f.evidence).length > 0 ? 8 : 0, lineHeight: 1.6 }}>
                      {f.description}
                    </div>
                    {f.evidence && Object.keys(f.evidence).length > 0 && (
                      <div style={{
                        fontSize: 11, color: "var(--muted)", fontFamily: "monospace",
                        background: "rgba(0,0,0,0.25)", padding: "8px 10px",
                        borderRadius: 6, lineHeight: 1.5,
                      }}>
                        {(f.evidence as { detail?: string }).detail ?? JSON.stringify(f.evidence).slice(0, 300)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
  border: `1px solid rgba(${color},${active ? 0.4 : 0.15})`,
  background: active ? `rgba(${color},0.1)` : "transparent",
  color: active ? `rgb(${color})` : "var(--muted)",
  cursor: "pointer", fontFamily: "inherit",
  transition: "all 0.12s",
});
