import { inngest } from "./client";
import { createEdgeServiceClient } from "@/lib/supabase/edge";

const BATCH_SIZE = 50; // sessions to enqueue per run

/**
 * Scheduled backfill: finds sessions that are complete but have no behavioral_flags
 * (e.g. completed before Inngest was deployed, or during Inngest downtime)
 * and re-enqueues them for analysis.
 *
 * Runs every 6 hours. Each Inngest `send` uses a dedup ID so sessions already
 * in-flight or already analyzed are not processed twice.
 */
export const backfillAnalysisFn = inngest.createFunction(
  { id: "backfill-analysis", retries: 1 },
  { cron: "0 */6 * * *" }, // every 6 hours
  async ({ step, logger }) => {
    const sessions = await step.run("find-unanalyzed-sessions", async () => {
      const supabase = createEdgeServiceClient();

      // Fetch session IDs that already have at least one behavioral flag.
      const { data: analyzed, error: flagErr } = await supabase
        .from("behavioral_flags")
        .select("session_id")
        .limit(10000);

      if (flagErr) throw new Error(`backfill flag query failed: ${flagErr.message}`);

      const analyzedIds = Array.from(new Set((analyzed ?? []).map(r => r.session_id as string)));

      // Sessions that are complete but not in the analyzed set.
      let query = supabase
        .from("sessions")
        .select("id")
        .eq("is_complete", true)
        .order("created_at", { ascending: false })
        .limit(BATCH_SIZE);

      if (analyzedIds.length > 0) {
        query = query.not("id", "in", `(${analyzedIds.join(",")})`);
      }

      const { data, error } = await query;
      if (error) throw new Error(`backfill session query failed: ${error.message}`);

      logger.info(`backfill: found ${data?.length ?? 0} unanalyzed sessions`);
      return data?.map(r => r.id) ?? [];
    });

    if (!sessions.length) {
      logger.info("backfill: nothing to do");
      return { queued: 0 };
    }

    // Send one event per session; Inngest dedup id prevents duplicate runs.
    await step.run("enqueue-sessions", async () => {
      await inngest.send(
        sessions.map((sessionId: string) => ({
          name: "arena/session.completed" as const,
          data: { sessionId },
          id: `analyze-${sessionId}`, // dedup key — safe to resend
        }))
      );
      logger.info(`backfill: enqueued ${sessions.length} sessions`);
    });

    return { queued: sessions.length };
  }
);
