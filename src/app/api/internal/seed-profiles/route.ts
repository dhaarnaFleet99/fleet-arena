import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST() {
  try { await requireInternalUser(); } catch (e) { return e as Response; }

  // Admin client — can call auth.admin.listUsers()
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const supabase = createServiceClient();

  // Fetch all auth users (paginated, max 1000 per page)
  const allUsers: { id: string; email: string }[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    allUsers.push(...data.users.map(u => ({ id: u.id, email: u.email ?? "" })));
    if (data.users.length < 1000) break;
    page++;
  }

  if (allUsers.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, message: "No auth users found" });
  }

  // Fetch session counts per user
  const { data: sessionCounts } = await supabase
    .from("sessions")
    .select("user_id")
    .not("user_id", "is", null);

  const countByUser: Record<string, number> = {};
  (sessionCounts ?? []).forEach(s => {
    if (s.user_id) countByUser[s.user_id] = (countByUser[s.user_id] ?? 0) + 1;
  });

  const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";

  const rows = allUsers.map(u => ({
    id: u.id,
    email: u.email,
    is_internal: u.email.endsWith("@" + INTERNAL_DOMAIN),
    total_sessions: countByUser[u.id] ?? 0,
  }));

  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert(rows, { onConflict: "id" });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, upserted: rows.length });
}
