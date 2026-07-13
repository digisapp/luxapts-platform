import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Buildings - Staycio",
  description: "Compare luxury apartment buildings side-by-side on Staycio.",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
