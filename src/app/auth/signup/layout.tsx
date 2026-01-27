import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up - LuxApts",
  description: "Create a LuxApts account to save your favorite listings, compare buildings, and get personalized recommendations.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
