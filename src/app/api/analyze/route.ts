import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Manual trigger: enqueues an analysis job via Inngest.
// Requires auth (enforced by middleware) + session ownership.
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  // Middleware guarantees a user exists, but re-check for defence-in-depth.
  const userSupabase = createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the session belongs to this user (internal users may re-analyse any session).
  const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";
  const isInternal = user.email?.endsWith("@" + INTERNAL_DOMAIN) ?? false;

  if (!isInternal) {
    const supabase = createServiceClient();
    const { data: session } = await supabase
      .from("sessions")
      .select("user_id")
      .eq("id", sessionId)
      .single();

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    await inngest.send({
      name: "arena/session.completed",
      data: { sessionId },
      id: `analyze-${sessionId}`,
    });
    return NextResponse.json({ ok: true, queued: true });
  } catch (e) {
    console.error("[analyze] failed to enqueue job", { sessionId, err: String(e) });
    return NextResponse.json({ error: "Failed to queue analysis" }, { status: 500 });
  }
}
