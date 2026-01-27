import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Buildings - LuxApts",
  description: "Compare luxury apartment buildings side-by-side on LuxApts.",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
