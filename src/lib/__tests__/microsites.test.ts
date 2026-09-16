import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MICROSITE_DOMAINS, micrositeLeadSchema, micrositeAnalyticsSchema } from "@/lib/validations";

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

  it("rejects a tripped honeypot", () => {
    const r = micrositeLeadSchema.safeParse({
      ...base,
      domain: MICROSITE_DOMAINS[0],
      website: "http://spam.example",
    });
    expect(r.success).toBe(false);
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
