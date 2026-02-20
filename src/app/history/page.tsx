import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import ShellLayout from "@/components/ShellLayout";
import { MODELS } from "@/lib/models";
import Link from "next/link";

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams?.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let sessions: Array<{
    id: string; model_ids: string[]; is_complete: boolean;
    turn_count: number; created_at: string;
  }> = [];
  let totalCount = 0;

  if (user) {
    const service = createServiceClient();
    // turns(id) join gives us turn count per session.
    // count: "exact" gives us total session count for pagination (counts the top-level rows).
    const { data, count } = await service
      .from("sessions")
      .select("id, model_ids, is_complete, created_at, turns(id)", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sessions = (data ?? []).map((s: any) => ({
      ...s,
      turn_count: s.turns?.length ?? 0,
    }));
    totalCount = count ?? 0;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <ShellLayout>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ height: 54, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 24px", background: "var(--surface)" }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>My Sessions</span>
          {user && totalCount > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)" }}>
              {totalCount} session{totalCount !== 1 ? "s" : ""}
            </span>
          )}
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
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 700 }}>
                {sessions.map(s => {
                  const modelLabels = s.model_ids.map(id => MODELS.find(m => m.id === id)?.label ?? id.split("/")[1]);
                  const date = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <Link key={s.id} href={`/arena?resume=${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                            {modelLabels.join(" vs ")}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>
                            {s.turn_count} turn{s.turn_count !== 1 ? "s" : ""} · {date}
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>→</span>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, maxWidth: 700 }}>
                  {hasPrev ? (
                    <Link href={`/history?page=${page - 1}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                      ← Prev
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>← Prev</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, textAlign: "center" }}>
                    Page {page} of {totalPages}
                  </span>
                  {hasNext ? (
                    <Link href={`/history?page=${page + 1}`} style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                      Next →
                    </Link>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Next →</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ShellLayout>
  );
}
