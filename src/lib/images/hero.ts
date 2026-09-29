import { isJunkImageUrl } from "./quality";

export interface RankableImage {
  url: string;
  is_primary: boolean | null;
  sort_order: number | null;
}

/**
 * Photos per building that listing queries embed, in cover order:
 *   .order("is_primary", { referencedTable: "building_images", ascending: false, nullsFirst: false })
 *   .order("sort_order", { referencedTable: "building_images" })
 *   .limit(HERO_CANDIDATES, { referencedTable: "building_images" })
 * Listings only ever show one, but a couple of spares let a junk primary (a
 * logo, an OG share card) be skipped instead of becoming the card photo — and
 * the embed no longer pulls every image row of every building to pick one.
 */
export const HERO_CANDIDATES = 3;

/** A building's cover photo: primary first, then sort order, never site furniture. */
export function heroImageUrl(images: readonly RankableImage[] | null | undefined): string | null {
  const ranked = [...(images ?? [])].sort(
    (a, b) =>
      Number(!!b.is_primary) - Number(!!a.is_primary) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  return ranked.find((img) => !isJunkImageUrl(img.url))?.url ?? null;
}
