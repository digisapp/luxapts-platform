import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log In - LuxApts",
  description: "Log in to your LuxApts account to save listings and manage your apartment search.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
