import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

/**
 * Statutory payroll (PAYE/UIF) runs only when the provider row is on.
 * A missing `payroll.v2` feature-flag row does not block (column is the switch).
 * A present row must be enabled — superadmin can turn statutory off platform-wide.
 */
export function payrollV2StatutoryActive(input: {
  providerEnabled: boolean | null | undefined;
  /** null when no feature_flags row exists for payroll.v2 */
  flagEnabled: boolean | null;
}): boolean {
  if (input.providerEnabled !== true) return false;
  if (input.flagEnabled == null) return true;
  return input.flagEnabled;
}

export async function resolvePayrollV2Enabled(
  admin: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  const [{ data: settings }, flagEnabled] = await Promise.all([
    admin
      .from("provider_settings")
      .select("payroll_v2_enabled")
      .eq("provider_id", providerId)
      .maybeSingle(),
    loadPayrollV2FlagEnabled(admin, providerId),
  ]);
  return payrollV2StatutoryActive({
    providerEnabled: (settings as { payroll_v2_enabled?: boolean } | null)?.payroll_v2_enabled,
    flagEnabled,
  });
}

async function loadPayrollV2FlagEnabled(
  admin: SupabaseClient,
  providerId: string,
): Promise<boolean | null> {
  const { data: provider } = await admin
    .from("providers")
    .select("tenant_id")
    .eq("id", providerId)
    .maybeSingle();
  const tenantId = (provider as { tenant_id?: string | null } | null)?.tenant_id ?? null;

  let query = admin
    .from("feature_flags")
    .select("enabled, tenant_id")
    .eq("feature_key", FEATURE_FLAG_KEYS.PAYROLL_V2);
  query = tenantId
    ? query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
    : query.is("tenant_id", null);

  const { data, error } = await query;
  if (error || !data?.length) return null;

  const rows = data as Array<{ enabled?: boolean | null; tenant_id?: string | null }>;
  const tenantRow = tenantId ? rows.find((row) => row.tenant_id === tenantId) : undefined;
  const row = tenantRow ?? rows.find((item) => item.tenant_id == null);
  return row ? row.enabled === true : null;
}
