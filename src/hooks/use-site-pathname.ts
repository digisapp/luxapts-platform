"use client";

import { usePathname } from "next/navigation";

/**
 * usePathname() for the root-layout chrome (bottom nav, chat bubble, compare
 * bar). The homepage is prerendered with the canonical URL "/index" — its RSC
 * payload carries `"c":["","index"]` — so during that render usePathname()
 * returned "/index" while the browser hydrates with "/". Anything keyed off
 * the path then disagreed between the HTML and the client: the Home tab never
 * lit up, and the chat bubble (hidden on "/" until you scroll) was painted by
 * the server but never claimed by React, leaving a dead, untappable button on
 * top of the hero's Ask Stacy button. Normalizing here keeps both renders on
 * "/".
 */
export function useSitePathname(): string {
  const pathname = usePathname() ?? "";
  return pathname === "/index" ? "/" : pathname;
}
