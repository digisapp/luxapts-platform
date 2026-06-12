import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protected routes - check authentication
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isAgentRoute = request.nextUrl.pathname.startsWith("/agent");
  const isPartnerRoute = request.nextUrl.pathname.startsWith("/partner");
  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");

  // If trying to access protected routes without being logged in
  if (!user && (isAdminRoute || isAgentRoute || isPartnerRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Role-based access control for protected routes
  // Query the profiles table directly instead of trusting user_metadata
  if (user && (isAdminRoute || isAgentRoute || isPartnerRoute)) {
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = profile?.role || "renter";

    if (isAdminRoute && userRole !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (isAgentRoute && !["admin", "agent"].includes(userRole)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (isPartnerRoute && !["admin", "partner"].includes(userRole)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // If logged in user tries to access auth pages, redirect to home.
  // Exception: /auth/reset-password — Supabase recovery links sign the user
  // in BEFORE they land on the reset page, so redirecting would make it
  // impossible to ever set a new password.
  const isResetPasswordRoute = request.nextUrl.pathname.startsWith("/auth/reset-password");
  if (user && isAuthRoute && !isResetPasswordRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
