import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MICROSITE_DOMAINS, micrositeLeadSchema, micrositeAnalyticsSchema } from "@/lib/validations";
import { corsHeaders, isAllowedOrigin } from "@/lib/microsite-cors";

const ROOT = join(process.cwd(), "microsites");

// Every directory in microsites/ that looks like a domain and holds an index.html.
const siteDirs = readdirSync(ROOT).filter(
  (d) => /\.com$/.test(d) && statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, "index.html"))
);

describe("microsite registry", () => {
  it("finds every deployed site on disk", () => {
    expect(siteDirs.length).toBeGreaterThanOrEqual(19);
  });

  it.each(siteDirs)("%s is registered in MICROSITE_DOMAINS", (domain) => {
    // An unregistered domain fails CORS and lead validation in production,
    // so a page can exist and silently drop every lead it captures.
    expect(MICROSITE_DOMAINS as readonly string[]).toContain(domain);
  });

  it.each(siteDirs)("%s posts leads under its own domain", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    const m = html.match(/data\.domain\s*=\s*"([^"]+)"/);
    expect(m, `${domain}: no data.domain assignment found`).toBeTruthy();
    expect(m![1]).toBe(domain);
  });

  it.each(siteDirs)("%s reports analytics under its own domain", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    const m = html.match(/var D\s*=\s*"([^"]+)"/);
    expect(m, `${domain}: no analytics domain found`).toBeTruthy();
    expect(m![1]).toBe(domain);
  });

  it.each(siteDirs)("%s canonical URL matches its domain", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    expect(html).toContain(`<link rel="canonical" href="https://${domain}/">`);
  });
});

describe("microsite lead schema", () => {
  const base = {
    building: "Test Building",
    name: "Jordan Rivera",
    email: "jordan@example.com",
  };

  it.each(MICROSITE_DOMAINS as readonly string[])("accepts a lead from %s", (domain) => {
    const r = micrositeLeadSchema.safeParse({ ...base, domain });
    expect(r.success).toBe(true);
  });

  it("rejects an unregistered domain", () => {
    const r = micrositeLeadSchema.safeParse({ ...base, domain: "not-ours.com" });
    expect(r.success).toBe(false);
  });

  // The honeypot is handled by the route, not the schema: validation has to
  // pass so the handler can return a normal-looking success without storing
  // anything. A schema rejection would 400 the bot and reveal the trap.
  it("lets a tripped honeypot through validation for the route to discard", () => {
    const r = micrositeLeadSchema.safeParse({
      ...base,
      domain: MICROSITE_DOMAINS[0],
      website: "http://spam.example",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.website).toBe("http://spam.example");
  });

  it.each(MICROSITE_DOMAINS as readonly string[])("accepts a pageview from %s", (domain) => {
    const r = micrositeAnalyticsSchema.safeParse({
      type: "pageview",
      domain,
      session_id: "abc123xyz",
      path: "/",
      referrer: null,
    });
    expect(r.success).toBe(true);
  });
});

describe("microsite origin guard", () => {
  const req = (origin?: string) =>
    new Request("https://staycio.com/api/microsite-leads", {
      method: "POST",
      headers: origin ? { origin } : {},
    });

  it("accepts every registered microsite origin", () => {
    for (const d of MICROSITE_DOMAINS) {
      expect(isAllowedOrigin(req(`https://${d}`)), d).toBe(true);
      expect(isAllowedOrigin(req(`https://www.${d}`)), `www.${d}`).toBe(true);
    }
  });

  it("rejects an unknown origin", () => {
    expect(isAllowedOrigin(req("https://not-ours.example"))).toBe(false);
  });

  // CORS is browser-side only, so a script with no Origin header would
  // otherwise reach the handler and write a lead.
  it("rejects a request with no Origin header", () => {
    expect(isAllowedOrigin(req())).toBe(false);
  });

  it("rejects a lookalike origin", () => {
    expect(isAllowedOrigin(req("https://biscayne18.com.evil.example"))).toBe(false);
    expect(isAllowedOrigin(req("http://biscayne18.com"))).toBe(false);
  });

  it("emits CORS headers only for allowed origins", () => {
    expect(corsHeaders(req("https://biscayne18.com"))["Access-Control-Allow-Origin"]).toBe(
      "https://biscayne18.com"
    );
    expect(corsHeaders(req("https://not-ours.example"))).toEqual({});
  });
});
