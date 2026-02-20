import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

// Manual trigger: enqueues an analysis job via Inngest.
// The job runs with retry + observability via the Inngest dashboard.
// Idempotency is enforced inside the job itself (checks behavioral_flags).
export async function POST(req: NextRequest) {
  const { sessionId } = await req.json() as { sessionId: string };
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

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
