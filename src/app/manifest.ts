import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tradr Studio",
    short_name: "Tradr Studio",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f3f0",
    theme_color: "#f3f3f0",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
