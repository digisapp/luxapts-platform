"use client";

import { useEffect, useState } from "react";

/**
 * The time, refreshed every minute, for "3h ago" labels. Null until mounted:
 * the server renders in another second (and zone), so ages rendered there
 * would not hydrate.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
