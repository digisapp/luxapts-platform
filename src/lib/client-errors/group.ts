// Turns stored browser error reports (analytics_events, event_name
// "client_error") into the groups and totals /admin/errors shows.

export interface ClientErrorProperties {
  source?: string;
  message?: string;
  name?: string | null;
  stack?: string | null;
  path?: string;
  browser?: string;
  os?: string;
  device?: string;
  release?: string | null;
  extra?: Record<string, unknown>;
}

export interface ClientErrorRow {
  session_id: string;
  created_at: string;
  properties: ClientErrorProperties | null;
}

export interface Tally {
  label: string;
  count: number;
}

export interface ClientErrorGroup {
  key: string;
  source: string;
  message: string;
  count: number;
  /** Distinct visitor sessions that hit it (reports without one count once each) */
  sessions: number;
  last24h: number;
  /** Sessions that hit it in the last 24 hours */
  sessions24h: number;
  firstSeen: string;
  lastSeen: string;
  topPaths: Tally[];
  topBrowsers: Tally[];
  devices: Tally[];
  releases: string[];
  /** The most recent occurrence, for its stack and details */
  sample: ClientErrorProperties;
}

export interface ClientErrorSummary {
  last24h: number;
  last7d: number;
  sessions7d: number;
  /** Visitor sessions whose browser couldn't draw the map (no WebGL2) */
  mapUnavailableSessions: number;
}

const DAY = 24 * 60 * 60 * 1000;

function tally(values: string[], limit: number): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function sessionCount(rows: ClientErrorRow[]): number {
  const ids = new Set<string>();
  let anonymous = 0;
  for (const r of rows) {
    if (!r.session_id || r.session_id === "none") anonymous++;
    else ids.add(r.session_id);
  }
  return ids.size + anonymous;
}

/** One group per source + message, most recently seen first. */
export function groupClientErrors(rows: ClientErrorRow[], now: number = Date.now()): ClientErrorGroup[] {
  const byKey = new Map<string, ClientErrorRow[]>();
  for (const row of rows) {
    const p = row.properties ?? {};
    const key = `${p.source ?? "unknown"}\u0000${p.message ?? ""}`;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const groups: ClientErrorGroup[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const latest = sorted[0].properties ?? {};
    groups.push({
      key,
      source: latest.source ?? "unknown",
      message: latest.message || "(no message)",
      count: sorted.length,
      sessions: sessionCount(sorted),
      last24h: sorted.filter((r) => now - Date.parse(r.created_at) < DAY).length,
      sessions24h: sessionCount(sorted.filter((r) => now - Date.parse(r.created_at) < DAY)),
      firstSeen: sorted[sorted.length - 1].created_at,
      lastSeen: sorted[0].created_at,
      topPaths: tally(sorted.map((r) => r.properties?.path || "/"), 3),
      topBrowsers: tally(
        sorted.map((r) => `${r.properties?.browser ?? "Unknown"} · ${r.properties?.os ?? "Unknown"}`),
        3
      ),
      devices: tally(sorted.map((r) => r.properties?.device ?? "unknown"), 3),
      releases: [...new Set(sorted.map((r) => r.properties?.release).filter((v): v is string => !!v))].slice(0, 5),
      sample: latest,
    });
  }

  return groups.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function summarizeClientErrors(rows: ClientErrorRow[], now: number = Date.now()): ClientErrorSummary {
  const within = (r: ClientErrorRow, ms: number) => now - Date.parse(r.created_at) < ms;
  const week = rows.filter((r) => within(r, 7 * DAY) && r.properties?.source !== "map");
  return {
    last24h: rows.filter((r) => within(r, DAY) && r.properties?.source !== "map").length,
    last7d: week.length,
    sessions7d: sessionCount(week),
    mapUnavailableSessions: sessionCount(rows.filter((r) => r.properties?.source === "map")),
  };
}
