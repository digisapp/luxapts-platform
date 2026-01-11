"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFavorites, FavoriteItem } from "@/hooks/useFavorites";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  item: Omit<FavoriteItem, "addedAt">;
  variant?: "icon" | "button";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function FavoriteButton({
  item,
  variant = "icon",
  size = "md",
  className,
}: FavoriteButtonProps) {
  const { toggleItem, isFavorite, isLoaded } = useFavorites();

  const isFav = isFavorite(item.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleItem(item);
  };

  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-11 w-11",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (!isLoaded) {
    return null;
  }

  if (variant === "button") {
    return (
      <Button
        variant={isFav ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        className={cn("gap-2", className)}
      >
        <Heart
          className={cn(
            iconSizes[size],
            isFav && "fill-current"
          )}
        />
        {isFav ? "Saved" : "Save"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      className={cn(
        sizeClasses[size],
        "rounded-full bg-background/80 backdrop-blur-sm hover:bg-background",
        isFav && "text-red-500 hover:text-red-600",
        className
      )}
    >
      <Heart
        className={cn(
          iconSizes[size],
          isFav && "fill-current"
        )}
      />
    </Button>
  );
}
