"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const CATEGORIES = [
  { value: "exterior", label: "Exterior" },
  { value: "lobby", label: "Lobby" },
  { value: "amenity", label: "Amenity" },
  { value: "pool", label: "Pool" },
  { value: "gym", label: "Gym" },
  { value: "rooftop", label: "Rooftop" },
  { value: "common", label: "Common Area" },
  { value: "other", label: "Other" },
];

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildingId: string;
  onImageAdded: (image: {
    id: string;
    url: string;
    alt_text: string | null;
    category: string | null;
    is_primary: boolean;
    sort_order: number;
  }) => void;
}

export function ImageUploadDialog({
  open,
  onOpenChange,
  buildingId,
  onImageAdded,
}: ImageUploadDialogProps) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("exterior");
  const [altText, setAltText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!url.trim()) {
      setError("Image URL is required");
      return;
    }

    try {
      new URL(url);
    } catch {
      setError("Please enter a valid URL");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/buildings/${buildingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          category,
          alt_text: altText.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add image");
        return;
      }

      const data = await res.json();
      onImageAdded(data.image);
      setUrl("");
      setCategory("exterior");
      setAltText("");
    } catch {
      setError("Failed to add image");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Building Image</DialogTitle>
          <DialogDescription>
            Add an image by providing its URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image-url">Image URL</Label>
            <Input
              id="image-url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alt-text">Alt Text (optional)</Label>
            <Input
              id="alt-text"
              placeholder="Describe the image..."
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
            />
          </div>

          {/* Preview */}
          {url && (
            <div className="rounded-lg border overflow-hidden">
              <img
                src={url}
                alt={altText || "Preview"}
                className="w-full h-48 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Adding..." : "Add Image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
