import { describe, it, expect } from "vitest";
import { classifyReferral, referralLabel } from "@/lib/analytics/referral";
import { detectCrawler } from "@/lib/analytics/crawlers";
import { buildAiSearchReport } from "@/lib/analytics/ai-search";

describe("classifyReferral", () => {
  it("credits ChatGPT from its utm tag even with no referrer", () => {
    expect(classifyReferral("chatgpt.com", [null, null])).toEqual({ source: "chatgpt", detail: "chatgpt.com" });
  });

  it("prefers the utm tag over a referrer", () => {
    expect(classifyReferral("chatgpt.com", ["https://www.google.com/"]).source).toBe("chatgpt");
  });

  it("reads search engines and assistants from the referrer", () => {
    expect(classifyReferral(null, ["https://www.google.com/"]).source).toBe("google");
    expect(classifyReferral(null, ["https://www.google.co.uk/"]).source).toBe("google");
    expect(classifyReferral(null, ["https://www.bing.com/"]).source).toBe("bing");
    expect(classifyReferral(null, ["https://www.perplexity.ai/"]).source).toBe("perplexity");
    expect(classifyReferral(null, ["https://gemini.google.com/"]).source).toBe("gemini");
    expect(classifyReferral(null, ["https://chatgpt.com/"]).source).toBe("chatgpt");
    expect(classifyReferral(null, ["android-app://com.google.android.gm/"]).source).toBe("email");
  });

  it("skips the site's own pages and uses the first outside referrer", () => {
    expect(
      classifyReferral(null, ["https://staycio.com/search", null, "https://duckduckgo.com/"]).source
    ).toBe("duckduckgo");
  });

  it("recognises the building microsites by utm tag or referrer", () => {
    expect(classifyReferral("downtown6miami", [])).toEqual({ source: "microsite", detail: "downtown6miami" });
    expect(classifyReferral(null, ["https://namdartowers.com/"])).toEqual({ source: "microsite", detail: "namdartowers" });
  });

  it("keeps unknown sources visible instead of calling them direct", () => {
    expect(classifyReferral("newsletter", [])).toEqual({ source: "other", detail: "newsletter" });
    expect(classifyReferral(null, ["https://www.reddit.com/r/nyc"])).toEqual({ source: "other", detail: "www.reddit.com" });
  });

  it("calls a visit with no tag and no outside referrer direct", () => {
    expect(classifyReferral(null, [])).toEqual({ source: "direct", detail: null });
    expect(classifyReferral("", ["https://staycio.com/"])).toEqual({ source: "direct", detail: null });
  });

  it("labels sources for the admin", () => {
    expect(referralLabel("chatgpt")).toBe("ChatGPT");
    expect(referralLabel("other", "www.reddit.com")).toBe("reddit.com");
    expect(referralLabel(null)).toBeNull();
  });
});

describe("detectCrawler", () => {
  it("names the AI crawlers by their documented tokens", () => {
    expect(
      detectCrawler("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot")
    ).toBe("ChatGPT-User");
    expect(detectCrawler("Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)")).toBe("OAI-SearchBot");
    expect(detectCrawler("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe("GPTBot");
    expect(detectCrawler("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe("PerplexityBot");
    expect(detectCrawler("Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)")).toBe("ClaudeBot");
    expect(detectCrawler("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe("Bingbot");
  });

  it("ignores people and Googlebot", () => {
    expect(
      detectCrawler(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1"
      )
    ).toBeNull();
    expect(detectCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBeNull();
    expect(detectCrawler(null)).toBeNull();
  });
});

describe("buildAiSearchReport", () => {
  const now = Date.parse("2026-10-22T18:00:00Z"); // a Thursday

  it("counts AI visits per week and their landing pages", () => {
    const report = buildAiSearchReport(
      {
        sessions: [
          { session_id: "a", first_seen_at: "2026-10-22T16:09:00Z", utm_source: "chatgpt.com", landing_page: "/buildings/3eleven", page_views_count: 3 },
          { session_id: "b", first_seen_at: "2026-10-21T00:32:00Z", utm_source: "chatgpt.com", landing_page: "/buildings/3eleven", page_views_count: 1 },
          { session_id: "c", first_seen_at: "2026-10-20T10:00:00Z", utm_source: null, landing_page: "/", page_views_count: 1 },
          { session_id: "d", first_seen_at: "2026-10-14T10:00:00Z", utm_source: null, landing_page: "/", page_views_count: 2 },
        ],
        referrers: [
          { session_id: "c", referrer: "https://www.google.com/" },
          { session_id: "d", referrer: "https://staycio.com/" },
        ],
        leads: [],
        crawlerStats: [{ bot: "ChatGPT-User", hits_7d: 4, hits_total: 9, last_seen: "2026-10-22T15:00:00Z" }],
        chatgptUserPaths: [{ path: "/buildings/3eleven", hits: 5, last_seen: "2026-10-22T15:00:00Z" }],
      },
      now
    );

    expect(report.weeks).toHaveLength(8);
    const thisWeek = report.weeks.at(-1)!;
    expect(thisWeek.week).toBe("2026-10-19");
    expect(thisWeek).toMatchObject({ ai: 2, search: 1, total: 3 });
    expect(report.weeks.at(-2)).toMatchObject({ week: "2026-10-12", ai: 0, total: 1 });
    expect(report.aiLandingPages).toEqual([{ path: "/buildings/3eleven", sessions: 2 }]);
    expect(report.sourceTotals.find((s) => s.source === "chatgpt")).toEqual({ source: "chatgpt", sessions: 2, engaged: 1 });
    expect(report.sourceTotals.find((s) => s.source === "direct")?.sessions).toBe(1);
    expect(report.crawlers[0]).toEqual({ bot: "ChatGPT-User", hits7d: 4, hits30d: 9, lastSeen: "2026-10-22T15:00:00Z" });
    expect(report.chatgptUserPages).toEqual([{ path: "/buildings/3eleven", hits: 5 }]);
  });
});
