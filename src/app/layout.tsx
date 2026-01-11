import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CompareBar } from "@/components/compare/CompareBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LuxApts - Find Your Perfect Apartment",
  description: "The intelligent rental search platform. AI-powered apartment discovery across major US cities.",
  keywords: ["apartments", "rentals", "NYC", "Miami", "luxury apartments", "apartment search"],
  openGraph: {
    title: "LuxApts - Find Your Perfect Apartment",
    description: "The intelligent rental search platform. AI-powered apartment discovery across major US cities.",
    url: "https://luxapts.co",
    siteName: "LuxApts",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LuxApts - Find Your Perfect Apartment",
    description: "The intelligent rental search platform. AI-powered apartment discovery.",
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
        <AuthProvider>
          {children}
          <MobileBottomNav />
          <CompareBar />
          <ChatWidget />
        </AuthProvider>
      </body>
    </html>
  );
}
