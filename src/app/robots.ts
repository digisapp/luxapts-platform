import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/partner/", "/api/", "/auth/"],
      },
    ],
    sitemap: "https://luxapts.co/sitemap.xml",
  };
}
