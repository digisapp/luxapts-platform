import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const revalidate = 86400;

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same city hero images as the city page
const CITY_HERO_IMAGES: Record<string, string> = {
  miami: "https://images.unsplash.com/photo-1533106497176-45ae19e68ba2?w=1400&q=85",
  "new-york": "https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=1400&q=85",
  "los-angeles": "https://images.unsplash.com/photo-1580655653885-65763b2597d1?w=1400&q=85",
  austin: "https://images.unsplash.com/photo-1531218150217-54595bc2b934?w=1400&q=85",
  dallas: "https://images.unsplash.com/photo-1545291730-faff8ca1d4b0?w=1400&q=85",
  nashville: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=85",
  atlanta: "https://images.unsplash.com/photo-1575917649705-5b59aaa12e6b?w=1400&q=85",
  brooklyn: "https://images.unsplash.com/photo-1555109307-f7d9da25c244?w=1400&q=85",
  chicago: "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=85",
  "san-francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1400&q=85",
};

export default async function CityOgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: city } = await supabase
    .from("cities")
    .select("name, state")
    .eq("slug", slug)
    .single();

  const heroImage = CITY_HERO_IMAGES[slug];

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
      {heroImage && (
         
        <img
          src={heroImage}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)",
        }}
      />
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
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 24 }}>
          Luxury Apartments
        </div>
        <div style={{ color: "white", fontSize: 72, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          {city?.name ?? slug}
          {city?.state && <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 400, fontSize: 48 }}>, {city.state}</span>}
        </div>
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 12,
            padding: "8px 16px",
            width: "fit-content",
            color: "white",
            fontSize: 20,
            fontWeight: 600,
          }}
        >
          🏢 LuxApts
        </div>
      </div>
    </div>,
    { ...size }
  );
}
