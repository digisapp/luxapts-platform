"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export function UnitGallery({ images, unitLabel }: UnitGalleryProps) {
  const [current, setCurrent] = useState(0);

  if (images.length === 0) {
    return (
      <div className="relative h-64 md:h-96 rounded-xl bg-muted flex items-center justify-center">
        <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
      </div>
    );
  }

  const prev = () => setCurrent((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setCurrent((i) => (i === images.length - 1 ? 0 : i + 1));

  const safeIndex = Math.min(current, images.length - 1);

  return (
    <div className="space-y-2">
      {/* Main image */}
      <div className="relative h-64 md:h-[420px] rounded-xl overflow-hidden bg-muted group">
        <Image
          src={images[safeIndex].url}
          alt={images[safeIndex].alt_text || unitLabel}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 66vw"
          priority={safeIndex === 0}
        />
        {images[safeIndex].category && (
          <Badge className="absolute top-3 left-3 bg-black/50 text-white border-0 capitalize">
            {images[safeIndex].category}
          </Badge>
        )}
        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
              {safeIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button
              key={img.id}
              onClick={() => setCurrent(i)}
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
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
