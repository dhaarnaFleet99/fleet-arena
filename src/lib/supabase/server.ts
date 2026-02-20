import { createServerClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// createClient() CANNOT be a singleton — it reads per-request cookies.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

// Singleton — the service client is stateless (no cookies, service role key only).
// Reused across warm invocations within the same serverless function instance.
// Note: this project uses PostgREST (HTTP), not direct Postgres connections,
// so there is no TCP connection pool to exhaust here.
let _serviceClient: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (!_serviceClient) {
    // createServerClient returns a SupabaseClient-compatible object.
    // Cast needed because @supabase/ssr wraps the type differently.
    _serviceClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    ) as unknown as SupabaseClient;
  }
  return _serviceClient;
}
