import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Apartments - Staycio",
  description: "Search luxury apartments with AI-powered natural language search. Filter by city, price, bedrooms, amenities, and more.",
  alternates: { canonical: "/search" },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
