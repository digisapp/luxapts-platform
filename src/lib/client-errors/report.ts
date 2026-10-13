// Browser side of error tracking: sends what broke to /api/client-errors,
// which stores it for /admin/errors. Safe to call from anywhere on the client;
// it never throws.

import { storageGet } from "@/lib/safe-storage";
import type { ClientErrorInput } from "@/lib/validations";

export type ClientErrorSource = ClientErrorInput["source"];
type Extra = Record<string, string | number | boolean | null | undefined>;

const ENDPOINT = "/api/client-errors";
// A render loop can throw the same thing hundreds of times a second
const MAX_REPORTS_PER_PAGE_LOAD = 10;
const sent = new Set<string>();

/** Errors nobody here can fix or act on. */
export function isNoise(message: string, stack = "", filename = ""): boolean {
  // Browser extensions injecting into the page
  if (/(chrome|moz|safari(-web)?)-extension:\/\//.test(`${stack}\n${filename}`)) return true;
  // Benign layout notice Chrome reports as an error
  if (/^ResizeObserver loop/.test(message)) return true;
  // A cross-origin script threw; the browser hides every detail
  if (/^Script error\.?$/.test(message)) return true;
  // Flaky connections and navigating away mid-request
  if (/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource|The user aborted a request|AbortError)/.test(message)) {
    return true;
  }
  return false;
}

function describe(error: unknown): { message: string; name?: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name || "Error", name: error.name, stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error)?.slice(0, 500) || String(error) };
  } catch {
    return { message: String(error) };
  }
}

export function reportClientError(source: ClientErrorSource, error: unknown, extra?: Extra): void {
  if (typeof window === "undefined") return;
  try {
    const { message: raw, name, stack } = describe(error);
    const message = raw.slice(0, 1000);
    const filename = typeof extra?.filename === "string" ? extra.filename : "";
    if (isNoise(message, stack, filename)) return;

    const key = `${source}:${message}`;
    if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE_LOAD) return;
    sent.add(key);

    const cleanExtra = extra
      ? Object.fromEntries(
          Object.entries(extra)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 2000) : v])
        )
      : {};

    const body = JSON.stringify({
      source,
      message,
      name: name?.slice(0, 100),
      stack: stack?.slice(0, 8000),
      path: window.location.pathname || "/",
      session_id: storageGet("session", "lux_session_id"),
      ...(Object.keys(cleanExtra).length > 0 && { extra: cleanExtra }),
    });

    // sendBeacon survives the page unloading (a crash often ends in a reload)
    const queued = navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }));
    if (!queued) {
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    // Reporting must never break the page it is reporting on
  }
}
