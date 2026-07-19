import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { FEATURE_FLAG_KEYS } from "@/lib/server/feature-flag-keys";

export const REFERRAL_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export type ReferralProgramGate = {
  enabled: boolean;
  flagEnabled: boolean;
  settingsEnabled: boolean;
};

/**
 * Referral program is active only when BOTH the `referral_program` feature flag
 * (defaults true when no row exists — migration 092) AND referral_settings.is_enabled
 * are on.
 */
export async function resolveReferralProgramEnabled(
  tenantId?: string | null,
): Promise<ReferralProgramGate> {
  let flagEnabled = true;
  let settingsEnabled = true;

  try {
    const supabase = getSupabaseAdmin();
    let flagQuery = supabase
      .from("feature_flags")
      .select("enabled, tenant_id")
      .eq("feature_key", FEATURE_FLAG_KEYS.REFERRAL_PROGRAM);

    if (tenantId) {
      flagQuery = flagQuery.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      flagQuery = flagQuery.is("tenant_id", null);
    }

    const { data: flagRows } = await flagQuery;
    if (flagRows?.length) {
      const tenantRow = tenantId
        ? flagRows.find((r) => (r as { tenant_id?: string | null }).tenant_id === tenantId)
        : null;
      const globalRow = flagRows.find(
        (r) => !(r as { tenant_id?: string | null }).tenant_id,
      );
      const effective = tenantRow ?? globalRow;
      flagEnabled = (effective as { enabled?: boolean } | undefined)?.enabled !== false;
    }

    const { data: settings } = await supabase
      .from("referral_settings")
      .select("is_enabled")
      .eq("id", REFERRAL_SETTINGS_ID)
      .maybeSingle();

    if (settings) {
      settingsEnabled = (settings as { is_enabled?: boolean }).is_enabled !== false;
    }
  } catch (err) {
    console.warn("[resolveReferralProgramEnabled] error, using permissive defaults:", err);
  }

  return {
    enabled: flagEnabled && settingsEnabled,
    flagEnabled,
    settingsEnabled,
  };
}
