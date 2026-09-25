#!/usr/bin/env node
/**
 * Generates a self-contained microsite per building, matching the structure of
 * the hand-built downtown6miami.com page (the top performer: 461 views, 60 leads).
 * Run:  node microsites/_generator/build.js
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const BUILDINGS = require("./buildings.js");
const { stacyBlock, stacyGreeting } = require("../_shared/stacy.js");

const ROOT = path.join(__dirname, "..");
const TODAY = new Date().toISOString().slice(0, 10);
// The footer claims facts were "believed accurate as of" this date. It tracks
// when the DATA was verified, not when the file was built — wiring it to TODAY
// meant every regeneration silently re-asserted diligence nobody had done.
const VERIFIED = BUILDINGS.FACTS_VERIFIED || TODAY;
// A single global date means re-checking one building can only be recorded by
// re-asserting diligence on every other one. `verified` on an entry overrides
// FACTS_VERIFIED for that page alone. Same rule applies: bump it only after
// actually re-checking that building, never to match the build date.
const VERIFY = "b3cf5795b633271ae0b26ee982d06033";

// Image pool drawn from the existing sites. Only GENERIC Miami imagery belongs
// here — skyline, bay, street and construction shots. Never a specific
// building's rendering or photo: the skyline pool used to carry Namdar's tower
// rendering and the bay pool One Twenty Brickell's renderings plus a photo of
// Jade, so JEM, Kenect and Miami World Tower each captioned a competitor's
// tower "Miami skyline", and 2600 Biscayne, Art Plaza and Panorama showed
// Jade as their own building. A renter who knows the skyline notices.
//
// The interior pool is Midtown 5's own photography ("courtesy of Greystar /
// Midtown 5" in that page's footer) and is still reused on six other
// operating-building pages. That is a rights and honesty question to settle
// with real photos, not a generator fix — see the README.
const POOL = {
  construction: ["downtown6miami.com/img/construction.jpg", "downtown6miami.com/img/const-01.jpg",
    "downtown6miami.com/img/const-03.jpg", "downtown6miami.com/img/const-05.jpg",
    "downtown6miami.com/img/const-11.jpg", "downtown6miami.com/img/const-15.jpg"],
  skyline: ["namdartowers.com/img/downtown.jpg", "namdartowers.com/img/downtown-night.jpg",
    "namdartowers.com/img/bayfront.jpg", "namdartowers.com/img/worldcenter.jpg",
    "jadebrickell.com/img/skyline.jpg", "jadebrickell.com/img/bay.jpg"],
  interior: ["midtown5apartments.com/img/living.jpg", "midtown5apartments.com/img/kitchen.jpg",
    "midtown5apartments.com/img/pool.jpg", "midtown5apartments.com/img/lounge.jpg",
    "midtown5apartments.com/img/fitness.jpg", "midtown5apartments.com/img/pool2.jpg"],
  // jadebrickell/skyline.jpg is the same photo as sentralbrickell/brickell.jpg,
  // so it must not appear twice within a pool.
  bay: ["jadebrickell.com/img/bay.jpg", "jadebrickell.com/img/street.jpg", "sentralbrickell.com/img/brickell.jpg",
    "namdartowers.com/img/worldcenter.jpg", "namdartowers.com/img/bayfront.jpg",
    "namdartowers.com/img/downtown-night.jpg"],
};
// hero, split, g1, g2, g3, cta  — six slots per site.
const THEME = {
  "2600biscaynemiami.com": "bay", "jemmiamiapartments.com": "skyline",
  "kenectmiamiapartments.com": "skyline", "3333biscaynemiami.com": "construction",
  "biscayne18.com": "construction", "urban22edgewater.com": "bay",
  "downtown5miami.com": "interior", "panoramatowerbrickell.com": "bay",
  "maizonbrickell.com": "interior", "muzemet.com": "interior",
  "remitheriver.com": "skyline", "artplazaapartments.com": "bay",
  "miamiworldtowerapartments.com": "skyline",
  // Wave 3. The two same-building pairs deliberately draw from different pools
  // so the pages do not share a single image: mohawkwynwood/mohawkmiami and
  // 2600biscayne/neoedgewatermiami. 2600 Biscayne moved off "construction"
  // because the building is finished and leasing.
  "mohawkwynwood.com": "construction", "mohawkmiami.com": "interior",
  "2900terrace.com": "construction", "neoedgewatermiami.com": "interior",
};
const SLOTS = ["hero.jpg", "split.jpg", "g1.jpg", "g2.jpg", "g3.jpg", "cta.jpg"];
// Real photography and renderings of the building itself live in
// _generator/photos/<domain>/<slot>.jpg. Any slot present there wins over the
// stock pool; anything missing falls back to the pool, so a page never loses
// an image. Sources are kept at up to 2000px and re-encoded per slot below.
// An entry with its own photos should also set `captions` (three gallery
// labels, in order g1–g3) and `credit` (rendered in the footer disclaimer).
const PHOTOS = path.join(__dirname, "photos");
// Source stock runs 1–1.5MB per file. Heroes at that weight tank Largest
// Contentful Paint, and these pages exist to rank — so every copy is resized
// to its real display width and re-encoded. OPTIMIZE maps slot -> [width, quality].
const OPTIMIZE = { "hero.jpg": [1920, 74], "cta.jpg": [1920, 74], "split.jpg": [1200, 76],
  "g1.jpg": [900, 76], "g2.jpg": [900, 76], "g3.jpg": [900, 76] };

// Domains whose building exists in the Staycio catalog, so the availability
// strip has something to ask for. Mirrors MICROSITE_CATALOG_SLUG in
// src/lib/microsite-inventory.ts — the page only needs to know whether to
// render the strip at all; the route decides what it says.
const CATALOG_SLUG = {
  "panoramatowerbrickell.com": "panorama-tower",
  "maizonbrickell.com": "maizon-brickell",
  "muzemet.com": "muze-at-met",
  "remitheriver.com": "remi-on-the-river",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A building within this many days of delivery stops being a "someday" waitlist
// and becomes a "pricing lands imminently" page. 120 days is roughly when a
// renter starts actually shopping, and it is the window in which opening
// specials and first pick of units are still real things to offer.
const SOON_DAYS = 120;

/**
 * The CTA tier a page renders. Derived from `delivers`, never from `mode`
 * alone: `mode` is a static hand-written field and the one thing this portfolio
 * has already been burned by is a page that kept selling a waitlist after its
 * building opened.
 *
 *   waitlist     — delivery is far off. The honest trade: this information does
 *                  not exist yet anywhere, so the list is the only way to get it.
 *   soon         — delivery inside SOON_DAYS. Same trade, plus a dated promise
 *                  and a reason not to "come back later".
 *   availability — operating building. Show real inventory, ask for specifics.
 */
