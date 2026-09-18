import { MICROSITE_DOMAINS } from "@/lib/validations";

// The microsites are static pages on their own domains, so every request to the
// lead and analytics routes is cross-origin and carries an Origin header.
export const ALLOWED_ORIGINS = new Set(
  MICROSITE_DOMAINS.flatMap((d) => [
    `https://${d}`,
    `https://www.${d}`,
    // Stable Vercel alias (pre-DNS testing), e.g. namdartowerscom.vercel.app
    `https://${d.replace(/\./g, "")}.vercel.app`,
  ])
);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/**
 * CORS headers only tell a *browser* to block a response — the request still
 * reaches the handler and any write it performs still happens. Without this
 * check, curl or a script could POST from anywhere and fill the leads table,
 * which matters now that the microsites are indexed and the endpoint is
 * discoverable in their page source.
 *
 * Rejecting a missing Origin loses nothing: a browser that sends no Origin
 * also can't read the response, so that submission was already failing from
 * the visitor's point of view — it was just being stored anyway first.
 */
export function isAllowedOrigin(req: Request): boolean {
  return ALLOWED_ORIGINS.has(req.headers.get("origin") || "");
}
