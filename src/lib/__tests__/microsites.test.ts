import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MICROSITE_DOMAINS, micrositeLeadSchema, micrositeAnalyticsSchema } from "@/lib/validations";
import { corsHeaders, isAllowedOrigin } from "@/lib/microsite-cors";
import { telHref, whatsappHref } from "@/lib/utils";
import { MICROSITE_BUILDINGS, senderIdentityFor } from "@/lib/microsites";
import { MICROSITE_CATALOG_SLUG } from "@/lib/microsite-inventory";
// The generator's building records, read directly so the delivery-date guard
// below runs against the same source the pages are built from.
import generatedBuildings from "../../../microsites/_generator/buildings.js";

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

  // 0 of the first 65 leads had a phone number purely because no form asked.
  it.each(siteDirs)("%s asks for a phone number", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    expect(html, `${domain}: no phone input`).toMatch(
      /<input id="phone" name="phone" type="tel" required/
    );
  });

  // Miami leads arrive from Latin America, Europe and the Caribbean. A pattern
  // attribute or a US-shaped placeholder turns those visitors away at the form.
  it.each(siteDirs)("%s does not constrain phone to a US format", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    const input = html.match(/<input id="phone"[^>]*>/)?.[0] ?? "";
    expect(input, `${domain}: phone input has a pattern attribute`).not.toMatch(/pattern=/);
    expect(input, `${domain}: placeholder implies a US-only number`).toContain("+1");
    expect(html, `${domain}: label should mention WhatsApp`).toContain("Phone / WhatsApp");
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

  it("accepts a lead with a phone number", () => {
    const r = micrositeLeadSchema.safeParse({
      ...base,
      domain: MICROSITE_DOMAINS[0],
      phone: "(305) 555-0123",
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.phone).toBe("(305) 555-0123");
  });

  it("rejects a phone number that is obviously too short", () => {
    const r = micrositeLeadSchema.safeParse({
      ...base,
      domain: MICROSITE_DOMAINS[0],
      phone: "123",
    });
    expect(r.success).toBe(false);
  });

  // Forms mark phone required, but a cached copy of an older page must still
  // submit rather than 400 and lose the lead.
  it("still accepts a lead with no phone", () => {
    const r = micrositeLeadSchema.safeParse({ ...base, domain: MICROSITE_DOMAINS[0] });
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

// Both the admin row and the lead-alert email build tel:/sms: links. A dialer
// cannot parse a formatted number out of the href, so the digits must be
// stripped while the readable form stays as the link text.
describe("tel: link normalisation", () => {
  it("strips formatting from a US number", () => {
    expect(telHref("(305) 555-0123")).toBe("3055550123");
    expect(telHref("305.555.0123")).toBe("3055550123");
    expect(telHref("305 555 0123 ext 4")).toBe("30555501234");
  });

  it("keeps a leading + for international numbers", () => {
    expect(telHref("+44 20 7123 4567")).toBe("+442071234567");
    expect(telHref("+1 (305) 555-0123")).toBe("+13055550123");
  });

  it("drops a stray + that is not leading", () => {
    expect(telHref("305+555+0123")).toBe("3055550123");
  });
});


describe("international phone handling", () => {
  const INTL = [
    "+57 300 123 4567",     // Colombia
    "+52 55 1234 5678",     // Mexico
    "+55 11 91234-5678",    // Brazil
    "+54 9 11 1234-5678",   // Argentina
    "+58 412-1234567",      // Venezuela
    "+1 (305) 555-0123",    // US with country code
    "(305) 555-0123",       // US bare
    "+44 20 7123 4567",     // UK
    "+33 6 12 34 56 78",    // France
    "+509 3412 3456",       // Haiti
  ];

  it.each(INTL)("accepts %s", (phone) => {
    const r = micrositeLeadSchema.safeParse({
      domain: MICROSITE_DOMAINS[0],
      building: "Test",
      name: "Test",
      email: "t@example.com",
      phone,
    });
    expect(r.success).toBe(true);
  });

  it.each(["abcdefg", "---", "12", "()+ -"])("rejects %s as not a number", (phone) => {
    const r = micrositeLeadSchema.safeParse({
      domain: MICROSITE_DOMAINS[0],
      building: "Test",
      name: "Test",
      email: "t@example.com",
      phone,
    });
    expect(r.success).toBe(false);
  });

  it("builds wa.me links without + or separators", () => {
    expect(whatsappHref("+57 300 123 4567")).toBe("https://wa.me/573001234567");
    expect(whatsappHref("+55 11 91234-5678")).toBe("https://wa.me/5511912345678");
  });

  // A bare 10-digit US number has no country code; wa.me would reject it.
  it("assumes +1 for a bare 10-digit number", () => {
    expect(whatsappHref("(305) 555-0123")).toBe("https://wa.me/13055550123");
  });

  it("does not add +1 when a country code is already present", () => {
    expect(whatsappHref("+1 (305) 555-0123")).toBe("https://wa.me/13055550123");
    expect(whatsappHref("+44 20 7123 4567")).toBe("https://wa.me/442071234567");
  });

  it("keeps the + for tel: on international numbers", () => {
    expect(telHref("+57 300 123 4567")).toBe("+573001234567");
  });
});

describe("per-microsite sender identity", () => {
  it("presents the building a lead signed up on", () => {
    expect(senderIdentityFor("downtown6miami.com", "Staycio <hello@staycio.com>")).toEqual({
      from: '"Downtown 6" <downtown6miami@staycio.com>',
      label: "Downtown 6",
    });
    expect(senderIdentityFor("biscayne18.com", "Staycio <hello@staycio.com>")).toEqual({
      from: '"Biscayne 18" <biscayne18@staycio.com>',
      label: "Biscayne 18",
    });
  });

  it("covers every registered microsite domain", () => {
    for (const d of MICROSITE_DOMAINS) {
      const s = senderIdentityFor(d, "Staycio <hello@staycio.com>");
      expect(s.label, `${d} has no building name`).not.toBe("Staycio");
      expect(s.from, `${d} sends off staycio.com`).toContain("@staycio.com");
    }
  });

  // Sending stays on the one warmed, DKIM-verified domain; the microsite
  // domains have no reputation and would land in spam.
  it("never sends from a microsite domain itself", () => {
    for (const d of MICROSITE_DOMAINS) {
      expect(senderIdentityFor(d, "Staycio <hello@staycio.com>").from).not.toContain(`@${d}`);
    }
  });

  it("falls back to the default identity for non-microsite leads", () => {
    const fallback = "Staycio <hello@staycio.com>";
    expect(senderIdentityFor(null, fallback)).toEqual({ from: fallback, label: "Staycio" });
    expect(senderIdentityFor("someone-elses-site.com", fallback)).toEqual({
      from: fallback,
      label: "Staycio",
    });
  });

  // "Mr. C" / "No. 17" contain characters that break an unquoted From header.
  it("quotes display names so punctuation cannot break the header", () => {
    for (const d of MICROSITE_DOMAINS) {
      const { from } = senderIdentityFor(d, "x");
      expect(from, d).toMatch(/^"[^"]+" <[a-z0-9]+@staycio\.com>$/);
    }
  });

  it("keeps a building name for every domain the dashboard lists", () => {
    for (const d of MICROSITE_DOMAINS) {
      expect(MICROSITE_BUILDINGS[d], `${d} missing from MICROSITE_BUILDINGS`).toBeTruthy();
    }
  });
});

describe("microsite call-to-action placement", () => {
  // Each page carries exactly one form. The submit handler binds to the first
  // `form[data-lead]` it finds, and every field id (#name, #email, #phone) is
  // unique per document — a second form would silently orphan one of them.
  it.each(siteDirs)("%s has exactly one lead form", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    expect(html.match(/<form[\s>]/g)?.length ?? 0).toBe(1);
  });

  // The form sits at the bottom of a long page. The mid-page band is a second
  // place to act without scrolling past the whole building tour.
  it.each(siteDirs)("%s offers a mid-page route to the form", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    const mid = html.match(/<div class="midcta[^"]*">[\s\S]*?<\/div>\s*<\/div>/)?.[0];
    expect(mid, `${domain}: no mid-page CTA`).toBeTruthy();

    // It must point at an anchor the page actually defines.
    const target = mid!.match(/href="#([\w-]+)"/)?.[1];
    expect(target, `${domain}: mid-page CTA has no anchor`).toBeTruthy();
    expect(html, `${domain}: mid-page CTA points at #${target}, which does not exist`)
      .toContain(`id="${target}"`);
  });
});

describe("microsite availability strip", () => {
  it("only promises live inventory for buildings in the catalog", () => {
    for (const domain of siteDirs) {
      const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
      const claims = html.includes("data-inv");
      expect(
        claims,
        `${domain}: renders an availability strip but has no catalog slug to fill it`
      ).toBe(domain in MICROSITE_CATALOG_SLUG);
    }
  });

  it("every mapped domain is a registered microsite", () => {
    for (const domain of Object.keys(MICROSITE_CATALOG_SLUG)) {
      expect(MICROSITE_DOMAINS as readonly string[]).toContain(domain);
    }
  });

  // The strip starts hidden and is unhidden only once real data arrives. If it
  // ever shipped visible, an empty box would render on every page load.
  it.each(Object.keys(MICROSITE_CATALOG_SLUG))("%s ships its strip hidden", (domain) => {
    const html = readFileSync(join(ROOT, domain, "index.html"), "utf8");
    expect(html).toMatch(/<div class="inv" data-inv hidden>/);
  });
});

// The one failure this portfolio has already paid for: namdartowers.com carried
// 47% Google traffic and converted at ~1% while still selling a waitlist for a
// tower that had opened. `delivers` exists so that cannot recur unnoticed.
describe("microsite delivery dates", () => {
  // Availability entries carry no `delivers`; only the pre-leasing ones do, so
  // read it through a narrowing accessor rather than casting the whole record.
  const generated = generatedBuildings;
  const deliversOf = (b: (typeof generated)[number]): string | null =>
    "delivers" in b && typeof b.delivers === "string" ? b.delivers : null;
  const SOON_DAYS = 120;
  const daysOut = (iso: string) => (new Date(iso).getTime() - Date.now()) / 86_400_000;

  it("gives every pre-leasing building a delivery date or an explicit null", () => {
    for (const b of generated) {
      if (b.mode !== "waitlist") continue;
      expect(b, `${b.domain}: no delivers field`).toHaveProperty("delivers");
      const d = deliversOf(b);
      if (d !== null) {
        expect(Number.isNaN(new Date(d).getTime()), `${b.domain}: bad date`).toBe(false);
      }
    }
  });

  it("never sells a waitlist for a building that has already delivered", () => {
    const stale = generated
      .filter((b) => b.mode === "waitlist")
      .map((b) => ({ domain: b.domain, delivers: deliversOf(b) }))
      .filter((b) => b.delivers !== null && daysOut(b.delivers) <= 0);
    expect(
      stale.map((b) => `${b.domain} (delivered ${b.delivers})`),
      "rewrite these as mode:'availability', or push delivers out if the date slipped"
    ).toEqual([]);
  });

  it("runs first-access copy for anything inside the crossover window", () => {
    for (const b of generated) {
      const d = deliversOf(b);
      if (b.mode !== "waitlist" || d === null) continue;
      const html = readFileSync(join(ROOT, b.domain, "index.html"), "utf8");
      expect(
        html.includes("First Access"),
        `${b.domain}: delivers ${d} (${Math.round(daysOut(d))}d out) — regenerate the microsites`
      ).toBe(daysOut(d) <= SOON_DAYS);
    }
  });
});
