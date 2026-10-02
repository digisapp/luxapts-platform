// Favicons for the six hand-written microsites (the generated 17 get theirs
// from build.js). Writes the icon files into each site folder and inserts the
// <head> tags after the viewport meta if they are not there yet.
//
//     node microsites/_generator/favicons-handbuilt.js
//
// Colours are each page's own --ink and primary accent variable.
const fs = require("node:fs");
const path = require("node:path");
const { writeFavicons, faviconTags } = require("./favicon.js");

const SITES = [
  { domain: "downtown6miami.com", mono: "D6", ink: "#041f22", accent: "#00c2cb" },
  { domain: "namdartowers.com", mono: "NT", ink: "#0a0f1e", accent: "#c8a96a" },
  { domain: "perrinbrickell.com", mono: "P", ink: "#181228", accent: "#c9a24a" },
  { domain: "jadebrickell.com", mono: "JB", ink: "#0c1f18", accent: "#cdb380" },
  { domain: "sentralbrickell.com", mono: "SB", ink: "#241a13", accent: "#c1663c" },
  { domain: "midtown5apartments.com", mono: "M5", ink: "#1a0f14", accent: "#ff4d5e" },
];

(async () => {
  for (const s of SITES) {
    const dir = path.join(__dirname, "..", s.domain);
    await writeFavicons(dir, s);
    const file = path.join(dir, "index.html");
    let html = fs.readFileSync(file, "utf8");
    if (!html.includes('rel="icon"')) {
      const viewport = html.match(/<meta name="viewport"[^>]*>\n/);
      if (!viewport) throw new Error(`${s.domain}: no viewport meta to anchor the favicon tags`);
      html = html.replace(viewport[0], viewport[0] + faviconTags(s.ink) + "\n");
      fs.writeFileSync(file, html);
    }
    console.log(`${s.domain}: ${s.mono}`);
  }
})();
