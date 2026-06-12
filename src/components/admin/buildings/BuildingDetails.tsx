"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe,
  Phone,
  Mail,
  PawPrint,
  Car,
  Banknote,
  Calendar,
  Layers,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { UnitsSection } from "./UnitsSection";
import { ImageUploadDialog } from "./ImageUploadDialog";
import { BuildingFormDialog } from "./BuildingFormDialog";
import { BuildingFactsCard } from "./BuildingFactsCard";

interface BuildingDetailData {
  building: Record<string, unknown>;
  amenities: Array<{
    amenity_id: string;
    details: string | null;
    amenities: { id: string; name: string; category: string | null } | null;
  }>;
  images: Array<{
    id: string;
    url: string;
    alt_text: string | null;
    category: string | null;
    is_primary: boolean;
    sort_order: number;
  }>;
  units: Array<{
    id: string;
    unit_number: string | null;
    floor: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    is_available: boolean;
    available_on: string | null;
    unit_images: Array<{
      id: string;
      url: string;
      category: string | null;
      is_primary: boolean;
    }>;
  }>;
}

interface BuildingDetailsProps {
  data: BuildingDetailData;
  buildingId: string;
  cities?: Array<{ id: string; name: string; slug: string }>;
}

export function BuildingDetails({ data, buildingId, cities = [] }: BuildingDetailsProps) {
  const [building, setBuilding] = useState(data.building);
  const { amenities, units } = data;
  const [images, setImages] = useState(data.images);
  const [showUpload, setShowUpload] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const infoItems = [
    { icon: Globe, label: "Website", value: building.website_url as string | null },
    { icon: Phone, label: "Leasing Phone", value: building.leasing_phone as string | null },
    { icon: Mail, label: "Leasing Email", value: building.leasing_email as string | null },
    { icon: Calendar, label: "Year Built", value: building.year_built ? String(building.year_built) : null },
    { icon: Layers, label: "Stories", value: building.stories ? String(building.stories) : null },
    { icon: PawPrint, label: "Pet Policy", value: building.pet_policy as string | null },
    { icon: Car, label: "Parking", value: building.parking_policy as string | null },
    { icon: Banknote, label: "Deposit", value: building.deposit_policy as string | null },
  ];

  const handleDeleteImage = async (imageId: string) => {
    setDeleting(imageId);
    try {
      const res = await fetch(
        `/api/admin/buildings/${buildingId}?imageId=${imageId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch {
      // Failed
    } finally {
      setDeleting(null);
    }
  };

  const handleImageAdded = (newImage: BuildingDetailData["images"][0]) => {
    setImages((prev) => [...prev, newImage]);
    setShowUpload(false);
  };

  // Group amenities by category
  const amenitiesByCategory: Record<string, Array<{ name: string; details: string | null }>> = {};
  for (const a of amenities) {
    if (!a.amenities) continue;
    const cat = a.amenities.category || "Other";
    if (!amenitiesByCategory[cat]) amenitiesByCategory[cat] = [];
    amenitiesByCategory[cat].push({ name: a.amenities.name, details: a.details });
  }

  // Build initial form data from current building for edit dialog
  const editInitialData = {
    name: building.name as string || "",
    address_1: building.address_1 as string || "",
    address_2: building.address_2 as string || "",
    city_id: building.city_id as string || "",
    zip: building.zip as string || "",
    status: building.status as string || "active",
    description: building.description as string || "",
    website_url: building.website_url as string || "",
    leasing_phone: building.leasing_phone as string || "",
    leasing_email: building.leasing_email as string || "",
    year_built: building.year_built ? String(building.year_built) : "",
    stories: building.stories ? String(building.stories) : "",
    pet_policy: building.pet_policy as string || "",
    parking_policy: building.parking_policy as string || "",
    deposit_policy: building.deposit_policy as string || "",
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Info + Amenities */}
        <div className="space-y-4">
          {/* Building Info */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Building Info</h4>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setShowEdit(true)}
                >
                  <Pencil className="mr-1.5 h-3 w-3" />
                  Edit
                </Button>
              </div>
              {typeof building.description === "string" && building.description && (
                <p className="text-sm text-muted-foreground">
                  {building.description}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {infoItems.map(
                  (item) =>
                    item.value && (
                      <div key={item.label} className="flex items-start gap-2 text-sm">
                        <item.icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div>
                          <span className="text-muted-foreground">{item.label}: </span>
                          {item.label === "Website" ? (
                            <a
                              href={item.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline break-all"
                            >
                              {item.value}
                            </a>
                          ) : (
                            <span>{item.value}</span>
                          )}
                        </div>
                      </div>
                    )
                )}
              </div>
            </CardContent>
          </Card>

          {/* Amenities */}
          {Object.keys(amenitiesByCategory).length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Amenities</h4>
                {Object.entries(amenitiesByCategory).map(([category, items]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((item) => (
                        <Badge key={item.name} variant="outline" className="text-xs">
                          {item.name}
                          {item.details && (
                            <span className="text-muted-foreground ml-1">
                              ({item.details})
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Building Facts */}
          <BuildingFactsCard buildingId={buildingId} />
        </div>

        {/* Right: Images */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">
                  Images ({images.length})
                </h4>
                <Button size="sm" variant="outline" onClick={() => setShowUpload(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Image
                </Button>
              </div>
              {images.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No images yet. Add photos to improve this listing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {images.map((img) => (
                    <div key={img.id} className="group relative rounded-lg overflow-hidden border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- remote domains not allowlisted for next/image */}
                      <img
                        src={img.url}
                        alt={img.alt_text || "Building photo"}
                        className="aspect-square object-cover w-full"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-[10px] bg-black/40 text-white border-0">
                            {img.category || "other"}
                          </Badge>
                          {img.is_primary && (
                            <Badge className="text-[10px]">Primary</Badge>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteImage(img.id)}
                        disabled={deleting === img.id}
                        className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Units Section */}
      <UnitsSection units={units} buildingId={buildingId} />

      {/* Image Upload Dialog */}
      <ImageUploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        buildingId={buildingId}
        onImageAdded={handleImageAdded}
      />

      {/* Edit Building Dialog */}
      <BuildingFormDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        cities={cities}
        buildingId={buildingId}
        initialData={editInitialData}
        onSaved={(updated) => setBuilding(updated)}
      />
    </div>
  );
}
