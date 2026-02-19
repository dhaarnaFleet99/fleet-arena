import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { modelIds } = await req.json() as { modelIds: string[] };
  if (!modelIds || modelIds.length < 2) {
    return NextResponse.json({ error: "Need at least 2 models" }, { status: 400 });
  }

  // Get current user (optional — arena works for authed users only now)
  const userSupabase = createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  const supabase = createServiceClient();
  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ model_ids: modelIds, user_id: user?.id ?? null })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  // Upsert profile (creates it if missing) then increment session count
  if (user?.id) {
    const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";
    try {
      // Create profile row if it doesn't exist yet (trigger may not be installed)
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email ?? "",
        is_internal: user.email?.endsWith("@" + INTERNAL_DOMAIN) ?? false,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "id", ignoreDuplicates: true });
      // Increment session counter + update last_seen_at
      await supabase.rpc("increment_profile_sessions", { uid: user.id });
    } catch {
      // ignore if fails
    }
  }

  return NextResponse.json({ sessionId: session.id });
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };
  const supabase = createServiceClient();
  await supabase
    .from("sessions")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  // Trigger async analysis
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
