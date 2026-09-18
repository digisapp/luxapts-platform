# Staycio Building Microsites

Six standalone landing pages, one per owned domain. Each folder contains a single self-contained `index.html` — no build step, no dependencies, no external assets. Deploy anywhere that serves static files.

| Folder | Building | Page type |
|---|---|---|
| `namdartowers.com/` | Namdar Towers (Downtown, 680 units leasing 2026) | Waitlist |
| `downtown6miami.com/` | Downtown 6 (Melo, 824 units, Q4 2026) | Waitlist |
| `jadebrickell.com/` | Jade at Brickell Bay (rent + sale intent) | Listings request |
| `sentralbrickell.com/` | Sentral-managed tower at One Twenty Brickell (2027) | Early interest list |
| `perrinbrickell.com/` | The Perrin (Brickell, 310 units, 2027) | Waitlist |
| `midtown5apartments.com/` | Midtown 5 (operating, from ~$2,462/mo) | Availability check |

## Lead capture — wired to Staycio's Supabase

Forms now POST JSON to **`https://staycio.com/api/microsite-leads`** (new route in `luxapts-platform/src/app/api/microsite-leads/route.ts`). Leads flow into the platform's existing `leads` table and pipeline: they appear in the admin leads dashboard, get auto-assigned to an agent, fire a Resend email notification, and link a `lead_targets` row when the building exists in the catalog. Includes CORS for the six microsite domains, the shared rate limiter, Zod validation, and a honeypot field for bots.

**One-time step:** run `supabase/migrations/021_microsite_leads.sql` in the Supabase Dashboard SQL editor. It adds `'microsite'` as an allowed lead source plus a `source_detail` column (stores the originating domain). *The route works before the migration too* — it falls back to `source='web_form'` with attribution in `notes` — but the migration gives you clean per-domain filtering.

Deploy the updated platform to staycio.com before pointing live microsites at it — the endpoint must exist in production.

## Photos

Heroes currently use **Unsplash placeholder images** (hotlinked from images.unsplash.com — free license, verified live Aug 2026), tinted with each site's brand gradient. Swap for real building photos when you have rights (your own shots or partner marketing assets) — just replace the `url(...)` in each file's `.hero` style. Do not hotlink Apartments.com/Zillow images.

## Deploying (recommended: Vercel, free)

```bash
cd microsites/namdartowers.com
npx vercel --prod        # repeat per folder, or use the dashboard drag-and-drop
```

Then point DNS at GoDaddy for each domain: add an `A` record `@ → 76.76.21.21` and `CNAME` `www → cname.vercel-dns.com`, and add the custom domain in the Vercel project settings. (Netlify or Cloudflare Pages work identically.)

## After launch

