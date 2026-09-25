"use client";

import { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { Building2 } from "lucide-react";

/**
 * next/image for scraped listing photos. The photos are hotlinks to building
 * sites, and ~15% of unit photos had gone 404 upstream (2026-09-25 audit), so
 * a card could render a broken-image icon. On error this swaps in the same
 * neutral tile used for listings without a photo. Use it with `fill` inside a
 * positioned box.
 */
export function SafeImage({ alt, ...props }: ImageProps) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white/[0.03]" aria-hidden="true">
        <Building2 className="h-1/4 max-h-10 w-1/4 max-w-10 text-white/15" />
      </div>
    );
  }
  return <Image alt={alt} {...props} onError={() => setFailed(true)} />;
}
