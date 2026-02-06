"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

// Generate or retrieve session ID
function getSessionId(): string {
  if (typeof window === "undefined") return "";

  let sessionId = sessionStorage.getItem("lux_session_id");
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    sessionStorage.setItem("lux_session_id", sessionId);
  }
  return sessionId;
}

// Get UTM parameters from URL
function getUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};

  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((key) => {
    const value = params.get(key);
    if (value) utm[key] = value;
  });

  return utm;
}

interface TrackingPayload {
  type: "page_view" | "building_view" | "event" | "session";
  session_id: string;
  user_id?: string;
  data: Record<string, unknown>;
}

async function sendTracking(payload: TrackingPayload): Promise<void> {
  try {
    await fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Use keepalive for page unload tracking
      keepalive: true,
    });
  } catch {
    // Silent fail - analytics shouldn't break the app
  }
}

export function useAnalytics() {
  const { user } = useAuth();
  const sessionId = useRef<string>("");
  const pageLoadTime = useRef<number>(Date.now());

  // Initialize session ID on mount
  useEffect(() => {
    sessionId.current = getSessionId();

    // Track session start (only once per session)
    const hasTrackedSession = sessionStorage.getItem("lux_session_tracked");
    if (!hasTrackedSession) {
      const utm = getUtmParams();
      sendTracking({
        type: "session",
        session_id: sessionId.current,
        user_id: user?.id,
        data: {
          landing_page: window.location.pathname,
          ...utm,
        },
      });
      sessionStorage.setItem("lux_session_tracked", "true");
    }
  }, [user?.id]);

  // Track page view
  const trackPageView = useCallback(
    (path: string, citySlug?: string) => {
      if (!sessionId.current) return;

      pageLoadTime.current = Date.now();

      sendTracking({
        type: "page_view",
        session_id: sessionId.current,
        user_id: user?.id,
        data: {
          path,
          referrer: document.referrer || undefined,
          city_slug: citySlug,
        },
      });
    },
    [user?.id]
  );

  // Track page duration when leaving
  const trackPageDuration = useCallback(
    (path: string) => {
      if (!sessionId.current) return;

      const duration = Date.now() - pageLoadTime.current;

      sendTracking({
        type: "page_view",
        session_id: sessionId.current,
        user_id: user?.id,
        data: {
          path,
          duration_ms: duration,
        },
      });
    },
    [user?.id]
  );

  // Track building view with detailed engagement
  const trackBuildingView = useCallback(
    (
      buildingId: string,
      options?: {
        source?: string;
        timeOnPageMs?: number;
        scrolledToBottom?: boolean;
        viewedGallery?: boolean;
        clickedContact?: boolean;
        clickedScheduleTour?: boolean;
      }
    ) => {
      if (!sessionId.current) return;

      sendTracking({
        type: "building_view",
        session_id: sessionId.current,
        user_id: user?.id,
        data: {
          building_id: buildingId,
          source: options?.source,
          time_on_page_ms: options?.timeOnPageMs,
          scrolled_to_bottom: options?.scrolledToBottom,
          viewed_gallery: options?.viewedGallery,
          clicked_contact: options?.clickedContact,
          clicked_schedule_tour: options?.clickedScheduleTour,
        },
      });
    },
    [user?.id]
  );

  // Track custom events
  const trackEvent = useCallback(
    (
      eventName: string,
      category?: "engagement" | "conversion" | "navigation" | "error",
      properties?: Record<string, unknown>
    ) => {
      if (!sessionId.current) return;

      sendTracking({
        type: "event",
        session_id: sessionId.current,
        user_id: user?.id,
        data: {
          event_name: eventName,
          event_category: category,
          properties,
        },
      });
    },
    [user?.id]
  );

  // Pre-built event helpers
  const track = {
    // Search events
    search: (filters: Record<string, unknown>, resultsCount: number) =>
      trackEvent("search", "engagement", { filters, results_count: resultsCount }),

    // Building engagement
    favoriteAdded: (buildingId: string, buildingName: string) =>
      trackEvent("favorite_added", "engagement", { building_id: buildingId, building_name: buildingName }),

    favoriteRemoved: (buildingId: string) =>
      trackEvent("favorite_removed", "engagement", { building_id: buildingId }),

    compareAdded: (buildingId: string) =>
      trackEvent("compare_added", "engagement", { building_id: buildingId }),

    // Conversion events
    contactClicked: (buildingId: string, method: "phone" | "email" | "form") =>
      trackEvent("contact_clicked", "conversion", { building_id: buildingId, method }),

    tourScheduled: (buildingId: string) =>
      trackEvent("tour_scheduled", "conversion", { building_id: buildingId }),

    leadSubmitted: (source: string, citySlug?: string) =>
      trackEvent("lead_submitted", "conversion", { source, city_slug: citySlug }),

    // Chat events
    chatOpened: () => trackEvent("chat_opened", "engagement"),

    chatMessageSent: (messageLength: number) =>
      trackEvent("chat_message_sent", "engagement", { message_length: messageLength }),

    // Navigation
    filterApplied: (filterType: string, value: unknown) =>
      trackEvent("filter_applied", "navigation", { filter_type: filterType, value }),

    mapInteraction: (action: "zoom" | "pan" | "marker_click") =>
      trackEvent("map_interaction", "engagement", { action }),

    // Errors
    error: (errorType: string, message: string, context?: Record<string, unknown>) =>
      trackEvent("error", "error", { error_type: errorType, message, ...context }),
  };

  return {
    trackPageView,
    trackPageDuration,
    trackBuildingView,
    trackEvent,
    track,
    sessionId: sessionId.current,
  };
}

// Hook for automatic page view tracking
export function usePageTracking(path: string, citySlug?: string) {
  const { trackPageView, trackPageDuration } = useAnalytics();

  useEffect(() => {
    trackPageView(path, citySlug);

    // Track duration on unmount
    return () => {
      trackPageDuration(path);
    };
  }, [path, citySlug, trackPageView, trackPageDuration]);
}
