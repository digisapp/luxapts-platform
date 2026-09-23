// Renders Stacy's floating Call + chat block for any microsite. Used by
// inject-stacy.js (hand-built pages) and _generator/build.js (generated ones),
// so every page carries the same widget from the same template.

const fs = require("fs");
const path = require("path");

// All sites share Stacy's main line until per-building numbers exist (the
// LiveKit plan allows one number). Keep in sync with STACY_MAIN_LINE in
// src/lib/voice/prompt.ts.
const MAIN_LINE = { e164: "+13059521558", display: "(305) 952-1558" };

const template = fs.readFileSync(path.join(__dirname, "stacy-widget.html"), "utf8").trim();

/** The chat's opening line. `open` = the building is leasing now. */
function stacyGreeting({ name, area, open }) {
  return open
    ? `Hi, I'm Stacy. I can help you explore ${name} availability or find apartments in ${area} that are available.`
    : `Hi, I'm Stacy. I can help you explore ${name} or find apartments in ${area} that are available now.`;
}

function stacyBlock({ domain, accent, ink, greeting }) {
  return template
    .replaceAll("{{ACCENT}}", accent)
    .replaceAll("{{INK}}", ink)
    .replaceAll("{{PHONE_E164}}", MAIN_LINE.e164)
    .replaceAll("{{PHONE_DISPLAY}}", MAIN_LINE.display)
    .replaceAll("{{DOMAIN_JSON}}", JSON.stringify(domain))
    .replaceAll("{{GREETING_JSON}}", JSON.stringify(greeting));
}

module.exports = { MAIN_LINE, stacyBlock, stacyGreeting };
