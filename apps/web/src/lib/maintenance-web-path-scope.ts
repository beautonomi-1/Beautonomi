import { PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES } from "@/lib/maintenance-public-site-exempt";
import { PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES } from "@/lib/provider-web-maintenance-exempt";

const SCOPES_NO_GATE = ["/admin", "/account-settings", "/portal", "/auth", "/api", "/maintenance-preview"] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => matchesPrefix(pathname, p));
}

/**
 * How MaintenanceGate should fetch config and apply maintenance for this pathname.
 *
 * - `none`: never fetch / never overlay (admin, auth, public partner funnel exemptions).
 * - `public_site`: fetch `public_site`.
 * - `provider_web` + `portal`: fetch `provider_web`; overlay when maintenance enabled.
 * - `provider_web` + `funnel`: fetch `provider_web`; overlay when maintenance enabled **unless**
 *   `allow_partner_funnel` is true (default) in config — full outage when false.
 */
export type WebMaintenanceFetchResolution =
  | { mode: "none" }
  | { mode: "public_site" }
  | { mode: "provider_web"; pathVariant: "portal" | "funnel" };

export function resolveWebMaintenanceFetch(pathname: string): WebMaintenanceFetchResolution {
  if (matchesAnyPrefix(pathname, SCOPES_NO_GATE)) return { mode: "none" };
  if (matchesAnyPrefix(pathname, PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES)) return { mode: "none" };
  if (matchesAnyPrefix(pathname, PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES)) {
    return { mode: "provider_web", pathVariant: "funnel" };
  }
  if (pathname.startsWith("/provider")) return { mode: "provider_web", pathVariant: "portal" };
  return { mode: "public_site" };
}
