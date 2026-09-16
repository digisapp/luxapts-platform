/**
 * Portal routes render their own chrome (sidebars, sticky action bars) and
 * are never used by consumers, so the consumer-facing floating UI — mobile
 * bottom nav, chat bubble, voice widget — must not paint over them.
 */
export const PORTAL_ROUTE_PREFIXES = [
  "/admin",
  "/shower",
  "/partner",
  "/agent",
] as const;

/** True when the pathname is a portal route (exact match or a sub-route). */
export function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
