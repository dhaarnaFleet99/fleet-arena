import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

const SLOTS = ["A", "B", "C", "D", "E", "F", "G", "H"];

export async function POST(req: NextRequest) {
  const { sessionId, turnId, rankings } = await req.json() as {
    sessionId: string;
    turnId: string;
    rankings: { slotLabel: string; rank: number }[];
  };

  if (!sessionId || !turnId || !rankings?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const userSupabase = createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  const supabase = createServiceClient();

  // Get session to know the model→slot order (slot A = model_ids[0], etc.)
  const { data: sessionData, error: sessionErr } = await supabase
    .from("sessions")
    .select("model_ids")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !sessionData) {
    console.error("[rankings] session fetch failed:", sessionErr?.message, { sessionId });
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sessionModelIds = sessionData.model_ids as string[];

  // Get response rows for this turn (by model_id — no slot_label in live DB schema)
  const { data: responses, error: responsesErr } = await supabase
    .from("responses")
    .select("id, model_id")
    .eq("turn_id", turnId);

  if (responsesErr) {
    console.error("[rankings] responses query failed:", responsesErr.message, { turnId });
    return NextResponse.json({ error: responsesErr.message }, { status: 500 });
  }

  if (!responses || responses.length === 0) {
    console.error("[rankings] no response rows found for turn", { turnId, sessionId });
    await supabase.from("turns").update({ ranking_submitted: true }).eq("id", turnId);
    return NextResponse.json({ revealed: buildReveal(sessionModelIds, []), warning: "no_responses" });
  }

  // Map slotLabel → model_id (via session order) → response_id
  const rows = rankings
    .map(r => {
      const slotIdx = SLOTS.indexOf(r.slotLabel);
      if (slotIdx < 0) return null;
      const modelId = sessionModelIds[slotIdx];
      if (!modelId) return null;
      const response = responses.find(x => x.model_id === modelId);
      if (!response) return null;
      return {
        // session_id and user_id omitted — columns may not exist in live DB schema
        turn_id: turnId,
        response_id: response.id,
        rank: r.rank,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (rows.length > 0) {
    const { error } = await supabase.from("rankings").insert(rows);
    if (error) {
      console.error("[rankings] insert failed:", error.message, { turnId, rowCount: rows.length });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Mark turn as ranked
  await supabase.from("turns").update({ ranking_submitted: true }).eq("id", turnId);

  // Bump profile ranking count
  if (user?.id) {
    try { await supabase.rpc("increment_profile_rankings", { uid: user.id }); } catch {}
  }

  // Return reveal info — slot_label derived from model order, not from DB column
  return NextResponse.json({ revealed: buildReveal(sessionModelIds, responses) });
}

function buildReveal(
  modelIds: string[],
  responses: { id: string; model_id: string }[]
) {
  return modelIds.map((modelId, i) => ({
    id: responses.find(r => r.model_id === modelId)?.id ?? "",
    model_id: modelId,
    slot_label: SLOTS[i],
  }));
}