function tierOf(b, now = Date.now()) {
  if (b.mode === "availability") return "availability";
  if (!b.delivers) return "waitlist";
  const days = (new Date(b.delivers).getTime() - now) / 86400000;
  if (days <= 0) return "opened";
  return days <= SOON_DAYS ? "soon" : "waitlist";
}

function page(b) {
  const p = b.palette;
  const tier = tierOf(b);
  // "opened" reaches here only when the build was allowed to continue past the
  // warning below; render it as a waitlist rather than inventing copy.
  const isWait = tier === "waitlist" || tier === "soon" || tier === "opened";
  const isSoon = tier === "soon";
  const hasInventory = tier === "availability" && CATALOG_SLUG[b.domain];
  const utm = b.domain.replace(/\.com$/, "");
  // `title`, `desc` and `ogTitle` are derived from the building, which breaks
  // the moment two domains cover the SAME building — the two Mohawk domains and
  // the 2600 Biscayne / Neo Edgewater pair would otherwise ship byte-identical
  // titles and descriptions. That is the strongest near-duplicate signal there
  // is, and Google resolves it by picking one page and dropping the other.
  // Distinct body copy is not enough on its own; an entry in a pair overrides
  // these so each page targets the search its domain is actually named for.
  // Google shows about 60 characters of a title and 155 of a description, and
  // less on the phones that carry most of this traffic. The old derivations ran
  // 80–106 and 130–210 characters, so the words that earn the click — "Rents",
  // "Waitlist", the delivery date — were exactly the words cut off. Candidates
  // are tried in order and the first that fits wins; the last is the floor.
  const inName = (s) => b.name.toLowerCase().includes(s.toLowerCase());
  const city = inName("Miami") ? "" : " Miami";
  const hood = inName(b.hood) ? null : b.hood;
  const dated = b.delivers || /\d{4}/.test(b.eta); // "Under construction" is not a date
  const when = dated ? b.etaShort + " " : "";
  const units = b.units ? b.units.toLocaleString() + " " : "";
  const title = b.title || fit(63, isSoon
    ? [`${b.name} Apartments, ${hood} — Rents & Floor Plans, Opening Soon`,
       `${b.name} Apartments${city} — Rents & Floor Plans, Opening Soon`,
       `${b.name} — Rents & Floor Plans, Opening Soon`]
    : isWait
    ? [`${b.name} Apartments, ${hood} — Rents & ${when}Waitlist`,
       `${b.name} Apartments${city} — Rents & ${when}Waitlist`,
       `${b.name} — Rents & Waitlist`]
    : [`${b.name} Apartments — ${hood} | Rents & Availability`,
       `${b.name} Apartments${city} — Rents & Availability`,
       `${b.name} — Rents & Availability`]);
  const desc = b.desc || fit(155, isWait
    ? [`${b.name}: ${units}rental apartments at ${b.address}, ${b.hood}, Miami${b.developer ? ", by " + b.developer : ""}. ${b.eta}. Join the waitlist for rents and floor plans.`,
       `${b.name}: ${units}rental apartments at ${b.address}, ${b.hood}, Miami. ${b.eta}. Join the waitlist for rents and floor plans.`,
       `${b.name}: ${units}rental apartments in ${b.hood}, Miami, ${b.eta.toLowerCase()}. Join the waitlist for rents and floor plans.`,
       `${b.name}: ${units}new apartments in ${b.hood}, Miami. Join the waitlist for rents and floor plans.`]
    : [`${b.name}: ${units}rental residences at ${b.address}, ${b.hood}, Miami. Check live availability, rents and floor plans.`,
       `${b.name}: ${units}rental residences in ${b.hood}, Miami. Check live availability, rents and floor plans.`,
       `${b.name} apartments in ${b.hood}, Miami. Check live availability, rents and floor plans.`]);
  const ogTitle = b.ogTitle || `${b.name} — ${b.hood}, Miami`;
  // "Get Pricing First" is the primary label on every pre-leasing page, not
  // just the soon tier. On downtown6miami.com (90 days to 2026-09-21) the
  // pinned header button carrying that label drew 113 navigation clicks
  // against 32 for the two larger "Join the Waitlist" buttons, and 30 of 61
  // submissions came from sessions whose first click was "Get Pricing First".
  // "Waitlist" tells a renter nothing is happening for a year or two;
  // "pricing" names the thing they came for. The page still states the real
  // delivery date in the chip, ticker, stats and FAQ, so the promise is the
  // same honest one — you see the number first, when it exists.
  // Operating buildings lead with the number as well. "Check Availability" is
  // what every listing site's button says; "Get Current Pricing" names what
  // the visitor actually searched for, and the form's promise (today's rents
  // and what's open, usually within a day) covers it.
  const ctaLabel = isWait ? "Get Pricing First" : "Get Current Pricing";
  // The header button drops a word on phones so it stays on one line beside the
  // wordmark. The hidden word stays in the DOM, so textContent (and with it the
  // cta_click label the analytics log) is still the full label.
  const navLabel = isWait ? 'Get Pricing<span class="cta-x"> First</span>' : 'Get <span class="cta-x">Current </span>Pricing';
  // Phone wordmark size, in vw so it tracks the screen: the name and the "Get
  // Pricing" button must share one row on a 360px screen (and on a 320px one,
  // with the <=359px tier's tighter gutters). That leaves ~0.515 of the width for
  // the name, and Sora 800 caps average under 0.85em a character. Short names
  // hit the 18px cap; "MOHAWKAT WYNWOOD" lands near 14px.
  const wmVw = +(51.5 / ((b.short + b.accent).length * 0.85)).toFixed(2);
  const ticker = b.ticker.join(" &nbsp;·&nbsp; ");

  // Gallery captions and alt text. With stock imagery the captions are
  // deliberately vague; with the building's own photos they should say what
  // the photo shows ("Pool Deck", "Residence Interior").
  const cap = b.captions || [b.hood, "The Area", "The View"];
  const splitAlt = b.splitAlt || `${b.name} — ${b.hood}, Miami`;
  const ld = {
    "@context": "https://schema.org", "@type": "ApartmentComplex", name: b.name,
    description: desc,
    image: `https://${b.domain}/img/hero.jpg`,
    address: { "@type": "PostalAddress", streetAddress: b.address, addressLocality: "Miami", addressRegion: "FL", postalCode: b.zip, addressCountry: "US" },
    url: `https://${b.domain}/`,
  };
  if (b.units) ld.numberOfAccommodationUnits = b.units;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://${b.domain}/">
<link rel="preload" as="image" href="img/hero.jpg" fetchpriority="high">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="https://${b.domain}/img/hero.jpg">
<meta property="og:url" content="https://${b.domain}/">
<meta property="og:type" content="website">
<meta name="robots" content="index,follow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<style>
  :root{
    --ink:${p.ink}; --aqua:${p.a}; --aqua-deep:${p.deep}; --aqua-pale:${p.pale};
    --white:#ffffff; --off:#f6f9fa; --muted:#8a9aa0; --muted-dark:#46585d;
    --display:'Sora',system-ui,sans-serif; --body:'Inter',system-ui,sans-serif;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:var(--body);font-weight:300;color:var(--ink);background:var(--white);line-height:1.7;font-size:1.02rem}
  .wrap{max-width:1180px;margin:0 auto;padding:0 32px}
  img{max-width:100%;display:block}

  header{position:fixed;top:0;left:0;right:0;z-index:50;transition:all .35s;padding:20px 0}
  header.scrolled{background:${hexA(p.ink, 0.96)};backdrop-filter:blur(12px);padding:12px 0}
  header .wrap{display:flex;align-items:center;justify-content:space-between}
  .wordmark{font-family:var(--display);font-weight:800;font-size:1.25rem;color:#fff;text-decoration:none;letter-spacing:-.01em}
  .wordmark span{color:var(--aqua)}
  .nav-cta{font-family:var(--display);font-size:.78rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink);background:var(--aqua);text-decoration:none;padding:12px 24px;border-radius:999px;transition:all .3s}
  .nav-cta:hover{background:#fff}

  .hero{position:relative;min-height:100vh;min-height:100svh;display:flex;align-items:center;color:#fff;
    background:linear-gradient(165deg,${hexA(p.ink, 0.84)} 0%,${hexA(p.deep, 0.5)} 60%,${hexA(p.ink, 0.76)} 100%),
    url('img/hero.jpg') center/cover}
  .hero-inner{max-width:840px;padding:150px 0 110px}
  .chip{display:inline-block;font-family:var(--display);font-size:.72rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;background:${hexA(p.a, 0.18)};border:1px solid ${hexA(p.a, 0.5)};color:${p.pale};padding:8px 18px;border-radius:999px;margin-bottom:28px}
  .hero h1{font-family:var(--display);font-weight:800;font-size:clamp(2.4rem,6.2vw,4.6rem);line-height:1.05;letter-spacing:-.03em}
  .hero h1 .aqua{color:var(--aqua)}
  .hero p.sub{margin:26px 0 38px;font-size:1.15rem;color:rgba(255,255,255,.85);max-width:580px}
  .btn{display:inline-block;font-family:var(--display);font-size:.82rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;padding:17px 36px;border-radius:999px;transition:all .3s;cursor:pointer;border:none}
  .btn-aqua{background:var(--aqua);color:var(--ink)}
  .btn-aqua:hover{background:#fff}
  .btn-ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.4);margin-left:14px}
  .btn-ghost:hover{border-color:var(--aqua);color:var(--aqua)}
  .hero-ticker{position:absolute;bottom:0;left:0;right:0;background:var(--aqua);color:var(--ink);font-family:var(--display);font-weight:600;font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;padding:13px 0;white-space:nowrap;overflow:hidden}
  .hero-ticker div{display:inline-block;animation:tick 30s linear infinite}
  @keyframes tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

  .stats{background:var(--ink);color:#fff;padding:70px 0}
  .stats .wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:36px}
  .stat{border-left:2px solid var(--aqua);padding-left:22px}
  .stat b{display:block;font-family:var(--display);font-weight:800;font-size:2.5rem;letter-spacing:-.02em;line-height:1.15}
  .stat small{font-size:.74rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}

  section{padding:104px 0}
  .kicker{font-family:var(--display);font-size:.74rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--aqua-deep);margin-bottom:16px}
  h2{font-family:var(--display);font-weight:700;font-size:clamp(1.8rem,3.6vw,2.7rem);line-height:1.12;letter-spacing:-.02em;margin-bottom:20px}
  .prose{color:var(--muted-dark);max-width:58ch}
  .prose+.prose{margin-top:16px}
  .split{display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:center}
  .split img{width:100%;height:540px;object-fit:cover;border-radius:24px}

  .alt{background:var(--off)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;margin-top:46px}
  .card{background:#fff;border-radius:20px;padding:36px 32px;border:1px solid #e6eef0;transition:transform .3s,box-shadow .3s}
  .card:hover{transform:translateY(-4px);box-shadow:0 18px 42px ${hexA(p.ink, 0.09)}}
  .card .num{font-family:var(--display);font-weight:800;font-size:.85rem;color:var(--aqua-deep);letter-spacing:.14em}
  .card b{display:block;font-family:var(--display);font-weight:700;font-size:1.15rem;margin:12px 0 8px;letter-spacing:-.01em}
  .card p{color:var(--muted-dark);font-size:.95rem}

  .gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .gallery-grid figure{overflow:hidden;border-radius:22px;position:relative}
  .gallery-grid img{width:100%;height:400px;object-fit:cover;transition:transform 1s ease}
  .gallery-grid figure:hover img{transform:scale(1.06)}
  .gallery-grid figcaption{position:absolute;left:0;right:0;bottom:0;padding:20px;color:#fff;font-family:var(--display);font-size:.72rem;font-weight:600;letter-spacing:.18em;text-transform:uppercase;background:linear-gradient(transparent,${hexA(p.ink, 0.72)})}

  details{background:var(--off);border-radius:16px;padding:22px 28px;margin-bottom:12px;border:1px solid #e6eef0}
  summary{font-family:var(--display);font-weight:600;font-size:1.05rem;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;letter-spacing:-.01em;gap:20px}
  summary::-webkit-details-marker{display:none}
  summary::after{content:'+';font-size:1.4rem;color:var(--aqua-deep);transition:transform .3s}
  details[open] summary::after{transform:rotate(45deg)}
  details p{margin-top:12px;color:var(--muted-dark)}

  /* Mid-page CTA. The form lives at the very bottom; on a long page that is a
     lot of scroll between "I'm interested" and anywhere to say so. */
  .midcta{background:var(--off);border-top:1px solid #e6eef0;border-bottom:1px solid #e6eef0;padding:38px 0}
  .midcta .wrap{display:flex;align-items:center;justify-content:space-between;gap:28px;flex-wrap:wrap}
  .midcta p{font-family:var(--display);font-weight:600;font-size:1.12rem;letter-spacing:-.01em;margin:0;max-width:62ch}
  .midcta .btn{flex:none}

${hasInventory ? `  /* Live availability, filled from /api/microsite-inventory. Stays hidden when
     the data is missing or older than the freshness cutoff — an empty strip is
     the correct output, a stale number is not. */
  .inv{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 14px;margin-top:30px;padding:20px 24px;
    border-radius:16px;background:${hexA(p.a, 0.14)};border:1px solid ${hexA(p.a, 0.4)}}
  .inv[hidden]{display:none}
  .inv b{font-family:var(--display);font-weight:800;font-size:1.32rem;color:#fff;letter-spacing:-.01em}
  .inv span{color:rgba(255,255,255,.82);font-size:.97rem}
  .inv em{flex-basis:100%;font-style:normal;font-size:.76rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.55)}
` : ""}
  .cta-band{position:relative;color:#fff;padding:120px 0;
    background:linear-gradient(160deg,${hexA(p.ink, 0.94)},${hexA(p.deep, 0.84)}),
    url('img/cta.jpg') center/cover}
  .cta-grid{display:grid;grid-template-columns:1fr 1fr;gap:76px;align-items:start}
  .cta-band h2{color:#fff}
  .cta-band .prose{color:rgba(255,255,255,.8)}
  form{background:rgba(255,255,255,.99);border-radius:24px;padding:44px;color:var(--ink);position:relative;box-shadow:0 30px 80px rgba(0,0,0,.3)}
  label{display:block;font-family:var(--display);font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--aqua-deep);margin:20px 0 8px}
  form label:first-of-type{margin-top:0}
  input,select{width:100%;background:var(--off);border:1px solid #e0e9eb;border-radius:12px;color:var(--ink);font-family:var(--body);font-size:1rem;padding:14px 16px;outline:none;transition:border-color .3s}
  input:focus,select:focus{border-color:var(--aqua)}
  select{appearance:none;cursor:pointer}
  form .btn{width:100%;margin-top:28px}
  .fineprint{margin-top:16px;font-size:.83rem;color:var(--muted)}
  .fineprint a{color:var(--aqua-deep)}

  footer{background:var(--ink);color:var(--muted);padding:54px 0;font-size:.82rem}
  footer .wordmark{font-size:1rem;display:inline-block;margin-bottom:18px;overflow-wrap:anywhere}
  footer a{color:var(--aqua)}
  footer p{max-width:90ch}

  .reveal{opacity:0;transform:translateY(26px);transition:opacity .8s ease,transform .8s ease}
  .reveal.in{opacity:1;transform:none}

  @media(max-width:900px){
    .split,.cta-grid{grid-template-columns:1fr;gap:42px}
    .split img{height:360px}
    .gallery-grid{grid-template-columns:1fr}
    .gallery-grid img{height:280px}
    section{padding:72px 0}
    .btn-ghost{margin-left:0;margin-top:12px}
    form{padding:32px}
    .midcta .wrap{flex-direction:column;align-items:flex-start}
  }
  /* Phones. The fixed header ran 106–133px, its button wrapped onto two or three
     lines and ran into the wordmark, and an iPhone SE could not see the hero
     button. One compact row (68px, 60px scrolled), a hero whose button clears the
     fold at 375x553, a 12px floor on labels and 44px tap targets. */
  @media(max-width:600px){
    .wrap{padding:0 20px}
    header{padding:12px 0}
    header.scrolled{padding:8px 0}
    header .wrap{gap:12px}
    header .wordmark{font-size:min(18px,${wmVw}vw);white-space:nowrap;padding:10px 0;margin:-10px 0}
    .nav-cta{flex:none;display:inline-block;line-height:44px;padding:0 16px;font-size:.75rem;letter-spacing:.05em;white-space:nowrap}
    .nav-cta .cta-x{display:none}
    .hero-inner{padding:88px 0 76px}
    .chip{font-size:.75rem;letter-spacing:.08em;padding:7px 14px;margin-bottom:16px}
    .hero h1{font-size:clamp(2rem,9.2vw,2.5rem);line-height:1.06}
    .hero p.sub{margin:16px 0 24px;font-size:1rem;line-height:1.55}
    .btn{padding:16px 28px}
    .kicker,.stat small,.gallery-grid figcaption,label{font-size:.75rem}
    summary{min-height:44px}
  }
  @media(max-width:359px){
    .wrap{padding:0 16px}
    header .wrap{gap:10px}
    .nav-cta{padding:0 12px}
  }
</style>
</head>
<body>

<header id="hdr">
  <div class="wrap">
    <a class="wordmark" href="#top">${esc(b.short)}<span>${esc(b.accent)}</span></a>
    <a class="nav-cta" href="#signup">${navLabel}</a>
  </div>
</header>

<div class="hero" id="top">
  <div class="wrap">
    <div class="hero-inner">
      <span class="chip">${esc(b.chip)}</span>
      <h1>${b.h1.map((l, i) => (i === b.h1.length - 1 ? `<span class="aqua">${esc(l)}</span>` : esc(l))).join("<br>")}</h1>
      <p class="sub">${esc(b.sub)}</p>
      <a class="btn btn-aqua" href="#signup">${ctaLabel}</a>
      <a class="btn btn-ghost" href="#building">See the Building</a>
    </div>
  </div>
  <div class="hero-ticker"><div>${ticker} &nbsp;·&nbsp; ${ticker} &nbsp;·&nbsp; </div></div>
</div>

<div class="stats">
  <div class="wrap">
${b.stats.map(([v, l]) => `    <div class="stat reveal"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join("\n")}
  </div>
</div>

<section id="building">
  <div class="wrap">
    <div class="split">
      <div class="reveal">
        <p class="kicker">${esc(b.kicker)}</p>
        <h2>${esc(b.h2)}</h2>
${b.body.map((t) => `        <p class="prose">${esc(t)}</p>`).join("\n")}
      </div>
      <img class="reveal" src="img/split.jpg" alt="${esc(splitAlt)}" loading="lazy">
    </div>
  </div>
</section>

<section class="alt" style="padding-top:90px">
  <div class="wrap">
    <p class="kicker reveal">Why this building</p>
    <h2 class="reveal">What makes ${esc(b.name)} worth tracking</h2>
    <div class="cards">
${b.cards.map(([t, d], i) => `      <div class="card reveal"><span class="num">0${i + 1}</span><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join("\n")}
    </div>
  </div>
</section>

<div class="midcta reveal">
  <div class="wrap">
    <p>${esc(isWait
      ? `${b.name} pricing goes to this list before it reaches the listing sites.`
      : `Tell us what you need and we'll come back with what's actually open at ${b.name}.`)}</p>
    <a class="btn btn-aqua" href="#signup">${ctaLabel}</a>
  </div>
</div>

<section>
  <div class="wrap">
    <p class="kicker reveal">The Neighborhood</p>
    <h2 class="reveal" style="margin-bottom:44px">${esc(b.hood)}, on foot</h2>
    <div class="gallery-grid">
      <figure class="reveal"><img src="img/g1.jpg" alt="${esc(b.name)} — ${esc(cap[0])}" loading="lazy"><figcaption>${esc(cap[0])}</figcaption></figure>
      <figure class="reveal"><img src="img/g2.jpg" alt="${esc(b.name)} — ${esc(cap[1])}" loading="lazy"><figcaption>${esc(cap[1])}</figcaption></figure>
      <figure class="reveal"><img src="img/g3.jpg" alt="${esc(b.name)} — ${esc(cap[2])}" loading="lazy"><figcaption>${esc(cap[2])}</figcaption></figure>
    </div>
  </div>
</section>

<section style="padding-top:0">
  <div class="wrap">
    <p class="kicker reveal">FAQ</p>
    <h2 class="reveal" style="margin-bottom:36px">Quick answers</h2>
${b.faq.map(([q, a]) => `    <details class="reveal"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
  </div>
</section>

<div class="cta-band" id="signup">
  <div class="wrap">
    <div class="cta-grid">
      <div class="reveal">
        <p class="kicker" style="color:${p.pale}">${isSoon ? "First Access" : isWait ? "The Waitlist" : "Availability Check"}</p>
        <h2>${esc(isSoon && b.soon ? b.soon.h2 : b.ctaH2)}</h2>
        <p class="prose">${esc(isSoon && b.soon ? b.soon.p : b.ctaP)}</p>
${hasInventory ? `        <div class="inv" data-inv hidden>
          <b data-inv-count></b>
          <span data-inv-detail></span>
          <em data-inv-asof></em>
        </div>` : ""}
      </div>
      <form data-lead class="reveal">
        <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
        <label for="name">Name</label>
        <input id="name" name="name" type="text" required placeholder="Your name" autocomplete="name">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required placeholder="you@email.com" autocomplete="email">
        <label for="phone">Phone / WhatsApp</label>
        <input id="phone" name="phone" type="tel" required placeholder="+1 305 555 0123" autocomplete="tel" inputmode="tel">
        <label for="unit">Interested in</label>
        <select id="unit" name="unit_type"><option>Studio</option><option>1 Bedroom</option><option>2 Bedroom</option><option>3 Bedroom</option><option>Not sure yet</option></select>
        <label for="movein">Target move-in</label>
        <select id="movein" name="move_in">${b.moveIn.map((m) => `<option>${esc(m)}</option>`).join("")}</select>
        <button class="btn btn-aqua" type="submit">${ctaLabel}</button>
        <p class="fineprint">Looking more broadly? <a href="https://staycio.com?utm_source=${utm}&utm_medium=microsite">Browse Miami apartments on Staycio →</a></p>
      </form>
    </div>
  </div>
</div>

<footer>
  <div class="wrap">
    <span class="wordmark">${esc(b.domain.toUpperCase())}</span>
    <p>© ${new Date().getFullYear()} ${esc(b.domain)} — an independent rental information resource curated by <a href="https://staycio.com">Staycio</a>. This is not the official website of, and is not affiliated with or endorsed by${b.developer ? ", " + esc(b.developer) + " or" : ""} the owners or leasing agents of ${esc(b.name)}. Building names are used for identification only.${b.credit ? " " + esc(b.credit) + "." : ""} Details compiled from public reporting and believed accurate as of ${b.verified || VERIFIED} — always verify with the official leasing office.</p>
  </div>
</footer>

<script>
(function(){
  var hdr=document.getElementById("hdr");
  addEventListener("scroll",function(){hdr.classList.toggle("scrolled",scrollY>40)},{passive:true});
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{threshold:.12});
  document.querySelectorAll(".reveal").forEach(function(el){io.observe(el)});
  var form=document.querySelector("form[data-lead]");if(!form)return;
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var btn=form.querySelector("button[type=submit]");var old=btn.textContent;
    btn.disabled=true;btn.textContent="Sending…";
    var data={};new FormData(form).forEach(function(v,k){data[k]=v;});
    data.domain=${JSON.stringify(b.domain)};data.building=${JSON.stringify(b.name)};
    fetch("https://staycio.com/api/microsite-leads",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})
      .then(function(r){if(!r.ok)return r.json().catch(function(){return{};}).then(function(j){throw new Error(j.error||"Something went wrong");});return r.json();})
      .then(function(){if(window.__scTrack)window.__scTrack("form_submit");form.innerHTML='<p style="font-family:var(--display);font-weight:700;font-size:1.5rem">${isWait ? "You\\'re on the list! 🎉" : "Got it! 🎉"}</p><p style="color:var(--muted-dark);margin-top:10px">${isWait ? "We\\'ll email you the moment pricing and availability drop." : "We\\'ll come back with what\\'s actually available, usually within a day."}</p>';})
      .catch(function(err){
        btn.disabled=false;btn.textContent=old;
        var m=form.querySelector(".form-error");
        if(!m){m=document.createElement("p");m.className="form-error";m.style.cssText="color:#c0392b;font-size:.9rem;margin-top:12px";form.appendChild(m);}
        m.textContent=(err&&err.message?err.message:"Something went wrong")+" — please try again.";
      });
  });
})();
</script>
${hasInventory ? `<script>
/* Live availability strip. Fails silent by design: any error, any stale or
   missing data, and the strip simply never unhides, leaving the page exactly as
   it renders without JS. The one thing it must never do is state a number the
   building cannot back up. */
(function(){
  var box=document.querySelector("[data-inv]");if(!box)return;
  fetch("https://staycio.com/api/microsite-inventory?domain="+encodeURIComponent(${JSON.stringify(b.domain)}))
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      if(!d||!d.available)return;
      var beds=(d.beds||[]).map(function(n){return n===0?"studio":n+"BR";});
      box.querySelector("[data-inv-count]").textContent=d.available+(d.available===1?" home open now":" homes open now");
      var bits=[];
      if(d.rentMin)bits.push(d.rentMin===d.rentMax?"$"+d.rentMin.toLocaleString()+"/mo":"$"+d.rentMin.toLocaleString()+"–$"+d.rentMax.toLocaleString()+"/mo");
      if(beds.length)bits.push(beds.join(", "));
      box.querySelector("[data-inv-detail]").textContent=bits.length?"· "+bits.join(" · "):"";
      if(d.asOf)box.querySelector("[data-inv-asof]").textContent="Verified "+d.asOf;
      box.hidden=false;
      if(window.__scTrack)window.__scTrack("inventory_shown",{available:d.available});
    })
    .catch(function(){});
})();
</script>` : ""}
<script>
/* Staycio microsite analytics — anonymous, first-party, no cookies. */
(function(){
  var D=${JSON.stringify(b.domain)}, EP="https://staycio.com/api/microsite-analytics";
  var sid;
  try{
    sid=localStorage.getItem("_sc_sid");
    if(!sid){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("_sc_sid",sid);}
  }catch(e){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);}
  function send(p,beacon){
    p.domain=D;p.session_id=sid;p.path=location.pathname;
    var b=JSON.stringify(p);
    try{
      if(beacon&&navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([b],{type:"application/json"}));return;}
      fetch(EP,{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true}).catch(function(){});
    }catch(e){}
  }
  window.__scTrack=function(name,props){send({type:"event",event_name:name,properties:props||{}});};
  send({type:"pageview",referrer:document.referrer||null});
  var hit={};
  addEventListener("scroll",function(){
    var h=document.documentElement.scrollHeight-innerHeight;
    if(h<=0)return;
    var p=Math.round(scrollY/h*100);
    [25,50,75,100].forEach(function(m){
      if(!hit[m]&&p>=m){hit[m]=1;send({type:"event",event_name:"scroll_depth",properties:{depth:m}});}
    });
  },{passive:true});
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a,button");if(!a)return;
    var label=(a.textContent||"").trim().slice(0,60);
    var href=a.getAttribute("href")||null;
    if(href&&href.indexOf("staycio.com")>-1){send({type:"event",event_name:"staycio_click",properties:{label:label}});return;}
    if(a.className&&/btn|nav-cta/.test(a.className)){send({type:"event",event_name:"cta_click",properties:{label:label,href:href}});}
  });
  var started=false;
  document.addEventListener("focusin",function(e){
    if(started||!e.target.closest)return;
    if(!e.target.closest("form[data-lead]"))return;
    started=true;send({type:"event",event_name:"form_start"});
  });
  var t0=Date.now(),sent=false;
  addEventListener("visibilitychange",function(){
    if(document.visibilityState==="hidden"&&!sent){
      sent=true;send({type:"event",event_name:"time_on_page",properties:{ms:Date.now()-t0}},true);
    }
  });
})();
</script>
${stacyBlock({
  domain: b.domain,
  accent: p.a,
  ink: p.ink,
  greeting: stacyGreeting({
    name: b.name,
    // "in the Arts & Entertainment District", not "in Arts & Entertainment District"
    area: !b.hood ? "Miami" : /District$/.test(b.hood) ? `the ${b.hood}` : b.hood,
    open: tier === "availability",
  }),
})}
</body>
</html>
`;
}

// What Stacy's microsite chat knows about this page's building: exactly what
// the page publishes, so the chat can never contradict it. Written to the
// platform as src/lib/voice/microsite-facts.generated.json on every build.
function stacyFacts(b) {
  const t = tierOf(b);
  const size = [b.units && `${b.units} rental residences`, b.stories && `${b.stories} stories`]
    .filter(Boolean).join(", ");
  return [
    `${[b.name, b.address !== b.hood && b.address, b.hood].filter(Boolean).join(", ")}, Miami FL ${b.zip}.`,
    size && `${size}.`,
    b.developer && `Developer: ${b.developer}.`,
    t === "availability"
      ? "Status: operating and leasing now."
      : `Status: NOT leasing yet (${b.eta}). Don't promise a date beyond that.`,
    b.sub,
    ...b.faq.map(([q, a]) => `Q: ${q} A: ${a}`),
    `(Page facts last checked ${b.verified || VERIFIED}; published rents are snapshots, not quotes.)`,
  ].filter(Boolean).join(" ");
}

// First candidate at or under `max` characters, after dropping the "null" hood
// variants and collapsing the double spaces an empty `when` leaves behind.
function fit(max, candidates) {
  const clean = candidates
    .filter((c) => !/\bnull\b/.test(c))
    .map((c) => c.replace(/\s{2,}/g, " ").replace(/\s+,/g, ","));
  return clean.find((c) => c.length <= max) || clean[clean.length - 1];
}

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

fs.writeFileSync(
  path.join(ROOT, "..", "src", "lib", "voice", "microsite-facts.generated.json"),
  JSON.stringify(Object.fromEntries(BUILDINGS.map((b) => [b.domain, stacyFacts(b)])), null, 2) + "\n"
);

let made = 0;
const work = [];
// Buildings whose delivery date has passed while the page still runs waitlist
// copy. Collected rather than thrown on, so one stale record cannot block
// regenerating the other eighteen sites — but the run exits non-zero so it
// cannot be missed either.
const opened = [];
const crossing = [];
// Pre-leasing buildings with no announced date. They are exempt from the guard
// above by construction, so the only thing standing between them and a stale
// waitlist is someone noticing — print them on every run rather than letting
// them be silently unguarded.
const undated = [];
for (const b of BUILDINGS) {
  const t = tierOf(b);
  if (t === "opened") opened.push(b);
  if (t === "soon") crossing.push(b);
  if (b.mode === "waitlist" && !b.delivers) undated.push(b);
  const dir = path.join(ROOT, b.domain);
  fs.mkdirSync(path.join(dir, "img"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(b));
  fs.writeFileSync(path.join(dir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: https://${b.domain}/sitemap.xml\n`);
  fs.writeFileSync(path.join(dir, "sitemap.xml"),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://${b.domain}/</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);
  fs.writeFileSync(path.join(dir, `${VERIFY}.txt`), VERIFY + "\n");
  fs.writeFileSync(path.join(dir, ".gitignore"), ".vercel\n");
  const pool = POOL[THEME[b.domain]];
  // Every site in a theme used to take pool[0] as its hero, so six operating
  // buildings opened on the same kitchen and five pre-construction pages on the
  // same crane. Offsetting by the site's position within its theme gives each
  // a different hero (six images per pool, at most six sites per theme).
  const themeIdx = BUILDINGS.filter((x) => THEME[x.domain] === THEME[b.domain])
    .findIndex((x) => x.domain === b.domain);
  work.push(
    ...SLOTS.map(async (slot, i) => {
      const own = path.join(PHOTOS, b.domain, slot);
      const src = fs.existsSync(own) ? own : path.join(ROOT, pool[(i + themeIdx) % pool.length]);
      if (!fs.existsSync(src)) return;
      const [w, q] = OPTIMIZE[slot];
      const buf = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: q, progressive: true, mozjpeg: true }).toBuffer();
      fs.writeFileSync(path.join(dir, "img", slot), buf);
    })
  );
  made++;
  console.log(`  ✓ ${b.domain}`);
}
Promise.all(work).then(() => {
  console.log(`\nGenerated ${made} microsites (images optimized).`);

  // Two pages opening on the same photo is the templated look this whole
  // portfolio is trying not to have. Heroes come from per-theme pools with a
  // per-site offset, but the pools share a few sources, so check the output.
  const heroes = new Map();
  for (const b of BUILDINGS) {
    const f = path.join(ROOT, b.domain, "img", "hero.jpg");
    if (!fs.existsSync(f)) continue;
    const h = crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");
    heroes.set(h, [...(heroes.get(h) || []), b.domain]);
  }
  const shared = [...heroes.values()].filter((d) => d.length > 1);
  if (shared.length) {
    console.warn(`\n  Same hero image on more than one site — adjust POOL or THEME:`);
    for (const d of shared) console.warn(`    · ${d.join(", ")}`);
  }

  if (undated.length) {
    console.log(`\n  No delivery date — NOT covered by the stale-waitlist guard, review by hand:`);
    for (const b of undated) console.log(`    · ${b.domain} (${b.name}, "${b.eta}")`);
  }

  if (crossing.length) {
    console.log(`\n  Within ${SOON_DAYS} days of delivery — running first-access copy:`);
    for (const b of crossing) console.log(`    · ${b.domain} (${b.name}, ${b.delivers})`);
  }

  if (opened.length) {
    console.error(`\n  ✗ ${opened.length} building(s) passed their delivery date and still carry waitlist copy:`);
    for (const b of opened) console.error(`    · ${b.domain} (${b.name}, delivers ${b.delivers})`);
    console.error(
      `\n  These pages are now selling a waitlist for a building that has opened.\n` +
      `  That is what dropped namdartowers.com to ~1% conversion on real search traffic.\n` +
      `  Fix: rewrite the entry as mode:"availability" with real rents, or push \`delivers\`\n` +
      `  out if the date actually slipped. Pages were still written.`
    );
    process.exitCode = 1;
  }
});
