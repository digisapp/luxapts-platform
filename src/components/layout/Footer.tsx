import Link from "next/link";
import { Building2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              <span className="text-xl font-bold">LuxApts</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              The intelligent rental search platform. Find your perfect apartment with AI-powered discovery.
            </p>
          </div>

          {/* Cities */}
          <div className="space-y-4">
            <h3 className="font-semibold">Popular Cities</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/nyc" className="hover:text-foreground transition-colors">
                  New York City
                </Link>
              </li>
              <li>
                <Link href="/miami" className="hover:text-foreground transition-colors">
                  Miami
                </Link>
              </li>
              <li>
                <Link href="/la" className="hover:text-foreground transition-colors">
                  Los Angeles
                </Link>
              </li>
              <li>
                <Link href="/austin" className="hover:text-foreground transition-colors">
                  Austin
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="space-y-4">
            <h3 className="font-semibold">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/agents" className="hover:text-foreground transition-colors">
                  For Agents
                </Link>
              </li>
              <li>
                <Link href="/partners" className="hover:text-foreground transition-colors">
                  For Partners
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h3 className="font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t pt-8 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} LuxApts. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
