import { MICROSITE_DOMAINS } from "@/lib/validations";

/**
 * Host Google Translate's proxy serves a page from when a visitor taps
 * "Translate": downtown6miami.com -> downtown6miami-com.translate.goog
 * (existing hyphens double, dots become hyphens). The page's scripts run on
 * that origin, so without it a translated visitor's form and chat fail with
 * "Load failed" and the lead is lost.
 */
export function translateProxyHost(host: string): string {
  return `${host.replace(/-/g, "--").replace(/\./g, "-")}.translate.goog`;
}

/** Every host a microsite's own scripts can legitimately run on. */
function micrositeHosts(domain: string): string[] {
  return [
    domain,
    `www.${domain}`,
    // Stable Vercel alias (pre-DNS testing), e.g. namdartowerscom.vercel.app
    `${domain.replace(/\./g, "")}.vercel.app`,
    translateProxyHost(domain),
    translateProxyHost(`www.${domain}`),
  ];
}

// The microsites are static pages on their own domains, so every request to the
// lead and analytics routes is cross-origin and carries an Origin header.
export const ALLOWED_ORIGINS = new Set(
  MICROSITE_DOMAINS.flatMap((d) => micrositeHosts(d).map((host) => `https://${host}`))
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
 * reaches the handler and any write it performs still happens. This check
 * stops other web pages from posting through a visitor's browser. It does NOT
 * stop scripts: curl can send any Origin header it likes, so the per-IP rate
 * limit on each route is the real backstop against scripted submissions.
 *
 * Rejecting a missing Origin loses nothing: a browser that sends no Origin
 * also can't read the response, so that submission was already failing from
 * the visitor's point of view — it was just being stored anyway first.
 */
export function isAllowedOrigin(req: Request): boolean {
  return ALLOWED_ORIGINS.has(req.headers.get("origin") || "");
}

/**
 * The request must come from the microsite it claims to be. isAllowedOrigin
 * only proves "some microsite", so without this any one of them could post
 * leads or page views attributed to another domain.
 */
export function originMatches(req: Request, domain: string): boolean {
  let host = "";
  try {
    host = new URL(req.headers.get("origin") || "").hostname;
  } catch {}
  return micrositeHosts(domain).includes(host);
}
