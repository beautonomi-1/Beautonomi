import type { MetadataRoute } from "next";

/**
 * Next.js App Router metadata route — served at `/manifest.webmanifest`.
 *
 * §Provider-launch (2026-05): the previous build referenced
 * `manifest: "/manifest.webmanifest"` in `RootLayout` metadata but never
 * shipped an actual manifest file. On production that meant a 404; on Vercel
 * preview deployments (which sit behind Deployment Protection) it surfaced
 * as a *401 Unauthorized* in the browser console because every unknown route
 * returns the Vercel SSO challenge. Providing the file here makes the request
 * resolve to a 200 in both environments. The `crossOrigin="use-credentials"`
 * attribute on the `<link rel="manifest">` element (see `layout.tsx`) makes
 * the browser send the Vercel auth cookie on preview URLs so it never falls
 * back to the SSO challenge.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Beautonomi",
    short_name: "Beautonomi",
    description:
      "Book trusted beauty services near you. Compare verified salons, spas, barbers, nail techs, makeup artists, and mobile beauty professionals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#111827",
    lang: "en",
    categories: ["beauty", "lifestyle", "shopping"],
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
    ],
  };
}
