import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Staycio — Your space, found.",
  description: "Find the space that fits your life. Real-time pricing, AI-powered search, and instant comparisons across Miami, New York, Los Angeles, Dallas, Austin, Nashville, Atlanta, and Brooklyn.",
  openGraph: {
    title: "Staycio — Your space, found.",
    description: "Real-time pricing, instant comparisons, zero hassle. AI-powered luxury apartment search.",
    url: "https://staycio.com",
    siteName: "Staycio",
    type: "website",
    images: [
      {
        url: "https://staycio.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Staycio — Your space, found.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Staycio — Your space, found.",
    description: "Real-time pricing, instant comparisons, zero hassle.",
    images: ["https://staycio.com/og-image.png"],
  },
  alternates: {
    canonical: "https://staycio.com",
  },
};

export default function HomePage() {
  return <HomeClient />;
}
