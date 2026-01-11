"use client";

import { useState } from "react";
import { Bookmark, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSavedSearches, SavedSearch } from "@/hooks/useSavedSearches";

interface SaveSearchButtonProps {
  filters: SavedSearch["filters"];
  resultCount?: number;
  className?: string;
}

export function SaveSearchButton({
  filters,
  resultCount,
  className,
}: SaveSearchButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const { saveSearch } = useSavedSearches();

  const generateDefaultName = () => {
    const parts: string[] = [];
    if (filters.city) parts.push(filters.city);
    if (filters.bedsMin !== undefined) {
      if (filters.bedsMin === 0) parts.push("Studio");
      else parts.push(`${filters.bedsMin}+ bed`);
    }
    if (filters.budgetMax) parts.push(`under $${filters.budgetMax.toLocaleString()}`);
    return parts.join(" ") || "My Search";
  };

  const handleOpen = () => {
    setName(generateDefaultName());
    setSaved(false);
    setOpen(true);
  };

  const handleSave = () => {
    if (name.trim()) {
      saveSearch(name.trim(), filters, resultCount);
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
      }, 1000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className} onClick={handleOpen}>
          <Bookmark className="mr-2 h-4 w-4" />
          Save Search
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {saved ? (
              <span className="flex items-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                Search Saved!
              </span>
            ) : (
              "Save This Search"
            )}
          </DialogTitle>
          <DialogDescription>
            {saved
              ? "You can access your saved searches anytime from the menu."
              : "Give your search a name to easily find it later."}
          </DialogDescription>
        </DialogHeader>
        {!saved && (
          <>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Search name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Miami 2BR under $3k"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                <p className="font-medium mb-1">Search criteria:</p>
                <ul className="space-y-0.5">
                  {filters.city && <li>City: {filters.city}</li>}
                  {filters.neighborhood && <li>Neighborhood: {filters.neighborhood}</li>}
                  {filters.bedsMin !== undefined && (
                    <li>Beds: {filters.bedsMin === 0 ? "Studio" : `${filters.bedsMin}+`}</li>
                  )}
                  {filters.budgetMax && (
                    <li>Max budget: ${filters.budgetMax.toLocaleString()}</li>
                  )}
                  {filters.petFriendly && <li>Pet friendly</li>}
                </ul>
                {resultCount !== undefined && (
                  <p className="mt-2 text-primary">{resultCount} results found</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!name.trim()}>
                Save Search
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
