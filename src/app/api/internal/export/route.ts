import { NextRequest, NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SLOTS = ["A", "B", "C"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(req: NextRequest) {
  try { await requireInternalUser(); } catch (e) { return e as Response; }

  const format = req.nextUrl.searchParams.get("format");
  if (!format) return NextResponse.json({ error: "Missing format" }, { status: 400 });

  const supabase = createServiceClient();

  // ── Preference Pairs (JSONL) ────────────────────────────────────────────────
  if (format === "preference_pairs") {
    const [
      { data: sessions },
      { data: turns },
      { data: responses },
      { data: rankings },
    ] = await Promise.all([
      supabase.from("sessions").select("id, model_ids").eq("is_complete", true),
      supabase.from("turns").select("id, session_id, turn_number, prompt"),
      supabase.from("responses").select("id, turn_id, model_id, content"),
      supabase.from("rankings").select("response_id, rank, turn_id"),
    ]);

    const sessionModelIds: Record<string, string[]> = {};
    (sessions ?? []).forEach(s => { sessionModelIds[s.id] = s.model_ids; });
    const completedIds = new Set(Object.keys(sessionModelIds));

    const lines: string[] = [];

    (turns ?? [])
      .filter(t => completedIds.has(t.session_id))
      .forEach(turn => {
        const turnResponses = (responses ?? []).filter(r => r.turn_id === turn.id);
        const turnRankings = (rankings ?? []).filter(rk => rk.turn_id === turn.id);
        if (turnRankings.length < 2) return;

        const modelIds = sessionModelIds[turn.session_id] ?? [];
        const ranked = turnResponses
          .map(r => ({ ...r, rank: turnRankings.find(rk => rk.response_id === r.id)?.rank ?? null }))
          .filter(r => r.rank !== null)
          .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

        // All pairwise (chosen > rejected) combinations
        for (let i = 0; i < ranked.length; i++) {
          for (let j = i + 1; j < ranked.length; j++) {
            const chosen = ranked[i];
            const rejected = ranked[j];
            lines.push(JSON.stringify({
              session_id: turn.session_id,
              turn_number: turn.turn_number,
              turn_id: turn.id,
              prompt: turn.prompt,
              chosen: {
                slot: SLOTS[modelIds.indexOf(chosen.model_id)] ?? "?",
                model_id: chosen.model_id,
                content: chosen.content,
                rank: chosen.rank,
              },
              rejected: {
                slot: SLOTS[modelIds.indexOf(rejected.model_id)] ?? "?",
                model_id: rejected.model_id,
                content: rejected.content,
                rank: rejected.rank,
              },
            }));
          }
        }
      });

    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="fleet-preference-pairs-${today()}.jsonl"`,
      },
    });
  }

  // ── Multi-turn Trajectories (JSON) ──────────────────────────────────────────
  if (format === "trajectories") {
    const [
      { data: sessions },
      { data: turns },
      { data: responses },
      { data: rankings },
    ] = await Promise.all([
      supabase.from("sessions").select("id, model_ids, created_at, completed_at").eq("is_complete", true),
      supabase.from("turns").select("id, session_id, turn_number, prompt, ranking_submitted"),
      supabase.from("responses").select("id, turn_id, model_id, content, token_count, latency_ms, finish_reason"),
      supabase.from("rankings").select("response_id, rank, turn_id"),
    ]);

    const output = (sessions ?? []).map(session => {
      const sessionTurns = (turns ?? [])
        .filter(t => t.session_id === session.id)
        .sort((a, b) => a.turn_number - b.turn_number);

      return {
        session_id: session.id,
        model_ids: session.model_ids,
        created_at: session.created_at,
        completed_at: session.completed_at,
        turns: sessionTurns.map(turn => {
          const turnResponses = (responses ?? []).filter(r => r.turn_id === turn.id);
          const turnRankings = (rankings ?? []).filter(rk => rk.turn_id === turn.id);
          return {
            turn_number: turn.turn_number,
            prompt: turn.prompt,
            ranking_submitted: turn.ranking_submitted,
            responses: turnResponses
              .map(r => ({
                model_id: r.model_id,
                slot: SLOTS[session.model_ids.indexOf(r.model_id)] ?? "?",
                content: r.content,
                token_count: r.token_count,
                latency_ms: r.latency_ms,
                finish_reason: r.finish_reason,
                rank: turnRankings.find(rk => rk.response_id === r.id)?.rank ?? null,
              }))
              .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
          };
        }),
      };
    });

    return new Response(JSON.stringify(output, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="fleet-trajectories-${today()}.json"`,
      },
    });
  }

  // ── Behavioral Flags (CSV) ──────────────────────────────────────────────────
  if (format === "behavioral_flags") {
    const { data: flags } = await supabase
      .from("behavioral_flags")
      .select("session_id, turn_id, model_id, flag_type, severity, confidence, description, created_at")
      .order("created_at", { ascending: false });

    const headers = ["session_id", "turn_id", "model_id", "flag_type", "severity", "confidence", "description", "created_at"];
    const rows = (flags ?? []).map(f => [
      f.session_id,
      f.turn_id ?? "",
      f.model_id,
      f.flag_type,
      f.severity,
      f.confidence ?? 0,
      csvEscape(f.description ?? ""),
      f.created_at,
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="fleet-behavioral-flags-${today()}.csv"`,
      },
    });
  }

  // ── User Cohorts (CSV) ──────────────────────────────────────────────────────
  if (format === "user_cohorts") {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, is_internal, total_sessions, total_rankings, first_seen_at, last_seen_at")
      .order("total_sessions", { ascending: false });

    const headers = [
      "user_id", "email", "is_internal",
      "total_sessions", "total_rankings",
      "first_seen_at", "last_seen_at", "is_returning",
    ];
    const rows = (profiles ?? []).map(p => [
      p.id,
      csvEscape(p.email ?? ""),
      p.is_internal ? "true" : "false",
      p.total_sessions ?? 0,
      p.total_rankings ?? 0,
      p.first_seen_at ?? "",
      p.last_seen_at ?? "",
      (p.total_sessions ?? 0) > 1 ? "true" : "false",
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="fleet-user-cohorts-${today()}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}
