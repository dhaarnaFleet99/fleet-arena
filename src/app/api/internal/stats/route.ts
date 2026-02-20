import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Auth check is always live; only the expensive DB + computation is cached.
export const dynamic = "force-dynamic";

const getCachedStats = unstable_cache(
  async () => {
    const supabase = createServiceClient();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalSessions },
      { count: totalTurns },
      { count: totalUsers },
      { data: rankOnes },
      { data: responses },        // all responses — needed for responseId→modelId map
      { data: profiles },
      { data: recentSessions },
      { data: allRankings },
      { data: allTurns },
      { data: refusalFlags },     // behavioral flags — accurate refusal detection
      { data: weekRankOnes },     // rank-1s in last 7 days for "best model this week"
    ] = await Promise.all([
      supabase.from("sessions").select("*", { count: "exact", head: true }),
      supabase.from("turns").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("rankings").select("response_id, rank").eq("rank", 1).limit(10000),
      supabase.from("responses").select("id, model_id").limit(10000),
      supabase.from("profiles").select("total_sessions, first_seen_at").order("total_sessions", { ascending: false }).limit(10000),
      supabase.from("sessions").select("created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("rankings").select("response_id, rank, turn_id").limit(10000),
      supabase.from("turns").select("id, turn_number").limit(10000),
      // Refusal flags from Inngest judge — accurate; finish_reason=content_filter is almost never set.
      supabase.from("behavioral_flags").select("session_id").eq("flag_type", "refusal").limit(10000),
      // Last 7 days rank-1s for "best model this week"
      supabase.from("rankings").select("response_id, rank").eq("rank", 1).gte("created_at", sevenDaysAgo).limit(2000),
    ]);

    // responseId → modelId map
    const modelMap: Record<string, string> = {};
    responses?.forEach(r => { modelMap[r.id] = r.model_id; });

    // ── Win rates (all time) ───────────────────────────────────────────────
    const wins: Record<string, number> = {};
    rankOnes?.forEach(r => {
      const mid = modelMap[r.response_id];
      if (mid) wins[mid] = (wins[mid] ?? 0) + 1;
    });
    const totalRankedTurns = rankOnes?.length ?? 1;
    const winRates = Object.entries(wins)
      .map(([model, count]) => ({ model, wins: count, pct: Math.round((count / totalRankedTurns) * 100) }))
      .sort((a, b) => b.pct - a.pct);

    // ── Best model last 7 days ─────────────────────────────────────────────
    const weekWins: Record<string, number> = {};
    weekRankOnes?.forEach(r => {
      const mid = modelMap[r.response_id];
      if (mid) weekWins[mid] = (weekWins[mid] ?? 0) + 1;
    });
    const weekTotal = weekRankOnes?.length ?? 0;
    const bestModelWeek = weekTotal === 0
      ? null
      : Object.entries(weekWins)
          .map(([model, count]) => ({ model, wins: count, pct: Math.round((count / weekTotal) * 100) }))
          .sort((a, b) => b.pct - a.pct)[0] ?? null;

    // ── Refusal rate ───────────────────────────────────────────────────────
    // Counted from behavioral_flags (flag_type='refusal') not finish_reason,
    // because models that refuse in-content still return finish_reason='stop'.
    const refusalCount = refusalFlags?.length ?? 0;
    const refusalRate = totalSessions
      ? ((refusalCount / (totalSessions as number)) * 100).toFixed(1)
      : "0.0";

    // ── User cohort analysis ───────────────────────────────────────────────
    const returningUsers = profiles?.filter(p => p.total_sessions > 1).length ?? 0;
    const firstTimeUsers = (profiles?.length ?? 0) - returningUsers;

    // ── Sessions over time (last 30 days) ─────────────────────────────────
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

    // ── Turn-wise analytics ────────────────────────────────────────────────
    const turnIdToNumber: Record<string, number> = {};
    allTurns?.forEach(t => { turnIdToNumber[t.id] = t.turn_number; });

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

    // ── Elo ratings ────────────────────────────────────────────────────────
    const elo: Record<string, number> = {};
    const K = 32;
    const expected = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

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

    return {
      totalSessions: totalSessions ?? 0,
      totalPrompts: totalTurns ?? 0,
      totalUsers: totalUsers ?? 0,
      refusalRate,
      winRates,
      bestModelWeek,
      userCohorts: { returningUsers, firstTimeUsers },
      sessionsByDay,
      turnAnalytics,
      eloRankings,
    };
  },
  ["internal-stats"],
  { revalidate: 300 } // 5-minute TTL
);

export async function GET() {
  try { await requireInternalUser(); } catch (e) { return e as Response; }

  const stats = await getCachedStats();
  return NextResponse.json(stats);
}
