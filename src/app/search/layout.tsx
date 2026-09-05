import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Apartments - Staycio",
  description: "Search luxury apartments with AI-powered natural language search. Filter by city, price, bedrooms, amenities, and more.",
  alternates: { canonical: "/search" },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The map is client-only and loads late; warming the Mapbox origins
          during SSR shaves the DNS/TLS handshake off its first tile request. */}
      <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
      {children}
    </>
  );
}
