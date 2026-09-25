"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSwipe } from "@/hooks/use-swipe";

interface UnitImage {
  id: string;
  url: string;
  alt_text: string | null;
  category: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface UnitGalleryProps {
  images: UnitImage[];
  unitLabel: string;
}

// Arrows stay visible on touch screens (there is no hover to reveal them);
// only mouse users get the hover-to-reveal treatment.
const arrow =
  "absolute top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100";

export function UnitGallery({ images: allImages, unitLabel }: UnitGalleryProps) {
  const [current, setCurrent] = useState(0);
  // Scraped photo URLs go stale (the building's site deletes them). Drop any
  // that fail instead of showing a broken-image icon.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const images = allImages.filter((img) => !failed.has(img.id));
  const markFailed = (id: string) =>
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const count = images.length;
  const prev = useCallback(() => setCurrent((i) => (i <= 0 ? count - 1 : i - 1)), [count]);
  const next = useCallback(() => setCurrent((i) => (i >= count - 1 ? 0 : i + 1)), [count]);
  const swipe = useSwipe(prev, next, count > 1);

  if (count === 0) {
    return (
      <div className="relative h-64 md:h-96 rounded-xl bg-muted flex items-center justify-center">
        <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
      </div>
    );
  }

  const safeIndex = Math.min(current, count - 1);
  const image = images[safeIndex];

  return (
    <div className="space-y-2">
      {/* Main image */}
      <div
        className="relative h-64 md:h-[420px] rounded-xl overflow-hidden bg-muted group touch-pan-y"
        {...swipe}
      >
        <Image
          key={image.id}
          src={image.url}
          alt={image.alt_text || unitLabel}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 66vw"
          priority={safeIndex === 0}
          onError={() => markFailed(image.id)}
        />
        {image.category && (
          <Badge className="absolute top-3 left-3 bg-black/50 text-white border-0 capitalize">
            {image.category}
          </Badge>
        )}
        {count > 1 && (
          <>
            <button onClick={prev} aria-label="Previous photo" className={`${arrow} left-3`}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} aria-label="Next photo" className={`${arrow} right-3`}>
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
              {safeIndex + 1} / {count}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {count > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setCurrent(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === safeIndex ? "true" : undefined}
              className={`relative h-16 w-24 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                i === safeIndex ? "border-primary" : "border-transparent"
              }`}
            >
              <Image
                src={img.url}
                alt={img.alt_text || `${unitLabel} photo ${i + 1}`}
                fill
                className="object-cover"
                sizes="96px"
                onError={() => markFailed(img.id)}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
