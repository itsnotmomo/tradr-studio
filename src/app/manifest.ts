import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tape",
    short_name: "Tape",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f3f0",
    theme_color: "#161616",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
