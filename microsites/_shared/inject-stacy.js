// Puts Stacy (tap-to-call + chat bubble) on the hand-built microsites.
//
//   node microsites/_shared/inject-stacy.js
//
// Idempotent: replaces everything between <!-- stacy:start --> and
// <!-- stacy:end --> (or inserts it before </body> the first time).
// Deploy the platform (/api/microsite-chat) BEFORE any page carrying this.

const fs = require("fs");
const path = require("path");

// All sites share Stacy's main line until per-building numbers exist (the
// LiveKit plan allows one number). Keep in sync with STACY_MAIN_LINE in
// src/lib/voice/prompt.ts.
const MAIN_LINE = { e164: "+13059521558", display: "(305) 952-1558" };

const SITES = [
  {
    domain: "downtown6miami.com",
    accent: "#00c2cb",
    ink: "#041f22",
    greeting:
      "Hi, I'm Stacy, Staycio's AI apartment assistant. Ask me about Downtown 6, or about Downtown Miami apartments you can move into sooner.",
  },
  {
    domain: "namdartowers.com",
    accent: "#c8a96a",
    ink: "#0a0f1e",
    greeting:
      "Hi, I'm Stacy, Staycio's AI apartment assistant. Ask me about Namdar Towers (Tower One leases as CMPND Miami), or other Downtown options.",
  },
  {
    domain: "perrinbrickell.com",
    accent: "#c9b8e4",
    ink: "#181228",
    greeting:
      "Hi, I'm Stacy, Staycio's AI apartment assistant. Ask me about The Perrin, or about Brickell apartments you can move into before it opens.",
  },
];

const START = "<!-- stacy:start";
const END = "<!-- stacy:end -->";
const template = fs.readFileSync(path.join(__dirname, "stacy-widget.html"), "utf8").trim();

for (const site of SITES) {
  const file = path.join(__dirname, "..", site.domain, "index.html");
  let html = fs.readFileSync(file, "utf8");
  const block = template
    .replaceAll("{{ACCENT}}", site.accent)
    .replaceAll("{{INK}}", site.ink)
    .replaceAll("{{PHONE_E164}}", MAIN_LINE.e164)
    .replaceAll("{{PHONE_DISPLAY}}", MAIN_LINE.display)
    .replaceAll("{{DOMAIN_JSON}}", JSON.stringify(site.domain))
    .replaceAll("{{GREETING_JSON}}", JSON.stringify(site.greeting));

  const s = html.indexOf(START);
  if (s !== -1) {
    const e = html.indexOf(END, s);
    if (e === -1) throw new Error(`${site.domain}: stacy:start without stacy:end`);
    html = html.slice(0, s) + block + html.slice(e + END.length);
  } else {
    const body = html.lastIndexOf("</body>");
    if (body === -1) throw new Error(`${site.domain}: no </body>`);
    html = html.slice(0, body) + block + "\n" + html.slice(body);
  }
  fs.writeFileSync(file, html);
  console.log(`stacy -> ${site.domain}`);
}
