// Edge-runtime-compatible Supabase service client.
// Uses @supabase/supabase-js directly (no @supabase/ssr / next/headers).
// Only suitable for service-role operations that don't need user auth cookies.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Singleton — reused across warm invocations in the same function instance.
// SupabaseClient<any> allows untyped table operations; we have no generated schema type.
let _client: SupabaseClient | null = null;

export function createEdgeServiceClient(): SupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  _client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _client;
}
