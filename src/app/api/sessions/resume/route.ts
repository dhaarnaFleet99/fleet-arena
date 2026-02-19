import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  const userSupabase = createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Fetch session (verify ownership)
  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch turns
  const { data: turns } = await supabase
    .from("turns")
    .select("*")
    .eq("session_id", sessionId)
    .order("turn_number");

  const turnIds = (turns ?? []).map(t => t.id);

  // Use turn_id to query responses — avoids relying on session_id column
  // which may be absent from the live DB schema
  const { data: responses } = turnIds.length > 0
    ? await supabase.from("responses").select("*").in("turn_id", turnIds)
    : { data: [] };

  // Fetch rankings by turn_id — session_id column may not exist in live DB
  const { data: rankings } = turnIds.length > 0
    ? await supabase.from("rankings").select("*").in("turn_id", turnIds)
    : { data: [] };

  return NextResponse.json({ session, turns, responses, rankings });
}
