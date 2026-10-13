import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Staycio — Your space, found.",
    short_name: "Staycio",
    description:
      "AI-powered apartment discovery across major US cities. Your space, found.",
    start_url: "/",
    display: "standalone",
    // Splash and title bar match the light page (warm white, white nav)
    background_color: "#fafaf9",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
