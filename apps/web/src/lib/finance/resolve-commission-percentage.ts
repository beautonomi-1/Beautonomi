import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Effective platform commission percentage for a provider booking payment.
 * Uses tenant-scoped platform_settings, then providers.commission_override when set.
 */
export async function resolveCommissionPercentageForProvider(
  supabase: SupabaseClient,
  opts: { tenantId: string | null | undefined; providerId: string | null | undefined },
): Promise<number> {
  let resolvedTenantId = opts.tenantId ?? null;
  if (!resolvedTenantId && opts.providerId) {
    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", opts.providerId)
      .maybeSingle();
    resolvedTenantId = (prow as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  }
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
  // Default to commission OFF unless explicitly enabled in settings.
  // This prevents accidental provider commission charging when the flag is missing.
  const commissionEnabled = payoutSettings.commission_enabled === true;
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
