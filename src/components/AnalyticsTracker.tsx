"use client";

import { usePathname } from "next/navigation";
import { usePageTracking } from "@/hooks/useAnalytics";

/**
 * Global page-view tracking. Rendered once in the root layout (inside
 * AuthProvider, since useAnalytics reads the auth context) so every
 * client-side navigation is reported to /api/analytics/track.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  usePageTracking(pathname ?? "/");
  return null;
}
