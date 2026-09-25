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

As of 2026-09-21 every page runs the building's own photography or the
developer's released renderings, pulled from official sites and press
releases (we work with these buildings, so their marketing imagery is usable
here; each footer credits the source). The six hand-built pages reference
their files directly in `img/`; the generated pages take theirs from
`_generator/photos/<domain>/` — see "Real photos per building" below. Only
Jade still uses Wikimedia photography of the building. Do not hotlink
Apartments.com/Zillow images.

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
| `2600biscaynemiami.com/` | 2600 Biscayne (Edgewater, 399 units, Oak Row Equities) — leases as Neo Edgewater | Availability (was Waitlist; see wave 3) |
| `jemmiamiapartments.com/` | JEM Miami Worldcenter (Miami Worldcenter, 530 units, Naftali Group) | Waitlist |
| `kenectmiamiapartments.com/` | Kenect Miami (Miami Worldcenter, 450 units, Akara Partners) | Waitlist |
| `3333biscaynemiami.com/` | 3333 Biscayne (Edgewater, 667 units, Beitel Group) | Waitlist |
| `biscayne18.com/` | Biscayne 18 (Edgewater, 1,178 units, Melo Group) | Waitlist |
| `urban22edgewater.com/` | Urban 22 (Edgewater, 441 units, Melo Group, opened 2023) | Availability (was Waitlist until 2026-09-21 — see below) |
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

## What the dashboard was actually showing (2026-09-21 audit)

Five days after the second wave launched, every new site showed 60–78
"visitors" and 0 leads, which read as a conversion problem across 18 pages.
It was not. Pulled by user agent, referrer and behaviour, those sessions were
scanners hitting freshly certificated domains: one view per session, no
referrer, no scroll, no time on page, a spike on deploy day, a handful of
spoofed user agents (`Safari/537.3`, `Chrome/125 … Edge`) on every domain.
The honest 90-day funnel:

| Site | Sessions | From search | Engaged | Leads | Leads / engaged |
|---|---|---|---|---|---|
| downtown6miami.com | 311 | 146 | 188 | 63 | 34% |
| perrinbrickell.com | 122 | 12 | 22 | 4 | 18% |
| namdartowers.com | 83 | 29 | 24 | 2 | 8% |
| every other domain | 4–77 | 0–2 | 0–8 | 0 | — |

None of the wave-2 or wave-3 domains was in Google's index, and staycio.com
linked to none of the 23. So the pages that get humans convert very well and
the rest have no humans — a traffic problem, not a page problem.
Migration `027_microsite_engaged_stats.sql` adds **Engaged** and **From
search** columns to the admin dashboard and makes conversion rate leads /
engaged; the neighborhood pages on staycio.com now link to the guides for
buildings in that neighborhood (`MICROSITE_GUIDES` in `src/lib/microsites.ts`).
Both need the platform deployed and the migration run.

The same audit found Urban 22 selling a "leasing soon" waitlist for a building
that opened in 2023 (its `delivers` date was invented, so the stale-waitlist
guard had nothing true to check), and Namdar's page telling visitors there was
"no official leasing website yet" while the tower leased as CMPND Miami with
listed rents. Both are rewritten. **The guard only works when `delivers` is
real. When adding a building, check a listing site, not a construction blog.**

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
| `waitlist` | more than 120 days out | "Get Pricing First" (was "Join the Waitlist" until 2026-09-21 — see below) |
| `soon` | within 120 days | "Get Pricing First" + first-access copy from the entry's `soon: {h2, p}` |
| `availability` | operating building | "Get Current Pricing" (was "Check Availability" until 2026-09-21) + live inventory strip |
| `opened` | delivery date has passed | **build fails** — see below |

That last row is the guard. `namdartowers.com` carried 47% Google traffic and
converted at ~1% because it kept selling a waitlist for a tower that had already
opened. Now the generator exits non-zero, and
`src/lib/__tests__/microsites.test.ts` fails, listing every building whose date
has passed. Pages are still written — one stale record cannot block the other
eighteen sites — but it cannot pass unnoticed.

**When a building's date slips, update `delivers`.** When it actually opens,
rewrite the entry as `mode: "availability"` with real rents.

### Why every pre-leasing button says "Get Pricing First"

Downtown 6 ran two labels side by side for 90 days: the pinned header button
said "Get Pricing First" and the two larger buttons (hero, mid-page) said
"Join the Waitlist". Navigation clicks to the form, 90 days to 2026-09-21:

