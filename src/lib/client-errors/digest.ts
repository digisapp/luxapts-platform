// The daily "what broke" email (/api/cron/error-digest). Plain and short,
// like the rest of Staycio's internal mail: a text header, the list, a link.

import { escapeHtml } from "@/lib/utils";
import type { ClientErrorGroup, ClientErrorSummary } from "./group";

const DAY = 24 * 60 * 60 * 1000;
const MAX_LISTED = 10;
const ADMIN_URL = "https://staycio.com/admin/errors";

const SOURCE_LABELS: Record<string, string> = {
  boundary: "Error screen",
  root: "Whole-site crash",
  window: "Uncaught error",
  promise: "Unhandled promise",
};

export interface ErrorDigest {
  subject: string;
  html: string;
  text: string;
}

/** null when there is nothing to send: no errors in the last 24 hours (a map-only day is not news). */
export function buildErrorDigest(
  groups: ClientErrorGroup[],
  summary: ClientErrorSummary,
  now: number
): ErrorDigest | null {
  const recent = groups
    .filter((g) => g.source !== "map" && g.last24h > 0)
    .sort((a, b) => b.last24h - a.last24h || b.lastSeen.localeCompare(a.lastSeen));
  if (recent.length === 0) return null;

  const isNew = (g: ClientErrorGroup) => now - Date.parse(g.firstSeen) < DAY;
  const newCount = recent.filter(isNew).length;
  // Sessions, not reports: one visitor can report it on every page load
  const mapToday = groups.find((g) => g.source === "map")?.sessions24h ?? 0;
  const errors = summary.last24h;

  const subject =
    `Staycio: ${errors} browser ${errors === 1 ? "error" : "errors"} in the last 24 hours` +
    (newCount > 0 ? ` (${newCount} new)` : "");

  const lines = recent.slice(0, MAX_LISTED).map((g) => ({
    label: SOURCE_LABELS[g.source] ?? g.source,
    message: g.message,
    detail: `${g.last24h}× today · ${g.sessions24h} ${g.sessions24h === 1 ? "session" : "sessions"} · ${g.topPaths[0]?.label ?? "/"}`,
    fresh: isNew(g),
  }));
  const more = recent.length - lines.length;
  const stats =
    `${recent.length} distinct ${recent.length === 1 ? "error" : "errors"}` +
    (mapToday > 0 ? ` · ${mapToday} ${mapToday === 1 ? "visitor" : "visitors"} couldn't show the map` : "");

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;max-width:600px;line-height:1.5">
  <p style="margin:0 0 4px;font-size:13px;color:#6b6b6b">Staycio · Site errors</p>
  <h1 style="margin:0 0 6px;font-size:20px;font-weight:600">${escapeHtml(subject.replace(/^Staycio: /, ""))}</h1>
  <p style="margin:0 0 20px;font-size:14px;color:#6b6b6b">${escapeHtml(stats)}</p>
  ${lines
    .map(
      (l) => `<div style="margin:0 0 14px;padding:0 0 14px;border-bottom:1px solid #e7e7e5">
    <p style="margin:0 0 4px;font-size:12px;color:#6b6b6b">${escapeHtml(l.label)}${l.fresh ? ' · <strong style="color:#b91c1c">new</strong>' : ""}</p>
    <p style="margin:0 0 4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;word-break:break-word">${escapeHtml(l.message)}</p>
    <p style="margin:0;font-size:13px;color:#6b6b6b">${escapeHtml(l.detail)}</p>
  </div>`
    )
    .join("\n  ")}
  ${more > 0 ? `<p style="margin:0 0 14px;font-size:13px;color:#6b6b6b">and ${more} more</p>` : ""}
  <p style="margin:20px 0"><a href="${ADMIN_URL}" style="display:inline-block;background:#14212b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Open Site Errors</a></p>
  <p style="margin:0;font-size:12px;color:#6b6b6b">Sent once a day, only when visitors hit errors.</p>
</div>`;

  const text = [
    subject.replace(/^Staycio: /, ""),
    stats,
    "",
    ...lines.map((l) => `${l.fresh ? "[new] " : ""}${l.label}: ${l.message}\n  ${l.detail}`),
    ...(more > 0 ? [`and ${more} more`] : []),
    "",
    `Open Site Errors: ${ADMIN_URL}`,
  ].join("\n");

  return { subject, html, text };
}
