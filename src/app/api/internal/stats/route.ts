import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Auth check is always live; only the expensive DB + computation is cached.
export const dynamic = "force-dynamic";

const getCachedStats = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const [
      { count: totalSessions },
      { count: totalTurns },
      { count: totalUsers },
      { data: rankOnes },
      { data: responses },        // all responses — needed for responseId→modelId map
      { data: profiles },
      { data: recentSessions },
      { data: allRankings },      // includes created_at for weekly breakdown
      { data: allTurns },
      { data: refusalFlags },     // behavioral flags — accurate refusal detection
    ] = await Promise.all([
      supabase.from("sessions").select("*", { count: "exact", head: true }),
      supabase.from("turns").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("rankings").select("response_id, rank").eq("rank", 1).limit(10000),
      supabase.from("responses").select("id, model_id").limit(10000),
      supabase.from("profiles").select("total_sessions, first_seen_at").order("total_sessions", { ascending: false }).limit(10000),
      supabase.from("sessions").select("created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("rankings").select("response_id, rank, turn_id, created_at").limit(10000),
      supabase.from("turns").select("id, turn_number").limit(10000),
      supabase.from("behavioral_flags").select("session_id").eq("flag_type", "refusal").limit(10000),
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

    // ── Weekly best model by normalized rank (current year) ──────────────
    function getWeekMonday(date: Date): string {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
    const yearStartDate = new Date(new Date().getFullYear(), 0, 1);
    // week → model → [normalized scores] — populated after turnIdToN is built below
    const weeklyNormMap: Record<string, Record<string, number[]>> = {};

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

    // ── Ranks by turn (for N and pairwise) ─────────────────────────────────
    const ranksByTurn: Record<string, { responseId: string; rank: number }[]> = {};
    allRankings?.forEach(rk => {
      if (!ranksByTurn[rk.turn_id]) ranksByTurn[rk.turn_id] = [];
      ranksByTurn[rk.turn_id].push({ responseId: rk.response_id, rank: rk.rank });
    });
    const turnIdToN: Record<string, number> = {};
    Object.entries(ranksByTurn).forEach(([tid, arr]) => { turnIdToN[tid] = arr.length; });

    // ── Weekly best model by normalized rank (continued) ─────────────────
    allRankings?.forEach(rk => {
      const mid = modelMap[rk.response_id];
      const N = turnIdToN[rk.turn_id];
      if (!mid || N <= 1 || !rk.created_at) return;
      if (new Date(rk.created_at) < yearStartDate) return;
      const norm = (N - rk.rank) / (N - 1);
      const weekKey = getWeekMonday(new Date(rk.created_at));
      if (!weeklyNormMap[weekKey]) weeklyNormMap[weekKey] = {};
      if (!weeklyNormMap[weekKey][mid]) weeklyNormMap[weekKey][mid] = [];
      weeklyNormMap[weekKey][mid].push(norm);
    });
    const weeklyBestModels = Object.entries(weeklyNormMap)
      .map(([weekStart, modelScores]) => {
        const modelAvgs = Object.entries(modelScores).map(([model, scores]) => ({
          model,
          avgNormalized: scores.reduce((s, v) => s + v, 0) / scores.length,
          turns: scores.length,
        }));
        const best = modelAvgs.sort((a, b) => b.avgNormalized - a.avgNormalized)[0];
        const total = modelAvgs.reduce((s, m) => s + m.turns, 0);
        return { weekStart, model: best.model, avgNormalized: +best.avgNormalized.toFixed(3), total };
      })
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    // ── Normalized rank (0 = always last, 1 = always first) ──────────────────
    // Comparable across 2-way vs 8-way: (N - rank) / (N - 1).
    const normalizedByModel: Record<string, number[]> = {};
    allRankings?.forEach(rk => {
      const mid = modelMap[rk.response_id];
      const N = turnIdToN[rk.turn_id];
      if (!mid || N <= 1) return;
      const norm = (N - rk.rank) / (N - 1);
      if (!normalizedByModel[mid]) normalizedByModel[mid] = [];
      normalizedByModel[mid].push(norm);
    });
    const normalizedRankings = Object.entries(normalizedByModel)
      .map(([model, vals]) => ({
        model,
        avgNormalized: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(3),
        turns: vals.length,
      }))
      .sort((a, b) => b.avgNormalized - a.avgNormalized);

    // ── Turn-wise analytics (raw + normalized) ──────────────────────────────
    const turnIdToNumber: Record<string, number> = {};
    allTurns?.forEach(t => { turnIdToNumber[t.id] = t.turn_number; });

    const turnModelRanks: Record<string, Record<string, { rank: number; n: number }[]>> = {};
    allRankings?.forEach(rk => {
      const mid = modelMap[rk.response_id];
      const tn = turnIdToNumber[rk.turn_id];
      const n = turnIdToN[rk.turn_id];
      if (!mid || !tn || n <= 1) return;
      const k = String(tn);
      if (!turnModelRanks[mid]) turnModelRanks[mid] = {};
      if (!turnModelRanks[mid][k]) turnModelRanks[mid][k] = [];
      turnModelRanks[mid][k].push({ rank: rk.rank, n });
    });

    const turnAnalytics = Object.entries(turnModelRanks).map(([model, byTurn]) => ({
      model,
      byTurn: Object.entries(byTurn)
        .map(([turn, entries]) => {
          const count = entries.length;
          const avgRank = entries.reduce((s, e) => s + e.rank, 0) / count;
          const avgNormalized = entries.reduce((s, e) => s + (e.n - e.rank) / (e.n - 1), 0) / count;
          return {
            turn: Number(turn),
            avgRank: +avgRank.toFixed(2),
            avgNormalizedRank: +avgNormalized.toFixed(3),
            count,
          };
        })
        .sort((a, b) => a.turn - b.turn),
    }));

    // ── Elo (one unit of weight per turn so 2-way and 8-way are comparable) ─
    const elo: Record<string, number> = {};
    const K = 32;
    const expected = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

    Object.values(ranksByTurn).forEach(turnRankings => {
      const sorted = [...turnRankings].sort((a, b) => a.rank - b.rank);
      const N = sorted.length;
      if (N < 2) return;
      const numPairs = (N * (N - 1)) / 2;
      const weight = 1 / numPairs;
      const kEff = K * weight;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const winnerId = modelMap[sorted[i].responseId];
          const loserId = modelMap[sorted[j].responseId];
          if (!winnerId || !loserId || winnerId === loserId) continue;
          if (!elo[winnerId]) elo[winnerId] = 1500;
          if (!elo[loserId]) elo[loserId] = 1500;
          const rw = elo[winnerId];
          const rl = elo[loserId];
          elo[winnerId] = Math.round(rw + kEff * (1 - expected(rw, rl)));
          elo[loserId] = Math.round(rl + kEff * (0 - expected(rl, rw)));
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
      weeklyBestModels,
      userCohorts: { returningUsers, firstTimeUsers },
      sessionsByDay,
      turnAnalytics,
      eloRankings,
      normalizedRankings,
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
