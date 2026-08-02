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
