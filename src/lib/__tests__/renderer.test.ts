import { describe, it, expect } from "vitest";
import { needsJsRendering } from "../scraper/renderer";

const richPage = `<!DOCTYPE html><html><body>
  <h1>The Continuum Residences</h1>
  <p>${"Luxury waterfront living with resort-style amenities. ".repeat(30)}</p>
  <div>Studio from $2,800 · 1BR from $3,900 · 2BR from $6,200</div>
</body></html>`;

const spaShell = `<!DOCTYPE html><html><head>
  <script src="/static/js/main.8f3a2b.js"></script>
</head><body><div id="root"></div></body></html>`;

const entrataShell = `<!DOCTYPE html><html><head>
  <script src="https://cdn.entrata.com/js/widget.js"></script>
</head><body>
  <div id="app">Loading floor plans…</div>
  <p>Welcome to our community. Contact us today to schedule a visit and see everything we have to offer residents.</p>
  <p>${"Amenity ".repeat(80)}</p>
</body></html>`;

describe("needsJsRendering", () => {
  it("keeps server-rendered pages on the fetch path", () => {
    expect(needsJsRendering(richPage)).toBe(false);
  });

  it("flags an empty SPA shell", () => {
    expect(needsJsRendering(spaShell)).toBe(true);
  });

  it("flags known leasing platforms with thin content", () => {
    expect(needsJsRendering(entrataShell)).toBe(true);
  });

  it("flags empty input", () => {
    expect(needsJsRendering("")).toBe(true);
  });

  it("ignores text inside scripts and styles", () => {
    const scriptHeavy = `<html><body><div id="root"></div><script>${"var x = 'lots of js'; ".repeat(200)}</script></body></html>`;
    expect(needsJsRendering(scriptHeavy)).toBe(true);
  });
});
