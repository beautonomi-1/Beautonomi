import "server-only";

import { headers } from "next/headers";

/**
 * Returns true when the current request is served from a configured admin host
 * (ADMIN_HOSTS or ADMIN_HOST env var), so server components like robots.ts and
 * sitemap.ts can opt-out of exposing marketplace content on the admin origin.
 *
 * Mirrors the normalisation used in the middleware (proxy.ts) — comma-split,
 * strip port, lowercase.
 */
export async function isAdminHostRequest(): Promise<boolean> {
  const raw = process.env.ADMIN_HOSTS || process.env.ADMIN_HOST || "";
  const hosts = new Set(
    raw
      .split(",")
      .map((h) => h.trim().split(":")[0].toLowerCase())
      .filter(Boolean),
  );
  if (hosts.size === 0) return false;
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "")
    .trim()
    .split(":")[0]
    .toLowerCase();
  return host !== "" && hosts.has(host);
}
