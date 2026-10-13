import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { ToastProvider } from "@/contexts/ToastContext";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CompareBar } from "@/components/compare/CompareBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { WebsiteJsonLd } from "@/components/seo/JsonLd";
import { ThemeController } from "@/components/ThemeController";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://staycio.com"),
  title: "Staycio — Your space, found.",
  description: "Stay + espacio: a space to stay while you figure out the rest. AI-powered apartment discovery across major US cities.",
  keywords: ["apartments", "rentals", "NYC", "Miami", "luxury apartments", "apartment search"],
  appleWebApp: {
    capable: true,
    // "default" (dark text on a light bar), not "black-translucent":
    // translucent draws the page under the status bar in a home-screen
    // launch, and every page's fixed pt-16/pt-20 offset then left its top
    // edge under the clock.
    statusBarStyle: "default",
    title: "Staycio",
  },
  openGraph: {
    title: "Staycio — Your space, found.",
    description: "Stay + espacio: a space to stay while you figure out the rest. AI-powered apartment discovery across major US cities.",
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
    // Light is the server default; THEME_INIT_SCRIPT adds .dark before first
    // paint on the staff portals and for anyone who chose ?theme=dark
    // (src/lib/theme.ts).
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className="antialiased min-h-screen bg-background"
      >
        <ThemeController />
        <ClientErrorReporter />
        <WebsiteJsonLd />
        <AuthProvider>
          <AnalyticsTracker />
          <ToastProvider>
            {children}
            <MobileBottomNav />
            <CompareBar />
            <ChatWidget />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
