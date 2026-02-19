import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { sessionId, turnNumber, prompt } = await req.json() as {
    sessionId: string;
    turnNumber: number;
    prompt: string;
  };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("turns")
    .insert({ session_id: sessionId, turn_number: turnNumber, prompt })
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message }, { status: 500 });
  return NextResponse.json({ turnId: data.id });
}
