import { describe, it, expect } from "vitest";
import { collectImageCandidates } from "../scraper/image-candidates";

const BASE = "https://www.example-tower.com/gallery/";
const urls = (html: string) => collectImageCandidates(html, BASE).map((c) => c.url);

describe("collectImageCandidates", () => {
  it("finds photos buried after a large head and script bundle", () => {
    const head = `<head>${"<script>var x=1;</script>".repeat(10_000)}</head>`;
    const html = `${head}<body><img src="/wp-content/uploads/pool.jpg" alt="Rooftop pool"></body>`;
    expect(collectImageCandidates(html, BASE)).toEqual([
      { url: "https://www.example-tower.com/wp-content/uploads/pool.jpg", alt: "Rooftop pool", width: undefined },
    ]);
  });

  it("resolves relative URLs against the page they came from", () => {
    expect(urls(`<img src="images/lobby.jpg">`)).toEqual([
      "https://www.example-tower.com/gallery/images/lobby.jpg",
    ]);
  });

  it("takes the largest srcset entry and collapses sizes of one photo", () => {
    const html = `
      <img src="/uploads/facade-300x200.jpg"
           srcset="/uploads/facade-300x200.jpg 300w, /uploads/facade-1600x1067.jpg 1600w, /uploads/facade-768x512.jpg 768w">`;
    const found = collectImageCandidates(html, BASE);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ url: "https://www.example-tower.com/uploads/facade-1600x1067.jpg", width: 1600 });
  });

  it("reads lazy-load attributes, backgrounds and JSON data", () => {
    const html = `
      <meta property="og:image" content="https://cdn.example.com/share-card.jpg">
      <div data-bg="/media/gym.webp"></div>
      <section style="background-image: url('/media/rooftop.jpg')"></section>
      <img data-src="/media/kitchen.jpg">
      <script>{"gallery":[{"src":"https:\\/\\/images.ctfassets.net\\/abc\\/view"}]}</script>`;
    // og:image is left out: the page has real photos, and share cards
    // usually carry text printed over the picture
    expect(urls(html)).toEqual([
      "https://www.example-tower.com/media/gym.webp",
      "https://www.example-tower.com/media/rooftop.jpg",
      "https://www.example-tower.com/media/kitchen.jpg",
      "https://images.ctfassets.net/abc/view",
    ]);
  });

  it("drops logos, icons, svgs, data URIs and non-image links", () => {
    const html = `
      <img src="/uploads/logo.png"><img src="/favicon.ico"><img src="/icons/pin.svg">
      <img src="data:image/png;base64,AAAA"><a href="/floor-plans/">Plans</a>
      <a href="/uploads/terrace.jpg">Terrace</a>`;
    expect(urls(html)).toEqual(["https://www.example-tower.com/uploads/terrace.jpg"]);
  });

  it("falls back to og:image when the page has no other photos", () => {
    expect(urls(`<meta property="og:image" content="https://cdn.example.com/hero.jpg">`)).toEqual([
      "https://cdn.example.com/hero.jpg",
    ]);
  });

  it("decodes JSON escapes in URLs", () => {
    const html = `<script>{"image":"https:\\/\\/images.prismic.io\\/site\\/a.jpg?auto=compress\\u0026w=1200"}</script>`;
    expect(urls(html)).toEqual(["https://images.prismic.io/site/a.jpg?auto=compress&w=1200"]);
  });

  it("upgrades http image URLs to https", () => {
    expect(urls(`<img src="http://cdn.example.com/photo.jpg">`)).toEqual(["https://cdn.example.com/photo.jpg"]);
  });
});
