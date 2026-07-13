import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up - Staycio",
  description: "Create a Staycio account to save your favorite listings, compare buildings, and get personalized recommendations.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
