import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminAccessibleUserRow = Record<string, unknown> & { id: string };

/**
 * Whether an admin operating in `tenantId` may view or mutate this user.
 * Implemented in DB (`get_user_if_admin_tenant_accessible`) — same rules as admin user list RPC.
 */
export async function getUserRowIfAccessibleToAdminTenant(
  admin: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<AdminAccessibleUserRow | null> {
  const { data: rows, error } = await admin.rpc("get_user_if_admin_tenant_accessible", {
    p_user_id: userId,
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("[admin-user-tenant-access] get_user_if_admin_tenant_accessible", error);
    return null;
  }

  const arr = Array.isArray(rows) ? rows : rows != null ? [rows] : [];
  const row = arr[0];
  return row ? (row as AdminAccessibleUserRow) : null;
}
