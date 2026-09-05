import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/partner/",
          "/api/",
          "/auth/",
          "/favorites",
          "/compare",
          "/account",
          "/shower/",
          "/agent/",
        ],
      },
    ],
    sitemap: "https://staycio.com/sitemap.xml",
  };
}
