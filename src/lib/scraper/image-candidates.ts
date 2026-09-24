// Deterministic image discovery for building websites.
//
// Image extraction used to hand the model the first 120k characters of RAW
// HTML. On a modern leasing site that is almost entirely <head>, CSS and
// script bundles, so the model never saw an <img> tag and "succeeded" with
// zero photos — 118 active buildings were stuck that way. Collect every
// plausible photo URL here instead; the model only classifies this list.

import { isJunkImageUrl } from "@/lib/images/quality";

export interface ImageCandidate {
  url: string;
  alt?: string;
  /** Largest width advertised by srcset or a width attribute, if any. */
  width?: number;
}

const MAX_CANDIDATES = 150;

const ATTR_URL = /\b(?:src|data-src|data-lazy-src|data-original|data-bg|data-background|data-background-image|data-full|data-large|data-zoom|data-image|href)\s*=\s*["']([^"']+)["']/gi;
const SRCSET = /\b(?:srcset|data-srcset|data-lazy-srcset)\s*=\s*["']([^"']+)["']/gi;
const BG_URL = /url\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
const META_IMAGE = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi;
const JSON_IMAGE = /"(?:image|url|contentUrl|thumbnailUrl|src)"\s*:\s*"(https?:\\?\/\\?\/[^"]+?)"/gi;

const PHOTO_EXT = /\.(?:jpe?g|png|webp|avif)(?:$|[?#])/i;
// Resizers and CMS asset routes that serve photos without a file extension
const PHOTO_PATH_HINT = /\/(?:images?|photos?|media|uploads|assets|gallery|cdn-cgi\/image|_next\/image)\b|cloudinary|imgix|contentful|ctfassets|sanity|squarespace-cdn|wixstatic|cloudfront|amazonaws/i;

function resolve(raw: string, base: string): string | null {
  // URLs lifted from JSON keep their escapes (\/ and \u0026)
  const cleaned = raw
    .trim()
    .replace(/\\\//g, "/")
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("#") || cleaned.startsWith("javascript:")) {
    return null;
  }
  try {
    const u = new URL(cleaned, base);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function looksLikePhoto(url: string): boolean {
  if (isJunkImageUrl(url)) return false;
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return false;
  }
  if (/\.(?:svg|gif|ico|css|js|json|html?|pdf|mp4|webm|woff2?)(?:$|[?#])/i.test(path)) return false;
  return PHOTO_EXT.test(path) || PHOTO_PATH_HINT.test(url);
}

/** Same photo at different sizes collapses to one key. */
function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname)
      .toLowerCase()
      .replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "") // WordPress size suffix
      .replace(/@\dx(?=\.\w+$)/, "");
  } catch {
    return url;
  }
}

/** Largest `w` descriptor in a srcset, with its URL. */
function largestFromSrcset(srcset: string): { url: string; width?: number } | null {
  let best: { url: string; width?: number } | null = null;
  for (const part of srcset.split(/,\s+(?=\S)/)) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const width = descriptor?.endsWith("w") ? parseInt(descriptor, 10) : undefined;
    if (!best || (width ?? 0) > (best.width ?? 0)) best = { url, width };
  }
  return best;
}

/**
 * Every plausible photo on the page, in page order, deduplicated, junk
 * (logos, favicons, icons, share cards, tracking pixels) removed. Pure.
 */
export function collectImageCandidates(html: string, baseUrl: string): ImageCandidate[] {
  const found = new Map<string, ImageCandidate>();

  const add = (raw: string, extra: Omit<ImageCandidate, "url"> = {}) => {
    if (found.size >= MAX_CANDIDATES) return;
    const url = resolve(raw, baseUrl);
    if (!url || !looksLikePhoto(url)) return;
    const key = dedupeKey(url);
    const prev = found.get(key);
    if (!prev) {
      found.set(key, { url, ...extra });
    } else if ((extra.width ?? 0) > (prev.width ?? 0)) {
      found.set(key, { ...prev, url, width: extra.width, alt: prev.alt ?? extra.alt });
    } else if (!prev.alt && extra.alt) {
      prev.alt = extra.alt;
    }
  };

  // Tags carrying images, with their alt text
  for (const tag of html.match(/<(?:img|source|div|a|section|figure|li|span)\b[^>]*>/gi) ?? []) {
    const alt = tag.match(/\balt\s*=\s*["']([^"']{2,160})["']/i)?.[1]?.trim();
    const widthAttr = tag.match(/\bwidth\s*=\s*["']?(\d{2,5})/i)?.[1];
    const isAnchor = /^<a\b/i.test(tag);

    for (const m of tag.matchAll(SRCSET)) {
      const best = largestFromSrcset(m[1]);
      if (best) add(best.url, { alt, width: best.width });
    }
    for (const m of tag.matchAll(ATTR_URL)) {
      // An <a href> only counts when it points straight at an image file
      // (lightbox galleries); ordinary links are pages, not photos.
      if (isAnchor && !PHOTO_EXT.test(m[1])) continue;
      if (!isAnchor && /^href/i.test(m[0].trim())) continue;
      add(m[1], { alt, width: widthAttr ? parseInt(widthAttr, 10) : undefined });
    }
    for (const m of tag.matchAll(BG_URL)) add(m[1], { alt });
  }

  // Inline <style> blocks and JSON (JSON-LD, Next/Nuxt data, gallery configs)
  for (const m of html.matchAll(BG_URL)) add(m[1]);
  for (const m of html.matchAll(JSON_IMAGE)) add(m[1]);

  // Share cards (og:image) usually carry the building's name printed across
  // the photo. Use one only when the page offers no real photos.
  if (found.size < 3) {
    for (const tag of html.match(META_IMAGE) ?? []) {
      const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
      if (content) add(content);
    }
  }

  return [...found.values()];
}
