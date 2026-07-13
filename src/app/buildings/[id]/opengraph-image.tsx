import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";
import { getBuildingFallbackImage } from "@/lib/images/fallback";

export const runtime = "nodejs";
export const revalidate = 86400; // 24h

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BuildingOgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: building } = await supabase
    .from("buildings")
    .select(`
      id, name, address_1, zip, description,
      cities:city_id (name, state),
      neighborhoods:neighborhood_id (name),
      building_images!left (url, is_primary, sort_order)
    `)
    .eq("id", id)
    .single();

  if (!building) {
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        }}
      >
        <span style={{ color: "white", fontSize: 48, fontWeight: 700 }}>Staycio</span>
      </div>,
      { ...size }
    );
  }

  const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;
  const neighborhood = Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods;

  // Pick best image
  const images = (building.building_images || []) as Array<{
    url: string;
    is_primary: boolean;
    sort_order: number;
  }>;
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return a.sort_order - b.sort_order;
  });
  const photoUrl = sorted[0]?.url || getBuildingFallbackImage(building.id, building.name).url;

  const location = [
    neighborhood?.name,
    city ? `${city.name}${city.state ? `, ${city.state}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        fontFamily: "sans-serif",
      }}
    >
      {/* Background photo */}
      { }
      <img
        src={photoUrl}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Gradient overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%)",
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "48px 56px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {location && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "rgba(255,255,255,0.75)",
              fontSize: 22,
            }}
          >
            📍 {location}
          </div>
        )}
        <div
          style={{
            color: "white",
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
          }}
        >
          {building.name}
        </div>
        {building.address_1 && (
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 24 }}>
            {building.address_1}{building.zip ? ` ${building.zip}` : ""}
          </div>
        )}

        {/* Staycio badge */}
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 12,
            padding: "8px 16px",
            width: "fit-content",
            color: "white",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          🏢 Staycio
        </div>
      </div>
    </div>,
    { ...size }
  );
}
