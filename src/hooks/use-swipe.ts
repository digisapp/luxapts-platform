"use client";

import { useCallback, useRef } from "react";

/**
 * Horizontal swipe handlers for photo galleries. Pair with `touch-pan-y` on
 * the element so vertical page scrolling still works through it.
 */
export function useSwipe(onPrevious: () => void, onNext: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from || !enabled) return;
      const dx = e.changedTouches[0].clientX - from.x;
      const dy = e.changedTouches[0].clientY - from.y;
      // Horizontal swipe only — ignore vertical scrolls and small taps
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) onNext();
      else onPrevious();
    },
    [enabled, onNext, onPrevious]
  );

  return { onTouchStart, onTouchEnd };
}
