export type PricingPlanFreeInput = {
  price?: string | number | null;
  paystack_plan_code_monthly?: string | null;
  paystack_plan_code_yearly?: string | null;
};

export type LinkedSubscriptionPlanFreeInput = {
  is_free?: boolean | null;
} | null | undefined;

/**
 * Whether a pricing_plans card represents a free tier.
 * Prefers linked subscription_plans.is_free when present.
 */
export function resolvePricingPlanIsFree(
  pricingRow: PricingPlanFreeInput,
  linkedSubscriptionPlan: LinkedSubscriptionPlanFreeInput,
): boolean {
  if (linkedSubscriptionPlan && typeof linkedSubscriptionPlan.is_free === "boolean") {
    return linkedSubscriptionPlan.is_free === true;
  }

  const hasAnyPaystackCode = Boolean(
    pricingRow.paystack_plan_code_monthly || pricingRow.paystack_plan_code_yearly,
  );
  const numericPrice = Number.parseFloat(
    String(pricingRow.price ?? "")
      .replace(/[^0-9.]/g, "")
      .trim(),
  );
  const isFreeByPrice =
    !pricingRow.price ||
    Number.isNaN(numericPrice) ||
    numericPrice === 0 ||
    /free/i.test(String(pricingRow.price ?? ""));

  if (!linkedSubscriptionPlan) {
    console.warn(
      "[resolvePricingPlanIsFree] pricing card has no linked subscription_plans row; using legacy price heuristic",
    );
  }

  return isFreeByPrice && !hasAnyPaystackCode;
}
