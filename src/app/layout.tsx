import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { ToastProvider } from "@/contexts/ToastContext";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CompareBar } from "@/components/compare/CompareBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { SimliWidget } from "@/components/simli";
import { WebsiteJsonLd } from "@/components/seo/JsonLd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Staycio — Your space, found.",
  description: "AI-powered apartment discovery across major US cities. Find the space that fits your life.",
  keywords: ["apartments", "rentals", "NYC", "Miami", "luxury apartments", "apartment search"],
  openGraph: {
    title: "Staycio — Your space, found.",
    description: "AI-powered apartment discovery across major US cities. Find the space that fits your life.",
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
    description: "AI-powered apartment discovery across major US cities.",
    images: ["https://staycio.com/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-black`}
      >
        <WebsiteJsonLd />
        <AuthProvider>
          <AnalyticsTracker />
          <ToastProvider>
            {children}
            <MobileBottomNav />
            <CompareBar />
            <SimliWidget />
            <ChatWidget />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
