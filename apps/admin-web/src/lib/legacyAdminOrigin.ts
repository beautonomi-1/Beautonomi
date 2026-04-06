import { publicEnv } from "@/config/publicEnv";

/**
 * Next.js admin base for routes not yet migrated (e.g. report drill-downs).
 * In dev: set VITE_WEB_ORIGIN=http://localhost:3000
 * In prod pre-cutover: leave empty so links stay same-origin on the host that serves both.
 */
export function legacyAdminHref(path: string): string {
  const base = (publicEnv.webOrigin || "").replace(/\/$/, "");
  if (!base) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
