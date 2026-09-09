/**
 * Resolves the monthly included marketing credit (ZAR) from plan features.
 * Marketing credit takes precedence over platform ads credit.
 */
export function resolveIncludedMonthlyCreditZar(
  features: Record<string, unknown> | null | undefined,
): number {
  const marketing = features?.marketing_campaigns as
    | { included_marketing_credit_zar_per_month?: unknown }
    | undefined;
  const ads = features?.platform_ads as
    | { enabled?: boolean; included_credit_zar_per_month?: unknown }
    | undefined;

  const marketingGrant = Number(marketing?.included_marketing_credit_zar_per_month ?? 0);
  if (marketingGrant > 0) {
    return marketingGrant;
  }

  if (ads?.enabled === false) {
    return 0;
  }

  const adsGrant = Number(ads?.included_credit_zar_per_month ?? 0);
  return adsGrant > 0 ? adsGrant : 0;
}
