import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireInternalUser(); } catch (e) { return e as Response; }

  const supabase = createServiceClient();

  const [
    { count: totalSessions },
    { count: totalTurns },
    { count: refusals },
    { count: totalUsers },
    { data: rankOnes },
    { data: responses },
    { data: profiles },
    { data: recentSessions },
    { data: allRankings },
    { data: allTurns },
  ] = await Promise.all([
    supabase.from("sessions").select("*", { count: "exact", head: true }),
    supabase.from("turns").select("*", { count: "exact", head: true }),
    supabase.from("responses").select("*", { count: "exact", head: true }).eq("finish_reason", "content_filter"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("rankings").select("response_id, rank").eq("rank", 1),
    supabase.from("responses").select("id, model_id"),
    supabase.from("profiles").select("total_sessions, total_rankings, first_seen_at").order("total_sessions", { ascending: false }).limit(100),
    supabase.from("sessions").select("created_at, user_id").order("created_at", { ascending: false }).limit(200),
    supabase.from("rankings").select("response_id, rank, turn_id"),
    supabase.from("turns").select("id, turn_number"),
  ]);

  // responseId → modelId map
  const modelMap: Record<string, string> = {};
  responses?.forEach(r => { modelMap[r.id] = r.model_id; });

  // ── Win rates ───────────────────────────────────────────────────────────────
  const wins: Record<string, number> = {};
  rankOnes?.forEach(r => {
    const mid = modelMap[r.response_id];
    if (mid) wins[mid] = (wins[mid] ?? 0) + 1;
  });
  const totalRanked = rankOnes?.length ?? 1;
  const winRates = Object.entries(wins)
    .map(([model, count]) => ({ model, wins: count, pct: Math.round((count / totalRanked) * 100) }))
    .sort((a, b) => b.pct - a.pct);

  // ── User cohort analysis ────────────────────────────────────────────────────
  const returningUsers = profiles?.filter(p => p.total_sessions > 1).length ?? 0;
  const firstTimeUsers = (profiles?.length ?? 0) - returningUsers;
  const avgRankingsPerUser = profiles?.length
    ? (profiles.reduce((s, p) => s + (p.total_rankings ?? 0), 0) / profiles.length).toFixed(1)
    : "0";

  // ── Sessions over time (last 30 days) ──────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dailyCounts: Record<string, number> = {};
  recentSessions?.forEach(s => {
    const day = new Date(s.created_at).toISOString().slice(0, 10);
    if (new Date(s.created_at) >= thirtyDaysAgo) {
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
    }
  });
  const sessionsByDay = Object.entries(dailyCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // ── Turn-wise analytics ─────────────────────────────────────────────────────
  // For each model, collect average rank per turn number
  const turnIdToNumber: Record<string, number> = {};
  allTurns?.forEach(t => { turnIdToNumber[t.id] = t.turn_number; });

  // modelId → turnNumber → ranks[]
  const turnModelRanks: Record<string, Record<string, number[]>> = {};
  allRankings?.forEach(rk => {
    const mid = modelMap[rk.response_id];
    const tn = turnIdToNumber[rk.turn_id];
    if (!mid || !tn) return;
    const k = String(tn);
    if (!turnModelRanks[mid]) turnModelRanks[mid] = {};
    if (!turnModelRanks[mid][k]) turnModelRanks[mid][k] = [];
    turnModelRanks[mid][k].push(rk.rank);
  });

  const turnAnalytics = Object.entries(turnModelRanks).map(([model, byTurn]) => ({
    model,
    byTurn: Object.entries(byTurn)
      .map(([turn, ranks]) => ({
        turn: Number(turn),
        avgRank: +(ranks.reduce((s, r) => s + r, 0) / ranks.length).toFixed(2),
        count: ranks.length,
      }))
      .sort((a, b) => a.turn - b.turn),
  }));

  // ── Elo ratings ─────────────────────────────────────────────────────────────
  const elo: Record<string, number> = {};
  const K = 32;
  const expected = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

  // Group rankings by turn_id for pairwise comparison
  const ranksByTurn: Record<string, { responseId: string; rank: number }[]> = {};
  allRankings?.forEach(rk => {
    if (!ranksByTurn[rk.turn_id]) ranksByTurn[rk.turn_id] = [];
    ranksByTurn[rk.turn_id].push({ responseId: rk.response_id, rank: rk.rank });
  });

  Object.values(ranksByTurn).forEach(turnRankings => {
    const sorted = [...turnRankings].sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const winnerId = modelMap[sorted[i].responseId];
        const loserId = modelMap[sorted[j].responseId];
        if (!winnerId || !loserId || winnerId === loserId) continue;
        if (!elo[winnerId]) elo[winnerId] = 1500;
        if (!elo[loserId]) elo[loserId] = 1500;
        const rw = elo[winnerId];
        const rl = elo[loserId];
        elo[winnerId] = Math.round(rw + K * (1 - expected(rw, rl)));
        elo[loserId] = Math.round(rl + K * (0 - expected(rl, rw)));
      }
    }
  });

  const eloRankings = Object.entries(elo)
    .map(([model, rating]) => ({ model, rating }))
    .sort((a, b) => b.rating - a.rating);

  return NextResponse.json({
    totalSessions: totalSessions ?? 0,
    totalPrompts: totalTurns ?? 0,
    totalUsers: totalUsers ?? 0,
    refusalRate: totalTurns ? ((refusals ?? 0) / ((totalTurns ?? 1) * 3) * 100).toFixed(1) : "0.0",
    winRates,
    userCohorts: { returningUsers, firstTimeUsers, avgRankingsPerUser },
    sessionsByDay,
    turnAnalytics,
    eloRankings,
  });
}