| Button | Clicks | Sessions that then started the form |
|---|---|---|
| "Get Pricing First" (header, pinned) | 113 | 59 of 86 (69%) |
| "Join the Waitlist" (hero + mid-page) | 32 | 28 of 31 (90%) |
| "See the Building" (hero, ghost) | 120 | 50 of 97 (52%) |

30 of the 61 submissions came from sessions whose first click was "Get
Pricing First"; 17 from "Join the Waitlist". The header is visible at every
scroll position, so exposure is not equal — but the hero button is larger and
above the fold on every phone, and it still drew a quarter of the clicks.
"Waitlist" reads as "nothing for a year or two"; "pricing" names the thing the
visitor searched for. So the primary label is now "Get Pricing First" on every
pre-leasing page (generator `waitlist` and `soon` tiers, plus downtown6miami,
perrinbrickell and sentralbrickell by hand). The promise is unchanged and
still honest: the delivery date stays in the chip, ticker, stats and FAQ, and
the offer is the number first, when it exists. Operating-building pages
(generator `availability` tier, namdartowers, midtown5apartments) lead with
"Get Current Pricing" for the same reason; jadebrickell keeps "Current
Listings" because that page covers sales as well as rentals.

**Baseline to judge it against** (downtown6miami.com, 90 days to 2026-09-21):
188 engaged sessions, 76 started the form (40%), 61 submitted (32%). If the
form-start share of engaged sessions has not held or risen after a month on
the new label, put the hero button back and say so here.

Note when reading `cta_click` events: the page script logs every `.btn`
click, so the submit button shows up under whatever label it carries with
`href: null`. Filter on `href` starting with `#` for navigation clicks —
the admin dashboard now does.

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

## Titles, images and what the generator will not do for you

- `<title>` and `<meta name="description">` are fitted to about 63 and 155
  characters (`fit()` in `build.js`): the old derivations ran 80–106 and up to
  210, so "Rents", "Waitlist" and the date were the parts Google cut off. A
  custom `title`/`desc` on an entry must respect the same limits by hand.
- Every page preloads its hero (`<link rel="preload" as="image">`) — it is a
  CSS background, so without the hint the browser could not start fetching it
  until the stylesheet was parsed. The hand-built pages' source images were
  also resized to 1920px and recompressed (downtown6miami.com's hero was
  1 MB on a page that is 72% mobile; Perrin shipped three 3 MB PNGs).
- `POOL` holds **generic** Miami imagery only. It used to include Namdar's
  tower rendering, One Twenty Brickell's renderings and a photo of Jade, so
  six other buildings' pages captioned a competitor's tower "Miami skyline" or
  showed Jade as themselves. Each site now also takes a different hero within
  its theme (`themeIdx` offset). Still open: the `interior` pool is Midtown 5's
  own photography ("courtesy of Greystar / Midtown 5") reused on six other
  operating-building pages — that needs real photos or a rights decision.

## Real photos per building

The stock pool is the fallback, not the goal. Put the building's own photography
or renderings in `_generator/photos/<domain>/` as `hero.jpg`, `split.jpg`,
`g1.jpg`, `g2.jpg`, `g3.jpg` and `cta.jpg` (any subset; missing slots fall
back to the pool). Sources can be up to 2000px; the generator re-encodes each
slot to its display size. On the entry, set `captions` (three gallery labels,
g1–g3, saying what each photo shows) and `credit` (rendered in the footer,
e.g. "Photography courtesy of Bozzuto / Neo Edgewater"). Photos were pulled
from each building's official site or the developer's released renderings
on 2026-09-21 — we work with these buildings, so their marketing imagery is
usable here. Keep the hero landscape and at least 1600px wide.

## Third wave — 4 generated sites (added 2026-09-21)

Two buildings, four domains. Generated the same way — append to
`_generator/buildings.js`, run `node microsites/_generator/build.js`.

| Folder | Building | Page type |
|---|---|---|
| `mohawkwynwood.com/` | Mohawk at Wynwood (Wynwood, 300 units, Rilea Group, 2028) | Waitlist |
| `mohawkmiami.com/` | Mohawk at Wynwood — amenity angle | Waitlist |
| `2900terrace.com/` | 2900 Terrace (Edgewater, 324 units, Oak Row + LNDMRK, Q4 2027) | Waitlist |
| `neoedgewatermiami.com/` | Neo Edgewater (Edgewater, 399 units, Oak Row Equities) | Availability |

`2900terrace.com` is the strongest of the four on the screening rule: a large
market-rate rental whose exact-match `.com` was parked (both `2900terrace.com`
and `2900terracemiami.com` served GoDaddy landers). That is the downtown6miami
pairing.

