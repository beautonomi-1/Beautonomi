import { NextResponse } from "next/server";

export const dynamic = "force-static";

const manifest = {
  name: "Beautonomi - Book Beauty Services",
  short_name: "Beautonomi",
  description:
    "Book verified salons, spas, barbers, nail techs, makeup artists, and mobile beauty professionals near you.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#FF0077",
  categories: ["beauty", "lifestyle", "shopping"],
  lang: "en-ZA",
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
    {
      src: "/images/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
  ],
};

export function GET() {
  return new NextResponse(JSON.stringify(manifest), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
