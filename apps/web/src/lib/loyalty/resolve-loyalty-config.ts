import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedLoyaltyConfig = {
  currency: string;
  pointsPerCurrencyUnit: number;
  redemptionRate: number;
  minRedemptionPoints: number;
  maxRedemptionPercentage: number;
  pointsExpiryDays: number | null;
};

/**
 * Platform loyalty configuration: earn rate from loyalty_rules, redemption caps
 * from loyalty_point_config with loyalty_rules fallback.
 */
export async function resolveLoyaltyConfig(
  admin: SupabaseClient,
  currency: string,
): Promise<ResolvedLoyaltyConfig> {
  const { data: earnRule } = await admin
    .from("loyalty_rules")
    .select("points_per_currency_unit, redemption_rate, currency")
    .eq("is_active", true)
    .eq("currency", currency)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  let fallbackEarnRule = earnRule;
  if (!fallbackEarnRule?.points_per_currency_unit) {
    const { data: anyRule } = await admin
      .from("loyalty_rules")
      .select("points_per_currency_unit, redemption_rate, currency")
      .eq("is_active", true)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    fallbackEarnRule = anyRule;
  }

  const { data: pointConfig } = await admin
    .from("loyalty_point_config")
    .select(
      "redemption_rate, min_redemption_points, max_redemption_percentage, points_expiry_days, currency",
    )
    .eq("is_active", true)
    .eq("currency", currency)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const earnRate = Number(fallbackEarnRule?.points_per_currency_unit ?? 1);
  const rulesRedemptionRate = Number(fallbackEarnRule?.redemption_rate ?? 100);

  const redemptionRate = Number(pointConfig?.redemption_rate ?? rulesRedemptionRate);
  const minRedemptionPoints = Number(pointConfig?.min_redemption_points ?? 0);
  const maxRedemptionPercentage = Number(pointConfig?.max_redemption_percentage ?? 50);
  const pointsExpiryDays =
    pointConfig?.points_expiry_days != null ? Number(pointConfig.points_expiry_days) : 365;

  return {
    currency,
    pointsPerCurrencyUnit: earnRate,
    redemptionRate,
    minRedemptionPoints,
    maxRedemptionPercentage,
    pointsExpiryDays,
  };
}
