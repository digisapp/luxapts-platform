"use client";

import { useCompare, CompareBuilding } from "@/hooks/useCompare";
import { Button } from "@/components/ui/button";
import { GitCompare, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompareButtonProps {
  building: CompareBuilding;
  variant?: "icon" | "full";
  className?: string;
}

export function CompareButton({
  building,
  variant = "icon",
  className,
}: CompareButtonProps) {
  const { toggleBuilding, isInCompare, isFull } = useCompare();
  const isSelected = isInCompare(building.id);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleBuilding(building);
  };

  if (variant === "full") {
    return (
      <Button
        variant={isSelected ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        className={cn("gap-2", className)}
      >
        {isSelected ? (
          <>
            <Check className="h-4 w-4" />
            Added to Compare
          </>
        ) : (
          <>
            <GitCompare className="h-4 w-4" />
            {isFull ? "Replace in Compare" : "Add to Compare"}
          </>
        )}
      </Button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        "p-2 rounded-full transition-all",
        isSelected
          ? "bg-white text-black"
          : "bg-black/50 text-white hover:bg-black/70",
        className
      )}
      title={isSelected ? "Remove from compare" : "Add to compare"}
    >
      {isSelected ? (
        <Check className="h-4 w-4" />
      ) : (
        <GitCompare className="h-4 w-4" />
      )}
    </button>
  );
}
