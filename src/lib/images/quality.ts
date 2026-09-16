/**
 * Quality gates for scraped listing photos.
 *
 * Leasing sites mix real photography with site furniture — favicons, brand
 * logos, tracking pixels, Open Graph share cards — and the HTML extractor
 * cannot reliably tell them apart. A thumbnail that turns out to be a logo,
 * a 1x1 pixel or a dead hotlink is worse than having no photo at all: the
 * card renders as if it were the building, so a listing looks wrong rather
 * than looking incomplete.
 *
 * Two gates, cheapest first:
 *   1. `isJunkImageUrl` — filename patterns that are never a property photo.
 *   2. `probeImage`     — fetches the header bytes to confirm the URL still
 *                         serves an image and that it is big enough to be
 *                         photography rather than an icon.
 */

/** Below this width an asset is an icon or a badge, not a property photo. */
export const MIN_PHOTO_WIDTH = 400;
/** Banners and slivers crop into unusable thumbnails. */
export const MAX_PHOTO_ASPECT = 4;

/**
 * Filename tokens that mark an asset as site furniture. Matched against the
 * last path segment only, so a directory like `/logos/` on a photo CDN does
 * not condemn a real photo stored beneath it.
 */
const JUNK_FILENAME =
  /(favicon|logo|sprite|spacer|placeholder|watermark|og-?images?|opengraph|social-?share|share-?image|no-?image|noimage)/i;

/** Whole-filename matches — too generic to match as substrings. */
const JUNK_EXACT = /^(pixel|blank|spacer|dot|1x1|transparent|default|placeholder)\.[a-z0-9]+$/i;

/** Vector and animated formats are branding, never listing photography. */
const JUNK_EXTENSION = /\.(svg|svgz|ico|gif|bmp|tiff?)($|\?)/i;

/** True when the URL is site furniture rather than a photo of the property. */
export function isJunkImageUrl(url: string): boolean {
  let filename: string;
  try {
    const parsed = new URL(url);
    // CDN resizers pass the real asset in the query string
    // (`thumbnail.aspx?p=/common/uploads/.../photo.jpg`), so judge that too.
    const candidates = [
      parsed.pathname.split("/").pop() ?? "",
      ...[...parsed.searchParams.values()].map((v) => v.split("/").pop() ?? ""),
    ];
    if (candidates.some((c) => JUNK_EXACT.test(c) || JUNK_FILENAME.test(c))) return true;
    filename = parsed.pathname;
  } catch {
    return true; // unparseable URL is not a usable photo
  }
  return JUNK_EXTENSION.test(filename) || JUNK_EXTENSION.test(url);
}

export interface ImageProbe {
  ok: boolean;
  status?: number;
  contentType?: string;
  width?: number;
  height?: number;
  /** Set when the image is unusable; suitable for logging. */
  reason?: string;
}

/** Width/height from the header bytes of the common raster formats. */
export function readImageSize(buf: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // PNG: 8-byte signature, then IHDR length+type, then width/height
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  // GIF: logical screen descriptor at byte 6, little-endian
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  // WebP: "RIFF" .... "WEBP" then a VP8 / VP8L / VP8X chunk
  if (
    buf.length >= 30 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === "VP8 ") {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { width: w + 1, height: h + 1 };
    }
  }

  // JPEG: walk the segment markers to the start-of-frame
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
      }
      i += 2 + view.getUint16(i + 2);
    }
  }

  return null;
}

/**
 * Confirm a scraped URL still serves a photo large enough to use. Reads only
 * the leading bytes — enough for the dimension headers, not the whole file.
 */
export async function probeImage(url: string, timeoutMs = 15_000): Promise<ImageProbe> {
  if (isJunkImageUrl(url)) return { ok: false, reason: "junk-url" };

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // Bare fetches get 403'd by origins that gate on a browser UA.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        range: "bytes=0-65535",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, reason: `fetch-failed: ${(e as Error).message}` };
  }

  if (!res.ok && res.status !== 206) {
    return { ok: false, status: res.status, reason: `http-${res.status}` };
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    // A 200 that serves HTML is a soft 404 — the listing page, not the photo.
    return { ok: false, status: res.status, contentType, reason: "not-an-image" };
  }

  const size = readImageSize(new Uint8Array(await res.arrayBuffer()));
  if (!size) {
    // Readable image bytes we cannot measure (AVIF, progressive variants).
    // Serving correctly is the thing that matters; let it through.
    return { ok: true, status: res.status, contentType };
  }

  const { width, height } = size;
  if (width < MIN_PHOTO_WIDTH) {
    return { ok: false, status: res.status, contentType, width, height, reason: `too-small-${width}px` };
  }
  const aspect = Math.max(width / height, height / width);
  if (aspect > MAX_PHOTO_ASPECT) {
    return { ok: false, status: res.status, contentType, width, height, reason: `bad-aspect-${aspect.toFixed(1)}` };
  }

  return { ok: true, status: res.status, contentType, width, height };
}

/**
 * Words that carry no identity — every third building is "The X Apartments".
 */
const NAME_STOPWORDS = new Set([
  "the", "at", "on", "of", "and", "a", "an", "by",
  "apartments", "apartment", "residences", "residence", "apts",
  "living", "luxury", "lofts", "loft", "homes", "rentals",
]);

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Does this URL point at *this* building, or at its management company?
 *
 * Ten Dallas properties all carry `website_url = https://www.greystar.com/`.
 * Scraping that page yields Greystar's corporate hero shot, which then becomes
 * the thumbnail for ten unrelated listings. A property-specific target names
 * the building somewhere in its host or path — `420kent.com`, or
 * `relatedrentals.com/.../the-westminster` — so require that before trusting
 * anything scraped from it to be a photo of this building.
 */
export function isPropertySpecificUrl(websiteUrl: string, buildingName: string): boolean {
  let haystack: string;
  try {
    const u = new URL(websiteUrl);
    haystack = alnum(u.hostname + u.pathname);
  } catch {
    return false;
  }

  const tokens = buildingName
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
    .filter((t) => !NAME_STOPWORDS.has(t));

  if (tokens.length === 0) return false;

  const matched = tokens.filter((t) => haystack.includes(t));
  // The most distinctive word has to be there — "square" or "tower" alone is
  // not evidence, and a bare majority of generic words is not either.
  const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  if (!haystack.includes(longest)) return false;

  return matched.length / tokens.length >= 0.5;
}
