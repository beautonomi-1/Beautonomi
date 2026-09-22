import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/** Ensures an admin user has an active tenant assignment for API section checks. */
export async function syncAdminUserTenantRole(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  tenantId?: string,
  request?: Request,
): Promise<void> {
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
  }
}