`neoedgewatermiami.com` is the weakest, and deliberately so — Neo Edgewater has
a real, live official leasing site at `neoedgewater.com` run by Bozzuto, so this
page competes with an operator rather than filling a vacuum. It is an
availability page with real published rents, not a waitlist.

### Two domains, one building

Both pairs cover a single building:

- `mohawkwynwood.com` + `mohawkmiami.com` → Mohawk at Wynwood
- `2600biscaynemiami.com` + `neoedgewatermiami.com` → 2600 Biscayne, which
  leases under the name **Neo Edgewater**

They are written as two different pages aimed at different searches, never one
page under a second name. The neighborhood/address domain gets the building
story; the brand/amenity domain gets the comparison story — different H1, body,
cards, FAQ, stats, palette and image pool.

Derived `<title>`, `<meta name="description">` and `og:title` break for a pair,
because they are built from the building and both entries name the same one.
`build.js` therefore honours optional `title`, `desc` and `ogTitle` fields, and
**every entry in a pair must set them.** Byte-identical titles are the strongest
near-duplicate signal there is, and Google resolves it by keeping one page and
dropping the other — which would cost whichever one was ranking.

If a pair is ever not worth maintaining as two pages, 301 the weaker domain at
the stronger one. Do not let both drift back into the same page.

### 2600 Biscayne is now Neo Edgewater, and now leasing

Preleasing launched September 2026 with first residents in October, so the
entry was rewritten from `mode: "waitlist"` to `mode: "availability"` with the
published lease-up rents. It had been running "get pricing before the leasing
office opens" into the month the office opened and posted rents — the
namdartowers.com failure, about six weeks from repeating (its `delivers` was
2026-11-01, after which the build would have failed outright).

### Per-building verification dates

`FACTS_VERIFIED` is global, so re-checking one building could only be recorded
by re-asserting diligence on all of them. An entry may now carry its own
`verified: "YYYY-MM-DD"`, which overrides `FACTS_VERIFIED` in that page's
footer. The wave 3 entries and the rewritten 2600 Biscayne entry carry
`2026-09-21`; everything else still reads `2026-09-16`, which is the truth.
The same rule applies to both: bump only after actually re-checking that
building, never to match the build date.

### Adding another site

1. Append an entry to `_generator/buildings.js`. If another domain already
   covers the same building, set `title`, `desc` and `ogTitle` on **both**
   entries — see "Two domains, one building" above.
2. Run the generator.
3. Add the domain to `MICROSITE_DOMAINS` in `src/lib/validations/index.ts` —
   CORS for all three API routes derives from that array.
   For a pre-leasing building, set `delivers` to its earliest credible delivery
   date so the CTA tier stays correct on its own.
4. Add a label to `BUILDING_LABEL` in `src/app/admin/microsites/page.tsx`.
5. **Deploy the platform.** A domain missing from `MICROSITE_DOMAINS` in
   production fails CORS and every lead the page captures is silently lost.

`src/lib/__tests__/microsites.test.ts` enforces steps 3 and 4 and that each page
posts under its own domain.

## Phones (2026-09-25)

Checked in iPhone WebKit at 393x659 and at an iPhone SE's real Safari area
(375x553), on all 23 pages:

- **Stacy's launchers step aside.** The floating Call / Ask Stacy pills sat on
  the hero button and on the form's phone field. `_shared/stacy-widget.html`
  now fades them out (and makes them untappable) while a hero or mid-page
  `.btn`, the lead form or the footer passes underneath them, while any page
  field has focus (the iOS keyboard is up), and while the chat is open. A new
  button that must never be covered goes in the `guards` selector there. On
  phones the chat is a full-height sheet sized in `dvh`, and to the visual
  viewport while the keyboard is up, so its close button stays on screen.
- **The header is one row on phones** (68px, 60px scrolled; it was 106–133px
  with a button wrapping onto three lines). Where the full label will not fit,
  the header button drops a word via a `.cta-x` span ("Get Pricing First" →
  "Get Pricing"). The word stays in the DOM, so the `cta_click` label the
  analytics log is unchanged and the label comparison above still reads the
  same. downtown6, perrin, sentral and jade keep the full label down to 360px;
  namdar and the generated pages use the short one on every phone. Generated
  wordmarks are sized in `vw` from their length (`wmVw` in `build.js`) so the
  longest names still fit at 320px.
- The hero button clears the fold on a 375x553 SE on every page, heroes use
  `100svh`, nothing scrolls sideways at 320–393px (namdar's residences table,
  which made that page 540px wide, restacks into cards), labels have a 12px
  floor (the small lines in the Jade and Perrin wordmarks excepted), tap
  targets are 44px, and name/email carry `autocomplete`.
