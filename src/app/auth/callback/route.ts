import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/arena";

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Ensure profile row exists for this user
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";
      const service = createServiceClient();
      await service.from("profiles").upsert({
        id: user.id,
        email: user.email ?? "",
        is_internal: user.email?.endsWith("@" + INTERNAL_DOMAIN) ?? false,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "id", ignoreDuplicates: true }).catch(() => {});
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
