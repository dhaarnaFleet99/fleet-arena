import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inngest } from "@/inngest/client";

// Called via navigator.sendBeacon when the user starts a new session or closes the tab.
// sendBeacon only supports POST; body is JSON.
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json() as { sessionId: string };
    if (!sessionId) return new Response("ok");

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("sessions")
      .update({ is_complete: true, completed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("is_complete", false); // no-op if already complete

    if (error) {
      console.error("[sessions/complete] mark-complete failed", { sessionId, code: error.code, detail: error.message });
    }

    // Enqueue analysis — awaited so the job is durably queued before this
    // function returns. sendBeacon handlers are short-lived; a fire-and-forget
    // fetch risks being killed before it completes.
    await inngest.send({
      name: "arena/session.completed",
      data: { sessionId },
      id: `analyze-${sessionId}`, // deduplicate: only one job per session
    });

    console.log("[sessions/complete] analysis queued", { sessionId });
  } catch (e) {
    console.error("[sessions/complete] error", { err: String(e) });
  }

  return new Response("ok");
}
