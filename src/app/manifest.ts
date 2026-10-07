import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tradr Studio",
    short_name: "Tradr Studio",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    icons: [
      { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
