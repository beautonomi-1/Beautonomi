import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Effective platform commission percentage for a provider booking payment.
 * Uses tenant-scoped platform_settings, then providers.commission_override when set.
 */
export async function resolveCommissionPercentageForProvider(
  supabase: SupabaseClient,
  opts: { tenantId: string | null | undefined; providerId: string | null | undefined },
): Promise<number> {
  const resolvedTenantId = opts.tenantId ?? null;
  let settingsQuery = supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true);
  if (resolvedTenantId) {
    settingsQuery = settingsQuery.eq("tenant_id", resolvedTenantId);
  }
  const { data: settingsRow } = await settingsQuery
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payoutSettings = (settingsRow as { settings?: { payouts?: { commission_enabled?: boolean; platform_commission_percentage?: number } } } | null)?.settings?.payouts ?? {};
  const commissionEnabled = payoutSettings.commission_enabled !== false;
  const platformDefaultRate = payoutSettings.platform_commission_percentage ?? 0;

  if (!commissionEnabled) return 0;
  if (!opts.providerId) return platformDefaultRate;

  const { data: providerRow } = await supabase
    .from("providers")
    .select("commission_override")
    .eq("id", opts.providerId)
    .maybeSingle();
  const override = (providerRow as { commission_override?: number | null } | null)?.commission_override;
  return override != null ? override : platformDefaultRate;
}
