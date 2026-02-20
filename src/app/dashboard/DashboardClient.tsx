"use client";

import { useEffect, useState } from "react";
import { MODELS } from "@/lib/models";

type TurnAnalyticsEntry = {
  model: string;
  byTurn: { turn: number; avgRank: number; count: number }[];
};

type EloEntry = { model: string; rating: number };

type Stats = {
  totalSessions: number;
  totalPrompts: number;
  totalUsers: number;
  refusalRate: string;
  winRates: { model: string; wins: number; pct: number }[];
  bestModelWeek: { model: string; wins: number; pct: number } | null;
  userCohorts: { returningUsers: number; firstTimeUsers: number };
  sessionsByDay: { date: string; count: number }[];
  turnAnalytics: TurnAnalyticsEntry[];
  eloRankings: EloEntry[];
};

export default function DashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/internal/stats").then(r => r.json()).then(d => { setStats(d); setLoading(false); });
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Topbar title="Analytics" />
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {loading || !stats ? (
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
              {[
                { label: "Total Sessions", value: stats.totalSessions.toLocaleString() },
                { label: "Prompts Evaluated", value: stats.totalPrompts.toLocaleString() },
                { label: "Total Users", value: stats.totalUsers.toLocaleString() },
                { label: "Refusal Rate", value: stats.refusalRate + "%", sub: "per session, judge-detected" },
              ].map(c => (
                <div key={c.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
                  <div style={{ fontSize: 10, letterSpacing: "1px", color: "var(--muted)", fontWeight: 600, marginBottom: 10, textTransform: "uppercase" }}>{c.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-1px" }}>{c.value}</div>
                  {"sub" in c && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{c.sub}</div>}
                </div>
              ))}
            </div>

            {/* Best model this week */}
            {stats.bestModelWeek && (() => {
              const model = MODELS.find(m => m.id === stats.bestModelWeek!.model);
              return (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 10, letterSpacing: "1px", color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", flexShrink: 0 }}>Best Model This Week</span>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: model?.color ?? "#4F8EF7", flexShrink: 0, display: "inline-block" }} />
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{model?.label ?? stats.bestModelWeek.model.split("/")[1]}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{stats.bestModelWeek.wins} win{stats.bestModelWeek.wins !== 1 ? "s" : ""} · {stats.bestModelWeek.pct}% of ranked turns</span>
                </div>
              );
            })()}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {/* Win rates */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Win Rate by Model</div>
                {stats.winRates.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>No ranked data yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stats.winRates.map(w => {
                      const model = MODELS.find(m => m.id === w.model);
                      const max = stats.winRates[0].pct;
                      return (
                        <div key={w.model} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 110, fontSize: 12, color: "var(--muted)", textAlign: "right", flexShrink: 0 }}>{model?.label ?? w.model.split("/")[1]}</div>
                          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 4, width: (w.pct / max * 100) + "%", background: model?.color ?? "#4F8EF7", transition: "width 1s ease" }} />
                          </div>
                          <div style={{ width: 36, fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>{w.pct}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Elo rankings */}
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Elo Rankings</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>Pairwise Elo · K=32 · base 1500</div>
                {stats.eloRankings.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>No ranked data yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {stats.eloRankings.map((e, i) => {
                      const model = MODELS.find(m => m.id === e.model);
                      const maxR = stats.eloRankings[0].rating;
                      const minR = stats.eloRankings[stats.eloRankings.length - 1].rating;
                      const range = Math.max(maxR - minR, 1);
                      const pct = ((e.rating - minR) / range) * 100;
                      return (
                        <div key={e.model} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 20, fontSize: 10, color: "var(--muted)", fontFamily: "monospace", flexShrink: 0, textAlign: "right" }}>#{i + 1}</div>
                          <div style={{ width: 110, fontSize: 12, color: "var(--muted)", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {model?.label ?? e.model.split("/")[1]}
                          </div>
                          <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 3, width: pct + "%", background: model?.color ?? "#4F8EF7" }} />
                          </div>
                          <div style={{ width: 40, fontSize: 11, fontFamily: "monospace", color: "var(--text)", textAlign: "right", flexShrink: 0 }}>{e.rating}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* User cohorts + Sessions chart */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>User Cohorts</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "First-time users", value: stats.userCohorts.firstTimeUsers, color: "var(--accent)" },
                    { label: "Returning users", value: stats.userCohorts.returningUsers, color: "var(--success)" },
                  ].map(c => (
                    <div key={c.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{c.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {stats.sessionsByDay.length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Sessions — Last 30 Days</div>
                  <MiniBarChart data={stats.sessionsByDay} />
                </div>
              )}
            </div>

            {/* Turn-wise analytics */}
            {stats.turnAnalytics.length > 0 && (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Turn-wise Performance</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>Average rank per model by turn number — lower is better. Hover cells for sample count.</div>
                <TurnChart data={stats.turnAnalytics} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
      {data.map(d => (
        <div key={d.date} title={d.date + ": " + d.count} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
          <div style={{ width: "100%", background: "var(--accent)", borderRadius: "2px 2px 0 0", height: (d.count / max * 100) + "%", minHeight: 2, opacity: 0.7 }} />
        </div>
      ))}
    </div>
  );
}

function TurnChart({ data }: { data: TurnAnalyticsEntry[] }) {
  const allTurns = Array.from(new Set(data.flatMap(d => d.byTurn.map(t => t.turn)))).sort((a, b) => a - b);
  if (allTurns.length === 0) return null;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--muted)", fontWeight: 600, fontSize: 11 }}>Model</th>
            {allTurns.map(t => (
              <th key={t} style={{ textAlign: "center", padding: "6px 10px", color: "var(--muted)", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" }}>
                Turn {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(entry => {
            const model = MODELS.find(m => m.id === entry.model);
            return (
              <tr key={entry.model} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: model?.color ?? "#4F8EF7", flexShrink: 0, display: "inline-block" }} />
                    <span style={{ color: "var(--text)", fontWeight: 500 }}>{model?.label ?? entry.model.split("/")[1]}</span>
                  </div>
                </td>
                {allTurns.map(t => {
                  const cell = entry.byTurn.find(b => b.turn === t);
                  if (!cell) return <td key={t} style={{ textAlign: "center", padding: "8px 10px", color: "var(--muted)" }}>—</td>;
                  const hue = cell.avgRank <= 1.5 ? "52,211,153" : cell.avgRank <= 2.2 ? "251,191,36" : "239,68,68";
                  return (
                    <td key={t} style={{ textAlign: "center", padding: "8px 10px" }}>
                      <span
                        title={`n=${cell.count}`}
                        style={{
                          display: "inline-block", padding: "3px 8px", borderRadius: 6,
                          background: `rgba(${hue},0.12)`, color: `rgb(${hue})`,
                          fontFamily: "monospace", fontWeight: 700, fontSize: 12,
                        }}
                      >
                        {cell.avgRank.toFixed(1)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Topbar({ title }: { title: string }) {
  return (
    <div style={{ height: 54, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 24px", background: "var(--surface)", gap: 12, flexShrink: 0 }}>
      <span style={{ fontWeight: 800, fontSize: 14 }}>{title}</span>
      <span style={{ fontSize: 10, letterSpacing: "0.5px", padding: "2px 8px", background: "rgba(192,132,252,0.1)", color: "var(--accent2)", borderRadius: 20, fontWeight: 700 }}>INTERNAL</span>
    </div>
  );
}
