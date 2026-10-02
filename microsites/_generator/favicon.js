// Favicons for the microsites: a rounded tile in the site's ink colour with
// the building's monogram in its accent colour. Rendered to PNG with sharp so
// every browser and Google's result-page icon show the same thing; an SVG
// favicon would depend on whichever font the viewer's machine resolves.
//
// Written per site by build.js (generated pages) and favicons-handbuilt.mjs
// (the six hand-written pages). Both call writeFavicons(dir, {ink, accent, mono}).
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const STOP = new Set(["the", "at", "on", "of", "and"]);

// Where the rule below gives the wrong answer: a place name that is not part
// of the brand, an acronym, or two buildings that would otherwise share a tile.
const OVERRIDES = {
  "JEM Miami Worldcenter": "JEM",
  "Kenect Miami": "K",
  "Mohawk at Wynwood": "M",
};

// "Downtown 6" -> D6, "2600 Biscayne" -> 26, "Jade Brickell" -> JB, "Kenect" -> K.
function monogram(name) {
  if (OVERRIDES[name]) return OVERRIDES[name];
  const t = name.split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  if (t.length === 0) return "?";
  if (/^\d+$/.test(t[0])) return t[0].slice(0, 2);
  const first = t[0][0].toUpperCase();
  if (t.length === 1) return first;
  const second = t[1];
  if (/^\d/.test(second)) return first + second.replace(/\D/g, "").slice(0, 2);
  return first + second[0].toUpperCase();
}

function tileSvg({ ink, accent, mono }, { size = 64, radius = 14 } = {}) {
  const fontSize = { 1: 40, 2: 32, 3: 24 }[Math.min(mono.length, 3)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<rect width="64" height="64" rx="${radius}" ry="${radius}" fill="${ink}"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="${accent}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="${mono.length > 1 ? -1 : 0}">${mono}</text>
</svg>`.replace(/\n/g, "");
}

// ICO container holding PNG images (every current browser reads PNG-in-ICO).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

async function png(spec, size, radius) {
  return sharp(Buffer.from(tileSvg(spec, { size, radius }))).png().toBuffer();
}

/** Writes favicon.ico (16/32/48), favicon-32.png, favicon-48.png and apple-touch-icon.png into dir. */
async function writeFavicons(dir, spec) {
  const [p16, p32, p48, p180] = await Promise.all([
    png(spec, 16, 3), png(spec, 32, 7), png(spec, 48, 10),
    // iOS rounds the corners itself; a pre-rounded tile would show a black frame.
    png(spec, 180, 0),
  ]);
  fs.writeFileSync(path.join(dir, "favicon.ico"), ico([{ size: 16, buf: p16 }, { size: 32, buf: p32 }, { size: 48, buf: p48 }]));
  fs.writeFileSync(path.join(dir, "favicon-32.png"), p32);
  fs.writeFileSync(path.join(dir, "favicon-48.png"), p48);
  fs.writeFileSync(path.join(dir, "apple-touch-icon.png"), p180);
}

/** The <head> tags every microsite carries. */
function faviconTags(ink) {
  return [
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`,
    `<meta name="theme-color" content="${ink}">`,
  ].join("\n");
}

module.exports = { monogram, tileSvg, writeFavicons, faviconTags };
