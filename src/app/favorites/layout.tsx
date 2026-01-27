import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Saved Listings - LuxApts",
  description: "View your saved apartment listings and searches on LuxApts.",
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
