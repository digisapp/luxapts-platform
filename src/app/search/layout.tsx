import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search Apartments - LuxApts",
  description: "Search luxury apartments with AI-powered natural language search. Filter by city, price, bedrooms, amenities, and more.",
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
