"use client";

import { useSyncExternalStore } from "react";

/**
 * Hydration-safe matchMedia: the server snapshot is always false, so the
 * first client render matches the HTML and the real value applies right after.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
