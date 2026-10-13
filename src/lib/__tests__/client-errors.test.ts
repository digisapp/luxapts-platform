import { describe, it, expect } from "vitest";
import { isNoise } from "@/lib/client-errors/report";
import { pathOnly, scrubText } from "@/lib/client-errors/scrub";
import { groupClientErrors, summarizeClientErrors, type ClientErrorRow } from "@/lib/client-errors/group";
import { isBotUserAgent, osMajorVersion, parseUserAgent } from "@/lib/analytics/user-agent";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

describe("parseUserAgent", () => {
  it("doesn't call an iPhone a Mac or an Android phone Linux", () => {
    expect(parseUserAgent(IPHONE)).toEqual({ browser: "Safari", os: "iOS" });
    expect(parseUserAgent(ANDROID)).toEqual({ browser: "Chrome", os: "Android" });
  });

  it("tells Edge from the Chrome it claims to be", () => {
    expect(parseUserAgent(EDGE)).toEqual({ browser: "Edge", os: "Windows" });
    expect(parseUserAgent(MAC_SAFARI)).toEqual({ browser: "Safari", os: "macOS" });
  });

  it("reads the major OS version on phones", () => {
    expect(osMajorVersion(IPHONE)).toBe("17");
    expect(osMajorVersion(ANDROID)).toBe("14");
    expect(osMajorVersion(MAC_SAFARI)).toBeNull();
  });
});

describe("isBotUserAgent", () => {
  it("skips crawlers, previewers and headless browsers, not people", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 HeadlessChrome/129.0")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(IPHONE)).toBe(false);
    expect(isBotUserAgent(EDGE)).toBe(false);
  });
});

describe("isNoise", () => {
  it("drops errors nobody here can fix", () => {
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.")).toBe(true);
    expect(isNoise("Script error.")).toBe(true);
    expect(isNoise("Failed to fetch")).toBe(true);
    expect(isNoise("x is undefined", "at chrome-extension://abc/content.js:1:2")).toBe(true);
  });

  it("keeps real errors", () => {
    expect(isNoise("Cannot read properties of undefined (reading 'map')", "at /_next/static/chunks/app.js:1:2")).toBe(false);
    expect(isNoise("Failed to initialize WebGL.")).toBe(false);
  });
});

describe("scrubText / pathOnly", () => {
  it("removes emails, query strings and long numbers before storage", () => {
    expect(scrubText("Invalid login for jane.doe+x@gmail.com")).toBe("Invalid login for [email]");
    expect(scrubText("GET https://staycio.com/api/search?q=2br%20brickell&token=abc failed")).toBe(
      "GET https://staycio.com/api/search?… failed"
    );
    expect(scrubText("lead 3055551234 not found")).toBe("lead [number] not found");
    expect(scrubText("at app.js:53627:46")).toBe("at app.js:53627:46");
  });

  it("keeps only the path", () => {
    expect(pathOnly("/search?q=studio&city=miami#map")).toBe("/search");
    expect(pathOnly("?x=1")).toBe("/");
  });
});

describe("groupClientErrors", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const row = (at: string, session: string, props: ClientErrorRow["properties"]): ClientErrorRow => ({
    created_at: at,
    session_id: session,
    properties: props,
  });
  const crash = { source: "boundary", message: "x is undefined", path: "/search", browser: "Chrome", os: "Windows", device: "desktop" };
  const rows = [
    row("2026-10-14T11:00:00Z", "s1", { ...crash, release: "abc1234" }),
    row("2026-10-13T09:00:00Z", "s1", crash),
    row("2026-10-10T09:00:00Z", "s2", { ...crash, path: "/buildings/x", browser: "Safari", os: "iOS 17", device: "mobile" }),
    row("2026-10-12T09:00:00Z", "s3", { source: "map", message: "Failed to initialize WebGL.", path: "/search" }),
    row("2026-10-12T10:00:00Z", "none", { source: "map", message: "Failed to initialize WebGL.", path: "/search" }),
  ];

  it("groups by source and message, newest first, with sessions and 24h counts", () => {
    const groups = groupClientErrors(rows, now);
    expect(groups.map((g) => g.source)).toEqual(["boundary", "map"]);
    const [boundary, map] = groups;
    expect(boundary).toMatchObject({ count: 3, sessions: 2, last24h: 1, lastSeen: "2026-10-14T11:00:00Z", firstSeen: "2026-10-10T09:00:00Z" });
    expect(boundary.topPaths[0]).toEqual({ label: "/search", count: 2 });
    expect(boundary.releases).toEqual(["abc1234"]);
    expect(map.sessions).toBe(2); // one known session + one anonymous report
  });

  it("keeps the map's browser limitation out of the error totals", () => {
    expect(summarizeClientErrors(rows, now)).toEqual({
      last24h: 1,
      last7d: 3,
      sessions7d: 2,
      mapUnavailableSessions: 2,
    });
  });
});
