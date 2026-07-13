# Staycio Game Plan — The Ultimate Major-City Luxury Apartment Marketplace

*Written 2026-07-12, after the third full platform audit. Supersedes the roadmap portion of BUILD_PLAN.md (which remains the historical build record).*

---

## Where the platform stands today

**What's built and working:** AI-native search (natural-language parse is the default UX, plus semantic/hybrid retrieval), a tool-calling chat assistant that runs real searches and creates real routed leads, Mapbox split search, price-history transparency with "as of" timestamps, building/unit/city/neighborhood SEO pages with JSON-LD + OG images, favorites + saved-search email alerts, a 5-role ecosystem (renter / agent / partner / shower / admin), a full admin CRM with AI email inbox, an AI scraper pipeline with freshness crons, the Lexi video avatar, and a deployed phone agent.

**The crown jewel:** the **Shower gig marketplace** — certified, quiz-tested, shadow-trained apartment tour guides with claims, debriefs, ratings, tiers, strikes, and commission-split placement bonuses, all enforced at the database level. No major competitor has this.

**Engineering health:** 3 audits absorbed (~120+ fixes), typecheck/lint/tests/build all green, RLS locked down, rate limiting and SSRF/XSS guards in place.

**The three existential gaps:**
1. **Supply depth** — hand-seeded JSON + a fetch-only scraper ≈ dozens of buildings per city. Competitors have full feeds. Nothing else matters if inventory is thin.
2. **The revenue loop doesn't close automatically** — renter leads and showing leads are two disconnected systems bridged manually by admins. Lead → tour → lease → commission → payout must be one pipeline.
3. **The AI surfaces aren't equally armed** — chat has 5 real tools; Lexi (video) and Aria (phone) are prompt-only and can't search inventory or capture leads.

---

## North Star

**"Every luxury building in every major city, tourable within 24 hours, with an AI leasing agent that never sleeps."**

Positioning: Staycio is not a listings site — it's an **AI-powered brokerage with an on-demand tour network**. Zillow shows you apartments; Staycio *gets you into them*. That's the moat: listings sites can't dispatch a certified human tomorrow at 2pm, and traditional brokerages can't answer at 3am in three modalities.

