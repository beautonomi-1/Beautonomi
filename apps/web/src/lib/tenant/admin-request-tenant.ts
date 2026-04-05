import { resolveTenantFromRequest, resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * Resolved tenant for admin /api routes (Host → tenant_domains, else legacy za).
 * Use for scoping lists once data is partitioned; today returns same as public resolution.
 */
export async function resolveAdminApiTenantId(request: Request): Promise<string> {
  return resolveTenantIdWithZaFallback(request);
}

export { resolveTenantFromRequest };
