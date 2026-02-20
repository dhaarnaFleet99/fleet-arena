import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

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
    console.error("[sessions] insert failed", { code: error?.code, detail: error?.message, userId: user?.id });
    return NextResponse.json({ error: error?.message ?? "Failed to create session" }, { status: 500 });
  }

  // Upsert profile (creates it if missing) then increment session count
  if (user?.id) {
    const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";
    try {
      await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email ?? "",
        is_internal: user.email?.endsWith("@" + INTERNAL_DOMAIN) ?? false,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "id", ignoreDuplicates: true });

      const { error: rpcErr } = await supabase.rpc("increment_profile_sessions", { uid: user.id });
      if (rpcErr) {
        console.warn("[sessions] increment_profile_sessions failed", { userId: user.id, detail: rpcErr.message });
      }
    } catch (profileErr) {
      console.warn("[sessions] profile upsert threw", { userId: user.id, err: String(profileErr) });
    }
  }

  return NextResponse.json({ sessionId: session.id });
}

export async function PATCH(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("sessions")
    .update({ is_complete: true, completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) {
    console.error("[sessions] mark-complete failed", { sessionId, code: error.code, detail: error.message });
  }

  // Enqueue analysis via Inngest — retries automatically on failure.
  // The event id deduplicates: if PATCH is called twice, only one job runs.
  await inngest.send({
    name: "arena/session.completed",
    data: { sessionId },
    id: `analyze-${sessionId}`,
  }).catch(e => console.error("[sessions] failed to enqueue analyze", { sessionId, err: String(e) }));

  return NextResponse.json({ ok: true });
}
