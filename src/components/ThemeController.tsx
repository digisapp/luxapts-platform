"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, currentTheme } from "@/lib/theme";

/**
 * Keeps <html class="dark"> right across client-side navigation. The inline
 * script in the root layout covers the first paint; this covers moving
 * between a public page and a staff portal without a reload. A layout effect,
 * so the class changes before the new page paints rather than one frame after.
 */
export function ThemeController() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    applyTheme(currentTheme());
  }, [pathname]);

  return null;
}
