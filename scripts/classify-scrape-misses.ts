// Why does an active building have no available units? Opens each empty
// building's availability page in a real browser and sorts it into one bucket:
//
//   BOT_WALL        Cloudflare/Turnstile, captcha, or an access-denied page.
//                   Not something to engineer around: needs a feed or a
//                   licensed data source.
//   PRICES_VISIBLE  Rents are on the page (or in an embedded iframe) but the
//                   scraper extracted nothing: a fixable extractor gap.
//   WIDGET_IFRAME   Availability lives in a third-party widget (SightMap,
//                   Entrata, RentCafe...) with no prices in reach.
//   NO_PRICES       Real page, no rents anywhere (lease-by-inquiry, condo
//                   marketing site, or not leasing).
//   DEAD            DNS failure, timeout, or error page.
//
// Run with: npx tsx scripts/classify-scrape-misses.ts [city-name] > report.tsv

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { chromium, type Frame } from "playwright";

const PRICE = /\$\s?\d{1,2},?\d{3}(?!\d)/g;
const BOT_WALL =
  /challenges\.cloudflare\.com|cf-chl|turnstile|captcha|verify you are human|access denied|request unsuccessful|incapsula|perimeterx|px-captcha/i;
const WIDGETS = /sightmap|entrata|rentcafe|securecafe|realpage|knockrentals|funnelleasing|appfolio|yardi|engrain/i;
const UNITS_LINK = /floor[-_ ]?plans?|availability|apartments|pricing/i;

type Bucket = "BOT_WALL" | "PRICES_VISIBLE" | "WIDGET_IFRAME" | "NO_PRICES" | "DEAD";

async function frameText(f: Frame): Promise<string> {
  try {
    return await f.evaluate(() => document.body?.innerText ?? "");
  } catch {
    return "";
  }
}

async function main() {
  const cityFilter = process.argv[2]?.toLowerCase();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: buildings, error } = await supabase
    .from("buildings")
    .select("id, name, website_url, cities(name), units(is_available)")
    .eq("status", "active");
  if (error) throw error;

  const empty = (buildings ?? []).filter((b) => {
    const city = (Array.isArray(b.cities) ? b.cities[0] : b.cities) as { name: string } | null;
    const hasUnits = (b.units as { is_available: boolean }[]).some((u) => u.is_available);
    return !hasUnits && b.website_url && (!cityFilter || city?.name.toLowerCase() === cityFilter);
  });
  console.error(`Classifying ${empty.length} empty active buildings`);

  const browser = await chromium.launch();
  const counts: Record<string, number> = {};
  console.log(["city", "building", "bucket", "prices", "detail", "url"].join("\t"));

  for (const b of empty) {
    const city = ((Array.isArray(b.cities) ? b.cities[0] : b.cities) as { name: string } | null)?.name ?? "?";
    const page = await browser.newPage();
    let bucket: Bucket = "NO_PRICES";
    let detail = "";
    let prices = 0;
    let url = b.website_url as string;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      // Follow the site's own floor plans / availability link, like the scraper.
      const next = await page
        .$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href))
        .then((hrefs) => hrefs.find((h) => UNITS_LINK.test(h) && h.startsWith("http")))
        .catch(() => undefined);
      if (next && next !== url) {
        url = next;
        await page.goto(next, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      }
      await page.waitForTimeout(3000);

      const html = await page.content();
      const frames = page.frames();
      const frameUrls = frames.map((f) => f.url()).join(" ");
      let text = "";
      for (const f of frames) text += "\n" + (await frameText(f));
      prices = (text.match(PRICE) ?? []).length;
      const status = resp?.status() ?? 0;

      // Prices first: some sites load Turnstile only for a contact form and
      // still show their rents.
      if (prices >= 2) {
        bucket = "PRICES_VISIBLE";
      } else if (BOT_WALL.test(frameUrls) || BOT_WALL.test(html.slice(0, 20000)) || status === 403) {
        bucket = "BOT_WALL";
        detail = status === 403 ? "HTTP 403" : "challenge page";
      } else if (WIDGETS.test(frameUrls)) {
        bucket = "WIDGET_IFRAME";
        detail = (frameUrls.match(WIDGETS) ?? [""])[0];
      } else if (status >= 400) {
        bucket = "DEAD";
        detail = `HTTP ${status}`;
      }
    } catch (err) {
      bucket = "DEAD";
      detail = err instanceof Error ? err.message.split("\n")[0].slice(0, 80) : String(err);
    } finally {
      await page.close();
    }
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    console.log([city, b.name, bucket, prices, detail, url].join("\t"));
    await new Promise((r) => setTimeout(r, 1500));
  }

  await browser.close();
  console.error("\n" + JSON.stringify(counts));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
