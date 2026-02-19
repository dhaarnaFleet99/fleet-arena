import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const INTERNAL_DOMAIN = process.env.INTERNAL_EMAIL_DOMAIN ?? "fleet.so";

  // Protect /dashboard — must be @fleet.so
  if (path.startsWith("/dashboard")) {
    if (!user?.email?.endsWith("@" + INTERNAL_DOMAIN)) {
      return NextResponse.redirect(new URL("/login?reason=internal", request.url));
    }
  }

  // Protect /history and /arena — must be logged in
  if (path.startsWith("/history") || path.startsWith("/arena")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login?reason=auth", request.url));
    }
  }

  // Logged in already → skip login page
  if (path === "/login" && user) {
    const dest = user.email?.endsWith("@" + INTERNAL_DOMAIN) ? "/dashboard" : "/arena";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/history/:path*", "/sessions/:path*", "/arena/:path*", "/arena", "/login"],
};