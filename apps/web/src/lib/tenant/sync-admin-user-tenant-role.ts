import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/** Ensures an admin user has an active tenant assignment for API section checks. */
const PORTAL_ROLES_NO_TENANT_SYNC = new Set([
  "customer",
  "provider_owner",
  "provider_staff",
]);

export function shouldSyncAdminUserTenantRole(role: string): boolean {
  return !PORTAL_ROLES_NO_TENANT_SYNC.has(role);
}

export async function syncAdminUserTenantRole(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  tenantId?: string,
  request?: Request,
  options?: { throwOnError?: boolean },
): Promise<void> {
  if (!shouldSyncAdminUserTenantRole(role)) return;

  const resolvedTenantId =
    tenantId ?? (request ? await resolveAdminApiTenantId(request) : null);
  if (!resolvedTenantId) return;

  const { error } = await supabase.from("user_tenant_roles").upsert(
    {
      user_id: userId,
      tenant_id: resolvedTenantId,
      role,
      is_active: true,
    },
    { onConflict: "user_id,tenant_id,role" },
  );
  if (error) {
    console.error("syncAdminUserTenantRole:", error);
    if (options?.throwOnError) {
      throw error;
    }
  }
}
