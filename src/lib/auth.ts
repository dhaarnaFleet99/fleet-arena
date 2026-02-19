import { createClient } from "@/lib/supabase/server";

const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";

export async function requireInternalUser(): Promise<{ email: string }> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.email) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (!user.email.endsWith(`@${INTERNAL_DOMAIN}`)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return { email: user.email };
}
