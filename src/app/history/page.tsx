import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import ShellLayout from "@/components/ShellLayout";
import { MODELS } from "@/lib/models";
import Link from "next/link";

export default async function HistoryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let sessions: Array<{
    id: string; model_ids: string[]; is_complete: boolean;
    turn_count: number; created_at: string;
  }> = [];

  if (user) {
    const service = createServiceClient();
    const { data } = await service
      .from("sessions")
      .select("id, model_ids, is_complete, created_at, turns(id)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    sessions = (data ?? []).map((s: any) => ({
      ...s,
      turn_count: s.turns?.length ?? 0,
    }));
  }

  return (
    <ShellLayout>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 54, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 24px", background: "var(--surface)" }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>My Sessions</span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {!user ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔒</div>
              <Link href="/login" style={{ color: "var(--accent)" }}>Sign in</Link> to see your session history.
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)", fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
              No sessions yet. <Link href="/arena" style={{ color: "var(--accent)" }}>Start one →</Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
              {sessions.map(s => {
                const modelLabels = s.model_ids.map(id => MODELS.find(m => m.id === id)?.label ?? id.split("/")[1]);
                const date = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return (
                  <Link key={s.id} href={`/sessions/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                          {modelLabels.join(" vs ")}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>
                          {s.turn_count} turn{s.turn_count !== 1 ? "s" : ""} · {date}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                        background: s.is_complete ? "rgba(52,211,153,0.1)" : "rgba(79,142,247,0.1)",
                        color: s.is_complete ? "var(--success)" : "var(--accent)",
                      }}>
                        {s.is_complete ? "Complete" : "In Progress"}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ShellLayout>
  );
}
