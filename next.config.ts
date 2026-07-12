import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Playwright is a devDependency used by the scraper's local render fallback;
  // keep it out of the bundle so its dynamic import resolves at runtime only
  // where it's installed (prod uses the Browserless HTTP path instead).
  serverExternalPackages: ["playwright"],
  images: {
    // The scraper stores image URLs from arbitrary building websites; a URL
    // outside this list makes next/image THROW AT RENDER, taking the whole
    // page down (search crashed to its error boundary on a scraped domain).
    // Until scraped images are rehosted into Supabase Storage, allow any
    // https host. TODO: rehost scraped images, then tighten this again.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      // CORS for public READ-ONLY catalog APIs only.
      // chat (AI spend), leads (sends emails), and favorites (cookie-authed,
      // so "*" never worked anyway) are intentionally NOT cross-origin —
      // any third-party page could otherwise drive costs from its visitors.
      {
        source:
          "/api/(search|buildings|compare|similar-listings|cities|browse|neighborhoods)(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Max-Age",
            value: "86400",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            // Simli avatar rooms (Daily-hosted iframes) need mic/camera —
            // microphone=(self) alone would deny the cross-origin iframe.
            value:
              'camera=(self "https://*.daily.co" "https://*.simli.ai" "https://*.simli.com"), microphone=(self "https://*.daily.co" "https://*.simli.ai" "https://*.simli.com"), geolocation=()',
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.x.ai https://api.mapbox.com https://*.mapbox.com https://events.mapbox.com",
              "media-src 'self' blob: https://*.supabase.co",
              // Simli avatar conversation rooms are served from Daily/Simli
              "frame-src 'self' https://*.daily.co https://*.simli.ai https://*.simli.com",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
