"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X, Expand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";

interface GalleryImage {
  url: string;
  alt: string;
  category?: string;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  buildingName: string;
}

// Controls stay visible on touch screens (no hover to reveal them); only
// hover-capable pointers get the reveal-on-hover treatment. The old
// `md:opacity-0` also hid them on landscape iPhones and iPads.
const overlayButton =
  "bg-black/50 hover:bg-black/70 text-white transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100";

export function ImageGallery({ images: allImages, buildingName }: ImageGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  // Scraped photo URLs go stale when a building's site deletes them. Drop the
  // ones that fail rather than showing broken-image icons.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const images = allImages.filter((img) => !failed.has(img.url));
  const markFailed = (url: string) =>
    setFailed((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);

  // Swipe navigation for touch devices
  const { onTouchStart: handleTouchStart, onTouchEnd: handleTouchEnd } = useSwipe(
    goToPrevious,
    goToNext,
    images.length > 1
  );

  // Fullscreen modal: keyboard controls, body scroll lock, focus close button
  useEffect(() => {
    if (!isFullscreen) return;

    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsFullscreen(false);
      } else if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, goToPrevious, goToNext]);

  if (images.length === 0) {
    return <div className="h-64 md:h-96 rounded-xl bg-muted" aria-hidden="true" />;
  }

  const safeIndex = Math.min(currentIndex, images.length - 1);
  const currentImage = images[safeIndex];

  return (
    <>
      {/* Main Gallery */}
      <div
        className="relative h-64 md:h-96 rounded-xl overflow-hidden bg-muted group touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          src={currentImage.url}
          alt={currentImage.alt || buildingName}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 66vw"
          priority
          onError={() => markFailed(currentImage.url)}
        />

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={cn("absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11", overlayButton)}
              onClick={goToPrevious}
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11", overlayButton)}
              onClick={goToNext}
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {/* Fullscreen Button */}
        <Button
          variant="ghost"
          size="icon"
          className={cn("absolute top-3 right-3 h-11 w-11", overlayButton)}
          onClick={() => setIsFullscreen(true)}
          aria-label="View fullscreen"
        >
          <Expand className="h-5 w-5" />
        </Button>

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-3 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
            {safeIndex + 1} / {images.length}
          </div>
        )}

        {/* Category Badge */}
        {currentImage.category && (
          <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full capitalize">
            {currentImage.category}
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              onClick={() => setCurrentIndex(index)}
              aria-label={`Show photo ${index + 1}`}
              className={cn(
                "relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all",
                index === safeIndex
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent hover:border-muted-foreground/30"
              )}
            >
              <Image
                src={image.url}
                alt={image.alt || `${buildingName} photo ${index + 1}`}
                fill
                className="object-cover"
                sizes="80px"
                onError={() => markFailed(image.url)}
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${buildingName} photo gallery`}
          className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center"
        >
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            aria-label="Close gallery"
            className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 z-10 h-11 w-11 text-white hover:bg-white/10"
            onClick={() => setIsFullscreen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          <div
            className="relative w-full h-full max-w-6xl max-h-[90dvh] mx-4 touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Image
              src={currentImage.url}
              alt={currentImage.alt || buildingName}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          {/* Fullscreen Navigation */}
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 text-white hover:bg-white/10"
                onClick={goToPrevious}
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 text-white hover:bg-white/10"
                onClick={goToNext}
                aria-label="Next photo"
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {/* Fullscreen Counter */}
          <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-2 rounded-full">
            {safeIndex + 1} / {images.length}
          </div>

          {/* Fullscreen Thumbnails */}
          <div className="absolute bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4">
            {images.map((image, index) => (
              <button
                key={image.url}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Show photo ${index + 1}`}
                className={cn(
                  "relative flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all",
                  index === safeIndex
                    ? "border-white"
                    : "border-transparent opacity-50 hover:opacity-100"
                )}
              >
                <Image
                  src={image.url}
                  alt={image.alt || `${buildingName} photo ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
