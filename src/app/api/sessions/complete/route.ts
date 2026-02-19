import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Called via navigator.sendBeacon on tab close.
// sendBeacon only supports POST; body is JSON.
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json() as { sessionId: string };
    if (!sessionId) return new Response("ok");

    const supabase = createServiceClient();
    await supabase
      .from("sessions")
      .update({ is_complete: true, completed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("is_complete", false); // no-op if already complete

    // Fire analysis async (best-effort — beacon handler may be short-lived)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    fetch(`${appUrl}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
  } catch {}

  return new Response("ok");
}
