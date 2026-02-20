// Edge-runtime-compatible Supabase service client.
// Uses @supabase/supabase-js directly (no @supabase/ssr / next/headers).
// Only suitable for service-role operations that don't need user auth cookies.
import { createClient } from "@supabase/supabase-js";

export function createEdgeServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
