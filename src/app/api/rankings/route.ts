import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// POST: submit rankings for a turn
// Returns: revealed model_ids per response
export async function POST(req: NextRequest) {
  const { sessionId, turnId, rankings } = await req.json() as {
    sessionId: string;
    turnId: string;
    rankings: { responseId: string; rank: number }[];
  };

  if (!sessionId || !turnId || !rankings?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert rankings
  const rows = rankings.map((r) => ({
    session_id: sessionId,
    turn_id: turnId,
    response_id: r.responseId,
    rank: r.rank,
  }));

  const { error } = await supabase.from("rankings").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch + reveal model_ids for this turn's responses
  const { data: responses } = await supabase
    .from("responses")
    .select("id, model_id")
    .eq("turn_id", turnId);

  return NextResponse.json({ revealed: responses ?? [] });
}
