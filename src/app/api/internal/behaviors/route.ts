import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FLAG_TYPES = ["refusal", "context_loss", "sycophancy", "verbosity", "rank_reversal"] as const;

export async function GET() {
  try {
    await requireInternalUser();
  } catch (e) {
    return e as Response;
  }

  const supabase = createServiceClient();

  const [
    { data: rawFlags },
    { data: allRankings },
    { data: allTurns },
    { data: allResponses },
  ] = await Promise.all([
    supabase.from("behavioral_flags").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("rankings").select("response_id, rank, turn_id"),
    supabase.from("turns").select("id, turn_number, session_id"),
    supabase.from("responses").select("id, model_id, token_count"),
  ]);

  // Transform flags snake_case → camelCase
  const flags = (rawFlags ?? []).map(f => ({
    id: f.id,
    sessionId: f.session_id,
    turnId: f.turn_id ?? undefined,
    modelId: f.model_id,
    flagType: f.flag_type,
    severity: f.severity,
    description: f.description,
    evidence: f.evidence ?? {},
    confidence: f.confidence ?? 0,
    createdAt: f.created_at,
  }));

  // ── Per-model flag type matrix ────────────────────────────────────────────
  const flagMatrix: Record<string, Record<string, number>> = {};
  (rawFlags ?? []).forEach(f => {
    if (!flagMatrix[f.model_id]) flagMatrix[f.model_id] = {};
    flagMatrix[f.model_id][f.flag_type] = (flagMatrix[f.model_id][f.flag_type] ?? 0) + 1;
  });

  const modelFlagMatrix = Object.entries(flagMatrix).map(([model, counts]) => ({
    model,
    refusal: counts.refusal ?? 0,
    context_loss: counts.context_loss ?? 0,
    sycophancy: counts.sycophancy ?? 0,
    verbosity: counts.verbosity ?? 0,
    rank_reversal: counts.rank_reversal ?? 0,
    total: Object.values(counts).reduce((s, c) => s + c, 0),
  })).sort((a, b) => b.total - a.total);

  // ── Rank drift analysis ───────────────────────────────────────────────────
  const responseModelMap: Record<string, string> = {};
  allResponses?.forEach(r => { responseModelMap[r.id] = r.model_id; });

  const turnNumberMap: Record<string, number> = {};
  const turnSessionMap: Record<string, string> = {};
  allTurns?.forEach(t => {
    turnNumberMap[t.id] = t.turn_number;
    turnSessionMap[t.id] = t.session_id;
  });

  // session → turnNumber → model → rank
  const sessionGrid: Record<string, Record<number, Record<string, number>>> = {};
  allRankings?.forEach(rk => {
    const model = responseModelMap[rk.response_id];
    const turnNum = turnNumberMap[rk.turn_id];
    const sessionId = turnSessionMap[rk.turn_id];
    if (!model || !turnNum || !sessionId) return;
    if (!sessionGrid[sessionId]) sessionGrid[sessionId] = {};
    if (!sessionGrid[sessionId][turnNum]) sessionGrid[sessionId][turnNum] = {};
    sessionGrid[sessionId][turnNum][model] = rk.rank;
  });

  const modelDrift: Record<string, { drops: number; rises: number; totalDelta: number; count: number }> = {};

  Object.entries(sessionGrid).forEach(([, byTurn]) => {
    const turns = Object.keys(byTurn).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < turns.length - 1; i++) {
      const t1 = turns[i];
      const t2 = turns[i + 1];
      Object.keys(byTurn[t1]).forEach(model => {
        const r1 = byTurn[t1][model];
        const r2 = byTurn[t2]?.[model];
        if (r2 === undefined) return;
        const delta = r2 - r1;
        if (!modelDrift[model]) modelDrift[model] = { drops: 0, rises: 0, totalDelta: 0, count: 0 };
        modelDrift[model].count++;
        modelDrift[model].totalDelta += delta;
        if (delta > 0) modelDrift[model].drops++;
        else if (delta < 0) modelDrift[model].rises++;
      });
    }
  });

  const rankDriftSummary = Object.entries(modelDrift)
    .map(([model, d]) => ({
      model,
      drops: d.drops,
      rises: d.rises,
      avgDelta: d.count > 0 ? +(d.totalDelta / d.count).toFixed(2) : 0,
      count: d.count,
    }))
    .sort((a, b) => b.drops - a.drops);

  // ── Severity breakdown ────────────────────────────────────────────────────
  const severityBreakdown = { high: 0, medium: 0, low: 0 };
  (rawFlags ?? []).forEach(f => {
    if (f.severity in severityBreakdown) severityBreakdown[f.severity as keyof typeof severityBreakdown]++;
  });

  // ── Flag type totals ──────────────────────────────────────────────────────
  const flagTypeTotals = FLAG_TYPES.map(t => ({
    type: t,
    count: (rawFlags ?? []).filter(f => f.flag_type === t).length,
  })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    flags,
    modelFlagMatrix,
    rankDriftSummary,
    severityBreakdown,
    flagTypeTotals,
    totalFlags: rawFlags?.length ?? 0,
  });
}
