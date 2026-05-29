import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserRowIfAccessibleToAdminTenant } from "@/lib/tenant/admin-user-tenant-access";

type VerificationTenantRow = {
  id?: string;
  tenant_id?: string | null;
  user_id?: string | null;
};

/** Whether an admin operating in tenantId may view/review this verification row. */
export async function verificationAccessibleToAdminTenant(
  admin: SupabaseClient,
  tenantId: string,
  row: VerificationTenantRow | null | undefined,
): Promise<boolean> {
  if (!row?.id) return false;
  if (row.tenant_id === tenantId) return true;
  if (row.tenant_id != null) return false;
  const userId = row.user_id;
  if (!userId) return false;
  const userRow = await getUserRowIfAccessibleToAdminTenant(admin, tenantId, userId);
  return Boolean(userRow);
}

/** Filter verification rows to the resolved admin tenant (includes null tenant_id when user is in scope). */
export async function filterVerificationsForAdminTenant<T extends VerificationTenantRow>(
  admin: SupabaseClient,
  tenantId: string,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return [];

  const direct = rows.filter((r) => r.tenant_id === tenantId);
  const nullTenant = rows.filter((r) => r.tenant_id == null && r.user_id);

  if (nullTenant.length === 0) return direct;

  const scopedNull: T[] = [];
  await Promise.all(
    nullTenant.map(async (row) => {
      if (await verificationAccessibleToAdminTenant(admin, tenantId, row)) {
        scopedNull.push(row);
      }
    }),
  );

  return [...direct, ...scopedNull].sort((a, b) => {
    const aMs = Date.parse(String((a as { submitted_at?: string }).submitted_at ?? ""));
    const bMs = Date.parse(String((b as { submitted_at?: string }).submitted_at ?? ""));
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });
}
