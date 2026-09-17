# Google Search Console checklist

Everything in this file is **manual and account-gated** — it cannot be done from
the codebase. The engineering side of the SEO work is deployed; nothing on
staycio.com will rank until the steps below are done, because Google has to be
told the pages exist.

Work top to bottom. The whole list is roughly one sitting.

---

## 0. Before you start

Sign in to <https://search.google.com/search-console> with the Google account
that should own these properties long-term (not a personal one you'll lose).

---

## 1. staycio.com — the main site

### 1a. Confirm the property exists and is verified

If `staycio.com` isn't listed, add it as a **Domain property** (not a URL-prefix
property) — a domain property covers `www`, non-`www`, and every subdomain in
one go. Verification is a single TXT record at GoDaddy.

> While you're in GoDaddy's DNS panel, the 5 records for `inbound.staycio.com`
> are still pending. Lead **replies** go nowhere until those exist. Check with:
> `npx tsx scripts/check-inbound-dns.ts`

### 1b. Submit the sitemap

**Sitemaps → Add a new sitemap →** `sitemap.xml`

It should report ~356 URLs:

| Type | Count | Notes |
|---|---|---|
| Buildings | 247 | now `/buildings/maple-terrace`, not a UUID |
| Neighborhoods | 62 | only ones with inventory; shared slugs carry `?city=` |
| Bedroom facets | 32 | new — `/cities/miami/2-bedroom-apartments` |
| Cities | 8 | only cities with listings |
| Static | 7 | home, search, hubs, legal |

If the count is far lower, the sitemap is serving a stale ISR entry — it
regenerates hourly on its own, so just re-check after an hour.

### 1c. Request indexing for the priority pages

**URL Inspection** (top search bar) → paste URL → **Request indexing**.
There's a daily quota (~10–12), so spend it in this order. The rest will be
discovered through the sitemap and internal links.

**Day 1 — hubs and the biggest facets:**
1. `https://staycio.com/`
2. `https://staycio.com/search`
3. `https://staycio.com/cities/new-york`
4. `https://staycio.com/cities/miami`
5. `https://staycio.com/cities/new-york/2-bedroom-apartments`
6. `https://staycio.com/cities/new-york/1-bedroom-apartments`
7. `https://staycio.com/cities/miami/2-bedroom-apartments`
8. `https://staycio.com/cities/miami/1-bedroom-apartments`
9. `https://staycio.com/cities/new-york/studio-apartments`
10. `https://staycio.com/cities/miami/studio-apartments`

**Day 2 — remaining cities and their best facets:**
`/cities/brooklyn`, `/cities/dallas`, `/cities/los-angeles`, `/cities/austin`,
`/cities/atlanta`, `/cities/nashville`, plus each one's 1- and 2-bedroom facet.

**Day 3 — the neighborhoods with the most inventory**, then let the sitemap
carry the 247 building pages.

### 1d. Check that Google sees what we see

For one building page (e.g. `https://staycio.com/buildings/maple-terrace`), in
URL Inspection hit **Test live URL → View tested page → Screenshot / HTML** and
confirm the About and FAQ sections are present. If the page renders but those
sections are missing, something regressed — the pre-fix version was an `h1` and
a unit table and nothing else, and that is what kept the site out of the index.

### 1e. Confirm the redirects are clean

Old UUID links (there are many in the 65 stored leads and in past emails) should
308 to the slug. Spot-check one:

```bash
curl -sS -o /dev/null -w "%{http_code} -> %{redirect_url}\n" \
  https://staycio.com/buildings/027fe1bb-7801-4c2b-9d9a-9a0440a38128
# expect: 308 -> https://staycio.com/buildings/maple-terrace
```

---

## 2. The 19 microsite domains

The microsites already rank and already convert (~22%; all 65 leads to date came
from them). **Wave 2's 13 domains are not in Search Console at all, so they rank
for nothing.** This is the single highest-value item in this file.

For each domain: add as a **Domain property**, verify via its GoDaddy TXT
record, then **Sitemaps → Add** `sitemap.xml`, then **URL Inspection → Request
indexing** on the homepage.

### Wave 1 — confirm these are verified and submitted

- [ ] downtown6miami.com ← the proven performer (60 of the 65 leads)
- [ ] downtown5miami.com
- [ ] namdartowers.com
- [ ] biscayne18.com
- [ ] jadebrickell.com
- [ ] sentralbrickell.com

### Wave 2 — these are live but unknown to Google

- [ ] 2600biscaynemiami.com
- [ ] 3333biscaynemiami.com
- [ ] artplazaapartments.com
- [ ] jemmiamiapartments.com
- [ ] kenectmiamiapartments.com
- [ ] maizonbrickell.com
- [ ] miamiworldtowerapartments.com
- [ ] midtown5apartments.com
- [ ] muzemet.com
- [ ] panoramatowerbrickell.com
- [ ] perrinbrickell.com
- [ ] remitheriver.com
- [ ] urban22edgewater.com

---

## 3. What to expect, and when

| When | What should happen |
|---|---|
| 24–72 h | Requested URLs move from "Discovered" to "Crawled" |
| 1–2 weeks | City and facet pages start appearing in **Performance → Queries** |
| 2–6 weeks | Building pages index in bulk via the sitemap |
| 4–8 weeks | Microsite domains begin ranking for their exact-match building names |

**Coverage is the number to watch.** In **Pages**, the bucket that mattered was
*"Crawled – currently not indexed"* — that's Google saying the page isn't worth
an index slot. If building pages still land there after a few weeks, the content
per page is still too thin and the next lever is real editorial copy for the
buildings that matter, not more technical SEO.

---

## 4. Known gaps this work did NOT fix

These are content and data problems, not code problems. They cap how well the
site can rank regardless of the technical setup.

1. **133 of 247 active buildings have no photos at all.** A listing page with no
   image loses the click even when it ranks. This is the biggest remaining one.
2. **Only 588 of 4,524 listings have a price newer than 30 days.** Freshness is
   the site's actual differentiator and most of the catalogue can't claim it.
   See the Browserless/render-path issue — 147 of 258 scrape-enabled buildings
   extract zero units in production.
3. **213 of 247 buildings have no editorial description.** The About section now
   generates real prose from stored facts, which fixes the thin-page problem,
   but a human paragraph on the top ~30 buildings would still rank better.
4. **5 cities have zero listings** (chicago, boston, seattle, denver,
   san-francisco). They're correctly `noindex` until they have inventory — but
   they're also dead weight in the city picker.
