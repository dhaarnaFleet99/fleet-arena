import { createClient, createServiceClient } from "@/lib/supabase/server";
import ShellLayout from "@/components/ShellLayout";
import { MODELS } from "@/lib/models";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const userSupabase = createClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  if (!user) {
    return (
      <ShellLayout>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
          <Link href="/login" style={{ color: "var(--accent)" }}>Sign in</Link>&nbsp;to view sessions.
        </div>
      </ShellLayout>
    );
  }

  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!session) notFound();

  // Fetch turns first so we can use turn IDs to query responses/rankings
  // (avoids relying on session_id column which may be missing from live DB schema)
  const { data: turns } = await supabase
    .from("turns").select("*").eq("session_id", params.id).order("turn_number");

  const turnIds = (turns ?? []).map(t => t.id);

  const [{ data: responsesRaw }, { data: rankings }] = await Promise.all([
    turnIds.length > 0
      ? supabase.from("responses").select("*").in("turn_id", turnIds)
      : Promise.resolve({ data: [] }),
    // Rankings queried by turn_id — session_id column may not exist in live DB
    turnIds.length > 0
      ? supabase.from("rankings").select("*").in("turn_id", turnIds)
      : Promise.resolve({ data: [] }),
  ]);

  // Derive slot_label from model order (slot A = model_ids[0], etc.)
  const sessionModelIds = session.model_ids as string[];
  const SLOTS = ["A", "B", "C"];
  const responses = (responsesRaw ?? []).map(r => ({
    ...r,
    slot_label: r.slot_label ?? SLOTS[sessionModelIds.indexOf(r.model_id)] ?? "?",
  }));

  const modelLabels = (session.model_ids as string[]).map(
    id => MODELS.find(m => m.id === id)?.label ?? id.split("/")[1]
  );
  const date = new Date(session.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <ShellLayout>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          height: 54, borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", padding: "0 24px",
          background: "var(--surface)", gap: 14, flexShrink: 0,
        }}>
          <Link href="/history" style={{ color: "var(--muted)", fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            ← History
          </Link>
          <span style={{ color: "var(--border)", fontSize: 14 }}>|</span>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{modelLabels.join(" vs ")}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            {date} · {(turns ?? []).length} turn{(turns ?? []).length !== 1 ? "s" : ""}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
            background: session.is_complete ? "rgba(52,211,153,0.1)" : "rgba(79,142,247,0.1)",
            color: session.is_complete ? "var(--success)" : "var(--accent)",
          }}>
            {session.is_complete ? "Complete" : "In Progress"}
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {(turns ?? []).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", fontSize: 13 }}>
              No turns recorded for this session.
            </div>
          ) : (
            <div style={{ maxWidth: 1100 }}>
              {(turns ?? []).map(turn => {
                const turnResponses = (responses ?? [])
                  .filter(r => r.turn_id === turn.id)
                  .sort((a, b) => a.slot_label.localeCompare(b.slot_label));
                const turnRankings = (rankings ?? []).filter(r => r.turn_id === turn.id);
                const isRanked = turn.ranking_submitted;
                const cols = turnResponses.length;

                return (
                  <div key={turn.id} style={{ marginBottom: 40 }}>
                    {/* Turn label */}
                    <div style={{
                      fontSize: 10, letterSpacing: "1.2px", color: "var(--muted)",
                      fontWeight: 700, marginBottom: 10,
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      TURN {turn.turn_number}
                      {isRanked && <span style={{ color: "var(--success)", fontWeight: 700 }}>✓ RANKED</span>}
                      {!isRanked && !turn.ranking_submitted && <span style={{ color: "var(--muted)" }}>— SKIPPED</span>}
                    </div>

                    {/* Prompt */}
                    <div style={{
                      fontSize: 12, color: "var(--text)", marginBottom: 16,
                      padding: "10px 14px", background: "rgba(255,255,255,0.02)",
                      borderRadius: 8, borderLeft: "2px solid var(--border-bright)",
                      fontFamily: "monospace", lineHeight: 1.6, whiteSpace: "pre-wrap",
                    }}>
                      {turn.prompt}
                    </div>

                    {/* Responses grid */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
                      gap: 14,
                    }}>
                      {turnResponses.map(r => {
                        const model = isRanked ? MODELS.find(m => m.id === r.model_id) : null;
                        const ranking = turnRankings.find(rk => rk.response_id === r.id);
                        const isWinner = ranking?.rank === 1;

                        return (
                          <div key={r.id} style={{
                            background: "var(--surface)",
                            border: `1px solid ${isWinner ? "rgba(52,211,153,0.3)" : "var(--border)"}`,
                            borderRadius: 10, padding: 16, fontSize: 13,
                            display: "flex", flexDirection: "column", gap: 10,
                          }}>
                            {/* Card header */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{
                                width: 24, height: 24, borderRadius: 6,
                                background: "var(--surface2)", border: "1px solid var(--border)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 800, color: "var(--muted)", flexShrink: 0,
                              }}>
                                {r.slot_label}
                              </div>
                              {model && (
                                <span style={{ fontSize: 12, fontWeight: 700, color: model.color }}>
                                  {model.label}
                                </span>
                              )}
                              {ranking && (
                                <span style={{
                                  marginLeft: "auto", fontSize: 12, fontWeight: 800,
                                  color: isWinner ? "var(--success)" : "var(--muted)",
                                }}>
                                  #{ranking.rank}
                                </span>
                              )}
                              {!isRanked && (
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted)" }}>
                                  hidden
                                </span>
                              )}
                            </div>

                            {/* Content */}
                            <div style={{
                              fontSize: 12, color: "var(--text)", lineHeight: 1.7,
                              whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto",
                            }}>
                              {r.content || <span style={{ color: "var(--muted)", fontStyle: "italic" }}>No content</span>}
                            </div>

                            {/* Footer meta */}
                            <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--muted)", marginTop: "auto" }}>
                              {r.latency_ms && <span>{(r.latency_ms / 1000).toFixed(1)}s</span>}
                              {r.token_count && <span>~{r.token_count} tokens</span>}
                              {r.finish_reason && r.finish_reason !== "stop" && (
                                <span style={{ color: "rgba(239,68,68,0.8)" }}>{r.finish_reason}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ShellLayout>
  );
}
