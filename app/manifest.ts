import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xyra Chat",
    short_name: "Xyra",
    description:
      "One inbox for every customer conversation — WhatsApp, Instagram, Messenger and live chat unified.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0418",
    theme_color: "#9333EA",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
