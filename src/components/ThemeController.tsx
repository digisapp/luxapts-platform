"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyTheme, currentTheme } from "@/lib/theme";

/**
 * Keeps <html class="dark"> right across client-side navigation. The inline
 * script in the root layout covers the first paint; this covers moving from a
 * light-ready page to one that isn't (and back) without a reload.
 */
export function ThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    applyTheme(currentTheme());
  }, [pathname]);

  return null;
}
