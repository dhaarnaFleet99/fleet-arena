import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    await requireInternalUser();
  } catch (e) {
    return e as Response;
  }

  const supabase = createServiceClient();

  // Total sessions
  const { count: totalSessions } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true });

  // Total turns (= prompts evaluated)
  const { count: totalTurns } = await supabase
    .from("turns")
    .select("*", { count: "exact", head: true });

  // Refusals (finish_reason = content_filter)
  const { count: refusals } = await supabase
    .from("responses")
    .select("*", { count: "exact", head: true })
    .eq("finish_reason", "content_filter");

  // Win rates: rank=1 per model
  const { data: rankOnes } = await supabase
    .from("rankings")
    .select("response_id, rank")
    .eq("rank", 1);

  // We need to join with responses to get model_id
  const { data: responses } = await supabase
    .from("responses")
    .select("id, model_id");

  const modelMap: Record<string, string> = {};
  responses?.forEach((r) => { modelMap[r.id] = r.model_id; });

  const wins: Record<string, number> = {};
  rankOnes?.forEach((r) => {
    const mid = modelMap[r.response_id];
    if (mid) wins[mid] = (wins[mid] ?? 0) + 1;
  });

  const totalRanked = rankOnes?.length ?? 1;
  const winRates = Object.entries(wins).map(([model, count]) => ({
    model,
    wins: count,
    pct: Math.round((count / totalRanked) * 100),
  })).sort((a, b) => b.pct - a.pct);

  const refusalRate = totalTurns
    ? ((refusals ?? 0) / ((totalTurns ?? 1) * 3) * 100).toFixed(1)
    : "0.0";

  return NextResponse.json({
    totalSessions: totalSessions ?? 0,
    totalPrompts: totalTurns ?? 0,
    refusalRate,
    winRates,
  });
}
