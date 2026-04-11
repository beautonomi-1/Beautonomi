import "server-only";

import { headers } from "next/headers";
import {
  getConfiguredGlobalEntryHost,
  normalizeHostLabel,
  openGraphLocaleTagForHost,
} from "@/lib/seo/host-config";

export { getHreflangAlternateUrls } from "@/lib/seo/host-config";

/**
 * Absolute origin for the current request (canonical / OG / JSON-LD / sitemap).
 */
export async function getPublicSiteOriginFromHeaders(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") === "http" ? "http" : "https";
  const hostRaw =
    (h.get("x-forwarded-host") || h.get("host") || "").trim().split(":")[0] ||
    "";
  const host = normalizeHostLabel(hostRaw);
  if (
    host &&
    host !== "localhost" &&
    !host.startsWith("127.") &&
    !host.endsWith(".local")
  ) {
    return `${proto}://${hostRaw}`;
  }
  const fallback = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fallback && /^https?:\/\//i.test(fallback)) {
    return fallback.replace(/\/$/, "");
  }
  return `https://${getConfiguredGlobalEntryHost()}`;
}

/** Open Graph locale for primary market host vs global entry. */
export function openGraphLocaleForHost(host: string): string {
  return openGraphLocaleTagForHost(host);
}
