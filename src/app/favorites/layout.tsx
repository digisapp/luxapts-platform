import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Listings - Staycio",
  description: "View your saved apartment listings and searches on Staycio.",
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
