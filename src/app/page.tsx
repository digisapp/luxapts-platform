import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "LuxApts - AI-Powered Luxury Apartment Search",
  description: "Find your perfect luxury apartment with real-time pricing, AI-powered search, and instant comparisons across Miami, New York, Los Angeles, Dallas, Austin, Nashville, Atlanta, and Brooklyn.",
  openGraph: {
    title: "LuxApts - Find Your Perfect Home",
    description: "Real-time pricing, instant comparisons, zero hassle. AI-powered luxury apartment search.",
    url: "https://luxapts.co",
    siteName: "LuxApts",
    type: "website",
    images: [
      {
        url: "https://luxapts.co/og-image.png",
        width: 1200,
        height: 630,
        alt: "LuxApts - AI-Powered Luxury Apartment Search",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LuxApts - AI-Powered Luxury Apartment Search",
    description: "Real-time pricing, instant comparisons, zero hassle.",
    images: ["https://luxapts.co/og-image.png"],
  },
  alternates: {
    canonical: "https://luxapts.co",
  },
};

export default function HomePage() {
  return <HomeClient />;
}
