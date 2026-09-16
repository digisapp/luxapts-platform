import { describe, it, expect } from "vitest";
import {
  isJunkImageUrl,
  isPropertySpecificUrl,
  readImageSize,
  MIN_PHOTO_WIDTH,
} from "@/lib/images/quality";

describe("isJunkImageUrl", () => {
  it("rejects site furniture that the extractor mistakes for photography", () => {
    // Every one of these was live on staycio.com as a listing thumbnail
    expect(isJunkImageUrl("https://420kent.com/wp-content/uploads/2019/02/cropped-favicon.png")).toBe(true);
    expect(isJunkImageUrl("https://lorimerhousebk.com/wp-content/plugins/bb-plugin/img/pixel.png")).toBe(true);
    expect(isJunkImageUrl("https://alcovenashville.com/images/og-image.jpg")).toBe(true);
    expect(isJunkImageUrl("https://quincyatx.com/assets/images/cache/og-image2-974.jpg")).toBe(true);
    expect(isJunkImageUrl("https://thegreenpoint.nyc/assets/images/cache/opengraph_the_greenpoint_1588-18e.jpg")).toBe(true);
    expect(isJunkImageUrl("https://cdn.carmel-apartments.com/asset/11769/ARQ_FPO_ImageCenterLogo.png")).toBe(true);
    expect(isJunkImageUrl("https://onewilliamsburgwharf.com/static/ae06d/alternative-oww-hero-placeholder.webp")).toBe(true);
    expect(isJunkImageUrl("https://example.com/assets/brand.svg")).toBe(true);
  });

  it("keeps real photography, including CDN-resized and cropped originals", () => {
    expect(isJunkImageUrl("https://thebrooklyntower.com/app/uploads/2025/04/brooklyn-tower-hero-1920x1033.jpg")).toBe(false);
    expect(isJunkImageUrl("https://westwharf.com/uploads/images/gallery/Rooftop.jpg")).toBe(false);
    // A real photo behind a resizer endpoint — the asset is in the query string
    expect(
      isJunkImageUrl(
        "https://sxxweb8cdn.cachefly.net/img/thumbnail.aspx?p=/common/uploads/zrs2019/622/media/3e246b5b.jpg&w=1920",
      ),
    ).toBe(false);
    // "Social Lounge" is an amenity, not a social-share card
    expect(isJunkImageUrl("https://www.willowbridgepc.com/uploads/851_The_Sevens_Social_Lounge.jpg")).toBe(false);
    expect(isJunkImageUrl("https://capitolviewnc.com/wp-content/uploads/2024/04/cropped-CVDSC_0093.jpg")).toBe(false);
  });

  it("rejects URLs it cannot parse", () => {
    expect(isJunkImageUrl("not-a-url")).toBe(true);
  });
});

describe("isPropertySpecificUrl", () => {
  it("rejects management-company pages that depict a portfolio", () => {
    expect(isPropertySpecificUrl("https://www.greystar.com/", "Novel Turtle Creek")).toBe(false);
    expect(isPropertySpecificUrl("https://www.greystar.com/", "555 Ross")).toBe(false);
    expect(isPropertySpecificUrl("https://www.rosenyc.com/", "21 West Street")).toBe(false);
    expect(isPropertySpecificUrl("https://www.willowbridgepc.com/", "Leksa at CityPlace")).toBe(false);
    expect(isPropertySpecificUrl("https://www.gothamproperties.com/", "The Maybury")).toBe(false);
    expect(isPropertySpecificUrl("https://rpmliving.com/", "Lookout Austin")).toBe(false);
  });

  it("accepts the property's own site, including abbreviated domains", () => {
    expect(isPropertySpecificUrl("https://420kent.com/", "420 Kent")).toBe(true);
    expect(isPropertySpecificUrl("https://www.waterlinesquare.com/", "Three Waterline Square")).toBe(true);
    expect(isPropertySpecificUrl("https://thecrownweho.com/", "The Crown West Hollywood")).toBe(true);
    expect(isPropertySpecificUrl("https://www.atlasny.com/", "Atlas New York")).toBe(true);
    expect(isPropertySpecificUrl("https://www.mosaicaustin.com/", "Mosaic at Mueller")).toBe(true);
  });

  it("accepts a per-property page on a management-company domain", () => {
    expect(
      isPropertySpecificUrl(
        "https://www.relatedrentals.com/apartment-rentals/new-york-city/chelsea/the-westminster",
        "The Westminster",
      ),
    ).toBe(true);
    expect(
      isPropertySpecificUrl("https://www.willowbridgepc.com/properties/brady-dallas-tx", "Brady"),
    ).toBe(true);
  });

  it("does not let a generic property noun carry the match on its own", () => {
    expect(isPropertySpecificUrl("https://parkwayproperties.com/", "Ascent Victory Park")).toBe(false);
    expect(isPropertySpecificUrl("https://towerliving.com/", "Manchester Tower")).toBe(false);
  });
});

describe("readImageSize", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };

  it("reads PNG dimensions", () => {
    expect(readImageSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    // A favicon is comfortably under the photo threshold
    expect(readImageSize(png(32, 32))!.width).toBeLessThan(MIN_PHOTO_WIDTH);
  });

  it("reads GIF dimensions", () => {
    const b = new Uint8Array(10);
    b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    new DataView(b.buffer).setUint16(6, 800, true);
    new DataView(b.buffer).setUint16(8, 600, true);
    expect(readImageSize(b)).toEqual({ width: 800, height: 600 });
  });

  it("reads JPEG dimensions from the start-of-frame marker", () => {
    const b = new Uint8Array(20);
    b.set([0xff, 0xd8, 0xff, 0xc0]);
    const v = new DataView(b.buffer);
    // SOF layout from the marker at byte 2: length, precision, height, width
    v.setUint16(4, 17);
    v.setUint16(7, 720); // height
    v.setUint16(9, 1280); // width
    expect(readImageSize(b)).toEqual({ width: 1280, height: 720 });
  });

  it("returns null for bytes it cannot measure", () => {
    expect(readImageSize(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