- Add each domain to [Google Search Console](https://search.google.com/search-console) and request indexing — these are single pages, no sitemap needed.
- The pre-leasing pages (Namdar, Downtown 6, Sentral, Perrin) should be refreshed when leasing actually opens: real rents, floor plans, leasing-office link. That's the moment traffic spikes.
- Every page cross-links to staycio.com with UTM tags (`utm_source=<domain>`), so microsite → platform traffic is trackable in analytics.

## Positioning note

Every page is explicitly labeled an **independent rental information resource** (header badge + footer disclaimer) and never impersonates the building or its leasing office. Keep it that way — it's what makes these safe to run pre-partnership and easy to pitch as a lead-gen asset to the buildings afterward. The `sentralbrickell.com` page additionally discloses that the building name is anticipated, not officially announced.

## Facts baked into the pages (as of Aug 2026)

- Namdar: 2×43 stories, Tower 1 = 680 units at 55 NE 2nd St (TCO early 2026), Tower 2 = 714 units est. 2028.
- Downtown 6: 824 units, 46 NE 6th St, topped off Mar 2026, completion Q4 2026.
- Jade: 48 floors, 340 units, built 2004, rentals avg ~$12,350/mo, sales ~$1.04M–$5.38M (~$1,078/sqft).
- One Twenty Brickell rental tower: 537 units, Sentral-managed, anticipated 2027 (name unconfirmed).
- The Perrin: 26 stories, 310 units, broke ground 2026, planned 2027.
- Midtown 5: 24 stories, 400 units, 538–1,501 sqft, from ~$2,462/mo, 3201 NE 1st Ave, ~29 units available.

Update these when re-verifying — rents and availability move weekly.

## Second wave — 13 generated sites (added 2026-09-16)

Unlike the six hand-built pages above, these are produced from a template by
`_generator/build.js`. Re-run it after editing `_generator/buildings.js`:

```bash
node microsites/_generator/build.js
```

It writes `index.html`, `robots.txt`, `sitemap.xml` and the Search Console
verification file per domain, and resizes each image to its display width
(heroes land ~360KB instead of ~1MB — these pages live or die on search
ranking, so Largest Contentful Paint matters).

| Folder | Building | Page type |
|---|---|---|
| `2600biscaynemiami.com/` | 2600 Biscayne (Edgewater, 400 units, Oak Row Equities) | Waitlist |
| `jemmiamiapartments.com/` | JEM Miami Worldcenter (Miami Worldcenter, 530 units, Naftali Group) | Waitlist |
| `kenectmiamiapartments.com/` | Kenect Miami (Miami Worldcenter, 450 units, Akara Partners) | Waitlist |
| `3333biscaynemiami.com/` | 3333 Biscayne (Edgewater, 667 units, Beitel Group) | Waitlist |
| `biscayne18.com/` | Biscayne 18 (Edgewater, 1,178 units, Melo Group) | Waitlist |
| `urban22edgewater.com/` | Urban 22 (Edgewater, 441 units, Melo Group) | Waitlist |
| `downtown5miami.com/` | Downtown 5th (Downtown Miami, 1,042 units, Melo Group) | Availability |
| `panoramatowerbrickell.com/` | Panorama Tower (Brickell, 821 units, Florida East Coast Realty) | Availability |
| `maizonbrickell.com/` | Maizon Brickell (Brickell) | Availability |
| `muzemet.com/` | Muze at Met (Downtown Miami, 391 units) | Availability |
| `remitheriver.com/` | Remi on the River (Miami River District, 342 units, Greystar) | Availability |
| `artplazaapartments.com/` | Art Plaza (Arts & Entertainment District, 667 units, Melo Group) | Availability |
| `miamiworldtowerapartments.com/` | Miami World Tower (Miami Worldcenter, 560 units, Lalezarian Properties) | Availability |

Domains were chosen by screening for two things together: a large market-rate
rental building, and a weak or absent official website. That pairing is what
made `downtown6miami.com` work — Melo owns `downtown6.com` but it serves a
parked Bluehost placeholder, so the microsite became the best page on the web
for that building and drew 179 Google referrals and 60 of the portfolio's 65 leads.
Buildings whose exact-match domain resolves to a real leasing site are much
harder wins and are marked as availability pages rather than waitlists.

Nothing income-restricted is included. Wyn Park was dropped for that reason
(40% of its units are capped at 120% AMI under the Live Local Act), and
Grand Station was dropped because its official site places it at 240 N Miami
Ave downtown, not Wynwood as the catalog claims.

## Lead capture: which CTA a page gets, and why

All 65 leads to date came from pre-construction pages — 60 from
`downtown6miami.com` alone, where 37 of them knowingly chose a Q4 2026 move-in.
The operating buildings produced zero. That gap is **traffic, not copy**: the
pre-construction domains rank because the official site is parked, while the
operating buildings have real leasing sites that own their search results.

So the waitlist framing stays. Its trade is honest — the information does not
exist yet anywhere, so the list is the only way to get it — and rewriting those
pages as "see what's open right now" would promise something a building
delivering in 2028 cannot deliver.

`build.js` derives the CTA tier from `delivers`, never from `mode` alone:

| Tier | When | CTA |
|---|---|---|
| `waitlist` | more than 120 days out | "Join the Waitlist" |
| `soon` | within 120 days | "Get Pricing First" + first-access copy from the entry's `soon: {h2, p}` |
| `availability` | operating building | "Check Availability" + live inventory strip |
| `opened` | delivery date has passed | **build fails** — see below |

That last row is the guard. `namdartowers.com` carried 47% Google traffic and
converted at ~1% because it kept selling a waitlist for a tower that had already
opened. Now the generator exits non-zero, and
`src/lib/__tests__/microsites.test.ts` fails, listing every building whose date
has passed. Pages are still written — one stale record cannot block the other
eighteen sites — but it cannot pass unnoticed.

**When a building's date slips, update `delivers`.** When it actually opens,
rewrite the entry as `mode: "availability"` with real rents.

### Live availability strip

Operating-building pages ask for five fields and promise a callback, which reads
like a gate on data anyone can get off apartments.com. The pages whose building
exists in the catalog now show real inventory above the form — unit count, rent
range, bedroom mix, and the date it was verified — fetched at page load from
`GET /api/microsite-inventory?domain=<domain>` (origin-guarded, cached 15 min).

The route returns `{ available: null }` and the strip stays hidden whenever the
data is missing, the building is not in the catalog, or **the newest price is
older than 45 days**. Panorama Tower is the live example: nine units are marked
available but its last price capture is eight months old, so it shows nothing.
A stale number is worse than no number — that is the same broken promise that
sank Namdar.

Add a domain to `MICROSITE_CATALOG_SLUG` in `src/lib/microsite-inventory.ts`
(and to `CATALOG_SLUG` in `_generator/build.js`, which only decides whether to
render the strip at all) once its building is in the catalog with fresh rents.

### Adding another site

1. Append an entry to `_generator/buildings.js`.
2. Run the generator.
3. Add the domain to `MICROSITE_DOMAINS` in `src/lib/validations/index.ts` —
   CORS for all three API routes derives from that array.
   For a pre-leasing building, set `delivers` to its earliest credible delivery
   date so the CTA tier stays correct on its own.
4. Add a label to `BUILDING_LABEL` in `src/app/admin/microsites/page.tsx`.
5. **Deploy the platform.** A domain missing from `MICROSITE_DOMAINS` in
   production fails CORS and every lead the page captures is silently lost.

`src/lib/__tests__/microsites.test.ts` enforces steps 3 and that each page
posts under its own domain.
