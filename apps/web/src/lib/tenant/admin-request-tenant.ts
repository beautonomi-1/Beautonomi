import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";

/**
 * Resolved tenant for admin /api routes (Host → tenant_domains, else legacy za).
 *
 * **Superadmin tenant picker (admin SPA):** when the request URL includes `scope=tenant` and
 * `tenant_id=<uuid>`, the effective tenant is that id (after verifying the caller is superadmin).
 * Non-superadmins ignore `tenant_id` and stay on the host-resolved tenant.
 */
export async function resolveAdminApiTenantId(request: Request): Promise<string> {
  const url = new URL(request.url);
  const qTenant = url.searchParams.get("tenant_id") ?? url.searchParams.get("tenantId");
  const scope = url.searchParams.get("scope");

  if (qTenant && scope !== "global") {
    try {
      const supabase = await getSupabaseServer(request);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser?.id) {
        const { data: row } = await supabase
          .from("users")
          .select("role")
          .eq("id", authUser.id)
          .maybeSingle();
        if (String(row?.role ?? "").toLowerCase() === "superadmin") {
          return qTenant;
        }
      }
    } catch {
      // fall through to host tenant
    }
  }

  return resolveTenantIdWithZaFallback(request);
}

export { resolveTenantFromRequest } from "@/lib/tenant/resolve-tenant-from-db";

