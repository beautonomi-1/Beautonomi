/**
 * Mirrors apps/web/src/lib/http/fetcher.ts scope injection for admin customization URLs.
 * Keep lists in sync — prefer editing here and auditing fetcher against this module.
 */

export const ADMIN_SCOPE_STORAGE_KEY = "admin_scope_mode";
export const ADMIN_SCOPE_TENANT_STORAGE_KEY = "admin_scope_tenant_id";

/** URL path prefixes (pathname starts with) that receive scope + tenant_id query params. */
export const SCOPED_ADMIN_PATH_PREFIXES: readonly string[] = [
  "/api/admin/settings",
  "/api/admin/integrations/paystack",
  "/api/admin/integrations/yoco",
  "/api/admin/integrations/paycloud",
  "/api/admin/paycloud-operations",
  "/api/admin/content",
  "/api/admin/email-templates",
  "/api/admin/sms-templates",
  "/api/admin/notification-templates",
  "/api/admin/mapbox/config",
  "/api/admin/maintenance",
  "/api/admin/control-plane/integrations/gemini",
  "/api/admin/control-plane/integrations/aura",
  "/api/admin/control-plane/integrations/sumsub",
  "/api/admin/subscription-plans",
  /** E-commerce catalog (products / variants) — mutating requests must carry tenant scope for superadmin picker. */
  "/api/admin/ecommerce",
];

/** True for `prefix` or `prefix/...`, but not `prefix-suffix` (e.g. maintenance vs maintenance-notify). */
export function matchesScopedPathPrefix(pathname: string, prefix: string): boolean {
  if (pathname === prefix) return true;
  return pathname.startsWith(`${prefix}/`);
}

export function isScopedAdminCustomizationPath(pathname: string): boolean {
  return SCOPED_ADMIN_PATH_PREFIXES.some((p) => matchesScopedPathPrefix(pathname, p));
}

/**
 * Most GET /api/admin/* calls receive `scope` + `tenant_id` so the Next.js API can resolve the
 * effective tenant for superadmin (see `resolveAdminApiTenantId` in apps/web).
 * Exclude bootstrap and tenant list (picker data must not be tenant-filtered).
 */
const ADMIN_SCOPE_GET_EXCLUDED_PREFIXES: readonly string[] = [
  "/api/admin/bootstrap",
  "/api/admin/tenants",
  /** Global native app version rules — not tenant-scoped; server ignores scope/tenant_id. */
  "/api/admin/app-version",
];

export function adminScopeGetAppliesToPathname(pathname: string): boolean {
  if (!pathname.startsWith("/api/admin")) return false;
  return !ADMIN_SCOPE_GET_EXCLUDED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Pathname only (strips query), for matching scoped prefixes. */
export function adminScopePathname(path: string): string {
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "http://localhost";
    return new URL(path, base).pathname;
  } catch {
    const q = path.indexOf("?");
    return q === -1 ? path : path.slice(0, q);
  }
}

/**
 * For mutating JSON requests to customization routes, mirror `fetcher.ts`: merge `scope` and
 * optional `tenant_id` from the same localStorage keys the legacy admin and AdminChrome use.
 */
export function mergeAdminScopeIntoJsonBody(
  path: string,
  method: string,
  body: unknown,
  storage?: Pick<Storage, "getItem">
): unknown {
  const pathname = adminScopePathname(path);
  if (!isScopedAdminCustomizationPath(pathname)) return body;
  if (method.toUpperCase() === "GET") return body;
  if (body === null || body === undefined) return body;
  if (typeof body !== "object" || Array.isArray(body)) return body;

  const { scope, tenantId } = readAdminScopeFromStorage(storage);
  if (scope !== "global" && scope !== "tenant") return body;

  return {
    ...(body as Record<string, unknown>),
    scope,
    ...(scope === "tenant" && tenantId ? { tenant_id: tenantId } : {}),
  };
}

export function readAdminScopeFromStorage(
  storage: Pick<Storage, "getItem"> = typeof localStorage !== "undefined" ? localStorage : ({} as Storage)
): { scope: string; tenantId: string } {
  const scope = storage.getItem?.(ADMIN_SCOPE_STORAGE_KEY) ?? "tenant";
  const tenantId = storage.getItem?.(ADMIN_SCOPE_TENANT_STORAGE_KEY) ?? "";
  return { scope, tenantId };
}

/**
 * Append `scope` + `tenant_id` query params for admin routes that participate in tenant resolution
 * (`resolveAdminApiTenantId` reads the **URL**, not JSON bodies). Applies to **all** HTTP methods
 * so PATCH/POST/PUT match GET behaviour for superadmin tenant picker.
 *
 * Scoped JSON bodies (`mergeAdminScopeIntoJsonBody`) remain for legacy routes that expect
 * tenant in the payload; URL params are the source of truth for tenant resolution.
 */
export function withAdminScopeUrl(
  url: string,
  _method: string,
  storage?: Pick<Storage, "getItem">
): string {
  if (typeof window === "undefined") return url;
  try {
    const u = new URL(url, window.location.origin);
    if (!isScopedAdminCustomizationPath(u.pathname) && !adminScopeGetAppliesToPathname(u.pathname)) {
      return url;
    }

    const { scope, tenantId } = readAdminScopeFromStorage(storage);
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
