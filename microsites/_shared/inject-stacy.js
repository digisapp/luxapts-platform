// Puts Stacy (tap-to-call + chat bubble) on the hand-built microsites.
//
//   node microsites/_shared/inject-stacy.js
//
// Idempotent: replaces everything between <!-- stacy:start --> and
// <!-- stacy:end --> (or inserts it before </body> the first time).
// Deploy the platform (/api/microsite-chat) BEFORE any page carrying this.

const fs = require("fs");
const path = require("path");
const { stacyBlock, stacyGreeting } = require("./stacy.js");

// Generated pages get the widget from _generator/build.js instead.
const SITES = [
  { domain: "downtown6miami.com", accent: "#00c2cb", ink: "#041f22",
    greeting: stacyGreeting({ name: "Downtown 6", area: "Downtown Miami", open: true }) },
  { domain: "namdartowers.com", accent: "#c8a96a", ink: "#0a0f1e",
    greeting: stacyGreeting({ name: "Namdar Towers", area: "Downtown Miami", open: true }) },
  { domain: "perrinbrickell.com", accent: "#c9b8e4", ink: "#181228",
    greeting: stacyGreeting({ name: "The Perrin", area: "Brickell", open: false }) },
  { domain: "jadebrickell.com", accent: "#cdb380", ink: "#0c1f18",
    greeting: stacyGreeting({ name: "Jade Brickell", area: "Brickell", open: true }) },
  { domain: "sentralbrickell.com", accent: "#c1663c", ink: "#241a13",
    greeting: stacyGreeting({ name: "Sentral Brickell", area: "Brickell", open: false }) },
  { domain: "midtown5apartments.com", accent: "#ff4d5e", ink: "#1a0f14",
    greeting: stacyGreeting({ name: "Midtown 5", area: "Midtown Miami", open: true }) },
];

const START = "<!-- stacy:start";
const END = "<!-- stacy:end -->";

for (const site of SITES) {
  const file = path.join(__dirname, "..", site.domain, "index.html");
  let html = fs.readFileSync(file, "utf8");
  const block = stacyBlock(site);

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
