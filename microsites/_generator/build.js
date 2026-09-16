#!/usr/bin/env node
/**
 * Generates a self-contained microsite per building, matching the structure of
 * the hand-built downtown6miami.com page (the top performer: 461 views, 60 leads).
 * Run:  node microsites/_generator/build.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const BUILDINGS = require("./buildings.js");

const ROOT = path.join(__dirname, "..");
const TODAY = new Date().toISOString().slice(0, 10);
const VERIFY = "b3cf5795b633271ae0b26ee982d06033";

// Image pool drawn from the existing sites (generic Miami stock already licensed
// for this use). Keyed by the mood each page needs.
const POOL = {
  construction: ["downtown6miami.com/img/construction.jpg", "downtown6miami.com/img/const-01.jpg",
    "downtown6miami.com/img/const-03.jpg", "downtown6miami.com/img/const-05.jpg",
    "downtown6miami.com/img/const-11.jpg", "downtown6miami.com/img/const-15.jpg"],
  skyline: ["namdartowers.com/img/downtown.jpg", "namdartowers.com/img/downtown-night.jpg",
    "namdartowers.com/img/bayfront.jpg", "namdartowers.com/img/worldcenter.jpg",
    "namdartowers.com/img/tower-rendering.jpg", "jadebrickell.com/img/skyline.jpg"],
  interior: ["midtown5apartments.com/img/living.jpg", "midtown5apartments.com/img/kitchen.jpg",
    "midtown5apartments.com/img/pool.jpg", "midtown5apartments.com/img/lounge.jpg",
    "midtown5apartments.com/img/fitness.jpg", "midtown5apartments.com/img/pool2.jpg"],
  bay: ["jadebrickell.com/img/bay.jpg", "jadebrickell.com/img/tower.jpg", "jadebrickell.com/img/street.jpg",
    "sentralbrickell.com/img/brickell.jpg", "sentralbrickell.com/img/tower.jpg",
    "sentralbrickell.com/img/tower2.jpg"],
};
// hero, split, g1, g2, g3, cta  — six slots per site.
const THEME = {
  "2600biscaynemiami.com": "construction", "jemmiamiapartments.com": "skyline",
  "kenectmiamiapartments.com": "skyline", "3333biscaynemiami.com": "construction",
  "biscayne18.com": "construction", "urban22edgewater.com": "construction",
  "downtown5miami.com": "interior", "panoramatowerbrickell.com": "bay",
  "maizonbrickell.com": "interior", "muzemet.com": "interior",
  "remitheriver.com": "interior", "artplazaapartments.com": "bay",
  "miamiworldtowerapartments.com": "skyline",
};
const SLOTS = ["hero.jpg", "split.jpg", "g1.jpg", "g2.jpg", "g3.jpg", "cta.jpg"];
// Source stock runs 1–1.5MB per file. Heroes at that weight tank Largest
// Contentful Paint, and these pages exist to rank — so every copy is resized
// to its real display width and re-encoded. OPTIMIZE maps slot -> [width, quality].
const OPTIMIZE = { "hero.jpg": [1920, 74], "cta.jpg": [1920, 74], "split.jpg": [1200, 76],
  "g1.jpg": [900, 76], "g2.jpg": [900, 76], "g3.jpg": [900, 76] };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(b) {
  const p = b.palette;
  const isWait = b.mode === "waitlist";
  const utm = b.domain.replace(/\.com$/, "");
  const title = isWait
    ? `${b.name} — ${b.hood} Apartments ${b.eta} | Waitlist, Rents & Floor Plans`
    : `${b.name} Apartments — ${b.hood}, Miami | Availability, Rents & Floor Plans`;
  const desc = isWait
    ? `${b.name}: ${b.units ? b.units.toLocaleString() + " rental apartments " : ""}at ${b.address}, ${b.hood}, Miami${b.developer ? ", by " + b.developer : ""}. ${b.eta}. Join the waitlist for rents and floor plans.`
    : `${b.name} at ${b.address}, ${b.hood}, Miami${b.units ? " — " + b.units.toLocaleString() + " rental residences" : ""}. Check real availability, rents and floor plans.`;
  const ctaLabel = isWait ? "Join the Waitlist" : "Check Availability";
  const navLabel = isWait ? "Get Pricing First" : "Check Availability";
  const ticker = b.ticker.join(" &nbsp;·&nbsp; ");

  const ld = {
    "@context": "https://schema.org", "@type": "ApartmentComplex", name: b.name,
    description: desc,
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
<meta property="og:title" content="${esc(b.name)} — ${esc(b.hood)}, Miami">
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

  .hero{position:relative;min-height:100vh;display:flex;align-items:center;color:#fff;
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
  footer .wordmark{font-size:1rem;display:inline-block;margin-bottom:18px}
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
      <img class="reveal" src="img/split.jpg" alt="${esc(b.name)} — ${esc(b.hood)}, Miami" loading="lazy">
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

<section>
  <div class="wrap">
    <p class="kicker reveal">The Neighborhood</p>
    <h2 class="reveal" style="margin-bottom:44px">${esc(b.hood)}, on foot</h2>
    <div class="gallery-grid">
      <figure class="reveal"><img src="img/g1.jpg" alt="${esc(b.hood)}, Miami" loading="lazy"><figcaption>${esc(b.hood)}</figcaption></figure>
      <figure class="reveal"><img src="img/g2.jpg" alt="${esc(b.name)} area" loading="lazy"><figcaption>The Area</figcaption></figure>
      <figure class="reveal"><img src="img/g3.jpg" alt="Miami skyline" loading="lazy"><figcaption>The View</figcaption></figure>
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
        <p class="kicker" style="color:${p.pale}">${isWait ? "The Waitlist" : "Availability Check"}</p>
        <h2>${esc(b.ctaH2)}</h2>
        <p class="prose">${esc(b.ctaP)}</p>
      </div>
      <form data-lead class="reveal">
        <input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
        <label for="name">Name</label>
        <input id="name" name="name" type="text" required placeholder="Your name">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required placeholder="you@email.com">
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
    <p>© ${new Date().getFullYear()} ${esc(b.domain)} — an independent rental information resource curated by <a href="https://staycio.com">Staycio</a>. This is not the official website of, and is not affiliated with or endorsed by${b.developer ? ", " + esc(b.developer) + " or" : ""} the owners or leasing agents of ${esc(b.name)}. Building names are used for identification only. Details compiled from public reporting and believed accurate as of ${TODAY} — always verify with the official leasing office.</p>
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
</body>
</html>
`;
}

function hexA(hex, a) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let made = 0;
const work = [];
for (const b of BUILDINGS) {
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
  work.push(
    ...SLOTS.map(async (slot, i) => {
      const src = path.join(ROOT, pool[i % pool.length]);
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
Promise.all(work).then(() => console.log(`\nGenerated ${made} microsites (images optimized).`));