Revenue model (already latent in the code): broker commission on lease (½ month's rent), minus shower payouts ($150/showing + 25% placement pool). At ~$4,500 median luxury rent that's ~$2,250 gross per lease, ~$1,500+ net. 100 leases/month ≈ $2.7M/yr gross. The entire roadmap serves that unit economic.

---

## Phase 1 — Close the revenue loop (weeks 1–3)

The single highest-leverage engineering work. Everything is already half-built.

1. **Unify the two lead systems.** When a renter lead reaches "touring" status (or requests a tour directly), auto-create a `showing_lead` for certified showers in that building — no admin bridging. Admin approves exceptions, not every handoff. Add a `source_lead_id` FK so attribution flows end-to-end.
2. **Automate the funnel state machine.** Lead events already exist; wire transitions: tour scheduled → shower claims → debrief submitted → admin reviews → application → lease → commission record. Every transition emails the right party (Resend templates already exist).
3. **Payout rails.** Stripe Connect Express for showers (onboarding link from the earnings page); earnings ledger already exists — add payout batches + status. Until real money flows, showers won't stay.
4. **SMS layer (Twilio).** The schema already references client ratings via SMS with no sender. SMS is also how tour confirmations/reminders should go (email open rates won't cut it for same-day tours).
5. **Renter-side tour booking UX.** "Book a tour" with real time slots (shower availability calendar — `shower/schedule` page exists as a shell) instead of a contact form. This is the "OpenTable moment" — instant confirmed tours are the differentiator competitors can't match.

**Success metric:** first lead that goes form → shower → debrief → commission with zero admin touches.

## Phase 2 — Solve supply (weeks 2–8, overlaps)

1. **Headless-browser scraping.** The #1 technical unlock: swap the fetch-based scraper's transport for Playwright (Browserless/Browserbase for serverless) so Entrata/RealPage/Yardi-rendered leasing sites — i.e., most institutional luxury buildings — become scrapable. The AI-extraction layer already works; it's starving for HTML.
2. **Feed integrations.** Pursue direct feeds where they exist: Yardi RentCafe API, RealPage, Entrata partner APIs, and syndication feeds (Rent., Zumper partner programs). One feed integration > 1,000 scrapes.
3. **Partner self-serve growth.** The partner portal exists; add self-signup with admin approval + "claim your building" flow. Buildings updating their own pricing is free, fresh, first-party supply — and the future audience for paid placement.
4. **Image rehosting.** Move scraped images to Supabase Storage (kills the `remotePatterns: **` risk, stops hotlink rot, enables optimization).
5. **Depth target:** 300+ buildings per city in the top 5 cities before spending a dollar on demand marketing. The `data-quality` dashboard already scores buildings — make "% of city inventory above 8/10 quality" the weekly KPI.
6. **Decide the synthetic-data policy.** `/api/generate-units` fabricates units indistinguishable from real ones. Either badge them ("estimated from building data") or purge them before scale — fabricated "real-time pricing" is a trust time-bomb for a luxury brand.

## Phase 3 — Arm every AI surface with the same tools (weeks 4–8)

1. **Lexi gets tools.** The Simli LLM config points at Grok — route it through the same tool-executor as chat (search_listings, get_building_details, create_lead). A video avatar that can actually pull up "2BRs under $6k in Tribeca" while talking is a demo that sells itself.
2. **Aria (phone) gets tools.** The voice-agent has Supabase creds in its README but uses none. Give the LiveKit agent function-calling against the same internal APIs: real pricing quotes, lead capture, tour booking by phone. A phone number that books confirmed tours 24/7 is unprecedented in this market.
3. **Proactive AI.** The chat is reactive. Add: price-drop pings on favorited units (data already in snapshots), "3 new matches for your saved search" push, and an AI-drafted weekly digest. The cron + email infra is already there.
4. **AI concierge memory.** Persist chat context per user (conversations table exists) so Lexi remembers "you wanted a doorman building near the L train under $5k."

## Phase 4 — Renter experience & trust (weeks 6–12)

1. **Verified-listing badges** — "pricing verified {date}" (snapshots make this honest) and "Staycio toured" (showers photograph every visit — that's proprietary ground truth no competitor has).
2. **Tour debrief content flywheel.** Shower debriefs (photos, objections, unit conditions) are unique first-party content. Surface sanitized versions on building pages: "Last toured by Staycio on July 8 — actual photos." This is review-grade content that can't be astroturfed.
3. **Neighborhood data layers:** commute-time search (Mapbox Matrix API), transit/walkability scores, and draw-on-map boundary search. Table stakes at StreetEasy; absent here.
4. **Applications (later, big):** partner with a screening API (TransUnion SmartMove et al.) rather than building. Only after tour volume exists.
5. **Papercuts already fixed this audit** (saved-search creation, deep-link filters, forgot-password, compare cap, legal pages, a11y) — keep the bar: every funnel must be walkable end-to-end by a stranger.

## Phase 5 — Demand & brand (ongoing from week 8)

1. **SEO is the engine** (machinery already strong): programmatic "Luxury apartments in {neighborhood}" pages need inventory depth to rank; the editorial city pages are the model. Add neighborhood-level editorial + FAQ schema.
2. **The shower network is also a marketing asset:** "Book a certified local tour guide, free" is the campaign hook nobody else can run. Showers on TikTok/IG touring units = organic content channel with built-in attribution (their referral leads are already tracked).
3. **Luxury brand discipline:** the dark-glass aesthetic is distinctive — keep it. Add a real brand story on /about (done), professional photography standards for partner uploads, and white-glove copywriting on top-50 buildings per city.
4. **City playbook:** launch city-by-city (supply → showers → demand), not all-at-once. Miami + NYC first (existing depth + Lexi's home turf), then LA/Chicago/SF.

## Cut / deprioritize (subtract to focus)

- **Boston, Denver, Seattle city rows** — empty (0 buildings). Hide or seed them; empty city pages damage SEO and trust. (The duplicate nyc/la/sf rows were deleted in this audit.)
- **pgvector embeddings table** — unused (RAG went through xAI Collections). Drop it or commit to it; don't carry two vector stories.
- **`/api/import/{city}` one-off routes** — superseded by the admin importer; fold and delete.
- **Agent commission_rate plumbing** — dormant; either wire it into the commission records in Phase 1 or remove the column until needed.
- **3-way compare** — capped at 2 this audit to match the API; only rebuild N-way if usage data demands it.

## Ops debt (do before real traffic)

| Item | Why | Effort |
|---|---|---|
| Rotate leaked Supabase service-role key + DB password | In git history, valid to 2036 — **still pending, user action** | 1 hr |
| Upstash/Vercel KV rate limiting | Current limiter is per-instance memory | ½ day |
| Error monitoring (Sentry) | Flying blind on prod errors | ½ day |
| Product analytics (PostHog) | Funnel metrics for everything above; page-tracking hook now wired | 1 day |
| CI (GitHub Actions: tsc + lint + vitest + Playwright) | 3 audits found what CI should catch | ½ day |
| Backups/PITR check on Supabase | Marketplace = money = data loss is fatal | 1 hr |

## KPIs to run the business on

1. **Supply:** buildings live per city / % above 8/10 data-quality / % pricing fresher than 7 days
2. **Demand:** organic sessions, search → lead conversion, AI-chat engagement rate
3. **Marketplace:** lead → tour rate, tour → application rate, median hours from lead to confirmed tour (target < 24)
4. **Economics:** commissions recorded, shower payout ratio, net revenue per lease
5. **Trust:** shower rating average, debrief completion rate, listing accuracy complaints

---

### Sequencing summary

**Weeks 1–3:** revenue loop (lead unification, state machine, Stripe Connect, Twilio, tour booking)
**Weeks 2–8:** supply engine (headless scraping, feeds, partner self-serve, image rehosting)
**Weeks 4–8:** tools for Lexi + Aria, proactive AI
**Weeks 6–12:** trust layer (verified badges, debrief content, commute search)
**Week 8+:** demand push, city-by-city
**Immediately:** key rotation, CI, monitoring

The platform is unusually well-built for its age. The strategy is not "build more features" — it's **connect what exists into one closed loop, feed it real inventory, and let the shower network + AI trifecta be the story.**
