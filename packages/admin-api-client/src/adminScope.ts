/**
 * Mirrors apps/web/src/lib/http/fetcher.ts scope injection for admin customization URLs.
 * Keep lists in sync — prefer editing here and auditing fetcher against this module.
 */

export const ADMIN_SCOPE_STORAGE_KEY = "admin_scope_mode";
export const ADMIN_SCOPE_TENANT_STORAGE_KEY = "admin_scope_tenant_id";

/** URL path prefixes (pathname starts with) that receive scope + tenant_id query params. */
export const SCOPED_ADMIN_PATH_PREFIXES: readonly string[] = [
  "/api/admin/settings",
  "/api/admin/content",
  "/api/admin/email-templates",
  "/api/admin/sms-templates",
  "/api/admin/notification-templates",
  "/api/admin/mapbox/config",
  "/api/admin/control-plane/integrations/gemini",
  "/api/admin/control-plane/integrations/aura",
  "/api/admin/control-plane/integrations/sumsub",
  "/api/admin/subscription-plans",
];

export function isScopedAdminCustomizationPath(pathname: string): boolean {
  return SCOPED_ADMIN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

export function readAdminScopeFromStorage(
  storage: Pick<Storage, "getItem"> = typeof localStorage !== "undefined" ? localStorage : ({} as Storage)
): { scope: string; tenantId: string } {
  const scope = storage.getItem?.(ADMIN_SCOPE_STORAGE_KEY) ?? "tenant";
  const tenantId = storage.getItem?.(ADMIN_SCOPE_TENANT_STORAGE_KEY) ?? "";
  return { scope, tenantId };
}

/**
 * Append scope query params for GET; for mutating requests with JSON body, matching server
 * expectations should mirror fetcher (body carries scope when required).
 */
export function withAdminScopeUrl(
  url: string,
  method: string,
  storage?: Pick<Storage, "getItem">
): string {
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url, window.location.origin);
    if (!isScopedAdminCustomizationPath(u.pathname)) return url;

    const { scope, tenantId } = readAdminScopeFromStorage(storage);
    if (method.toUpperCase() !== "GET") return url;
    if (scope !== "global" && scope !== "tenant") return url;

    u.searchParams.set("scope", scope);
    if (scope === "tenant" && tenantId) {
      u.searchParams.set("tenant_id", tenantId);
    }
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
