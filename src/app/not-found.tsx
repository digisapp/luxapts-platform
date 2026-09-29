import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Search, Home } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found - Staycio",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <Header />
      <main className="flex-1 pt-20 flex items-center justify-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-24 text-center">
          <p className="text-sm uppercase tracking-wider text-white/50 mb-4">404</p>
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">
            This page has moved out
          </h1>
          <p className="text-white/60 mb-8 max-w-md mx-auto">
            The page you&apos;re looking for doesn&apos;t live here anymore. Let&apos;s
            find you a new place.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button className="gap-2" asChild>
              <Link href="/search">
                <Search className="h-4 w-4" />
                Browse apartments
              </Link>
            </Button>
            <Button variant="outline" className="gap-2" asChild>
              <Link href="/">
                <Home className="h-4 w-4" />
                Go home
              </Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
