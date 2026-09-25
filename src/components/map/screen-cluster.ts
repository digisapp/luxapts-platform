/**
 * Screen-space marker clustering.
 *
 * Price pins are wide pills ("From $2.2k 17"), so a radius-based cluster
 * (mapbox's GeoJSON clustering, supercluster) either lets pills overlap
 * sideways or swallows pins that don't touch. This merges on the rendered
 * boxes instead: every pin starts as its own box at its projected position,
 * any two boxes that overlap collapse into one count bubble at their mean
 * position, and that repeats until nothing overlaps. Recomputed after every
 * zoom; panning doesn't change relative screen positions.
 *
 * O(n^2) per pass, which is nothing at the ~200-pin search cap.
 */

export interface ClusterInput<T> {
  item: T;
  /** Projected screen position of the pin's anchor (its center) */
  x: number;
  y: number;
  /** Rendered pill size in px */
  w: number;
  h: number;
}

export interface ScreenCluster<T> {
  items: T[];
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * @param bubbleSize diameter of the count bubble for a cluster of n pins
 * @param gap minimum clear space kept between any two rendered boxes
 */
export function clusterByOverlap<T>(
  inputs: ClusterInput<T>[],
  bubbleSize: (count: number) => number,
  gap = 4
): ScreenCluster<T>[] {
  // sumX/sumY keep the centroid exact as clusters absorb each other
  const clusters = inputs.map((p) => ({
    items: [p.item],
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    sumX: p.x,
    sumY: p.y,
  }));

  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        const overlaps =
          Math.abs(a.x - b.x) * 2 < a.w + b.w + gap * 2 &&
          Math.abs(a.y - b.y) * 2 < a.h + b.h + gap * 2;
        if (!overlaps) continue;

        a.items.push(...b.items);
        a.sumX += b.sumX;
        a.sumY += b.sumY;
        const n = a.items.length;
        a.x = a.sumX / n;
        a.y = a.sumY / n;
        a.w = a.h = bubbleSize(n);
        clusters.splice(j, 1);
        // The grown cluster moved and changed size: rescan everything after it
        j = i;
        merged = true;
      }
    }
  }

  return clusters.map(({ items, x, y, w, h }) => ({ items, x, y, w, h }));
}
