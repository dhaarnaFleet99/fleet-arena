import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { modelIds, userId } = await req.json() as { modelIds: string[]; userId?: string };

  if (!modelIds || modelIds.length < 2) {
    return NextResponse.json({ error: "Need at least 2 models" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ model_ids: modelIds, user_id: userId ?? null })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  return NextResponse.json({ sessionId: session.id });
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };
  const supabase = createServiceClient();
  await supabase.from("sessions").update({ is_complete: true }).eq("id", sessionId);
  return NextResponse.json({ ok: true });
}
