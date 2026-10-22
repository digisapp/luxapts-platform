import { type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { detectCrawler, recordCrawlerHit } from "@/lib/analytics/crawlers";

// Next.js 16 "proxy" convention (formerly middleware.ts). Runs at the edge of
// every matched request: refreshes the Supabase session cookie and gates the
// admin/agent/partner areas by profile role.
//
// It also counts AI-assistant crawler requests (crawler_hits). The proxy runs
// before the CDN cache, so ISR pages served from cache are counted too; the
// insert runs after the response via waitUntil.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const userAgent = request.headers.get("user-agent") || "";
  const bot = detectCrawler(userAgent);
  if (bot) {
    event.waitUntil(recordCrawlerHit(bot, request.nextUrl.pathname, userAgent));
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (route handlers do their own auth; see below)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     *
     * /api really is excluded now — the comment claimed it was, but the regex
     * did not, so every API request paid an extra supabase.auth.getUser()
     * round trip. Nothing in updateSession applies to /api: it only gates the
     * /admin, /agent, /partner and /shower page paths, and route handlers
     * refresh the session cookie themselves (createClient() in
     * lib/supabase/server can write cookies from a Route Handler; the
     * try/catch there only swallows writes attempted from Server Components).
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
