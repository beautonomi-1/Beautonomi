export type OnboardingPricingPlanRow = {
  id: string;
  is_free?: boolean;
  subscription_plan_id?: string | null;
  available_billing_periods?: ("monthly" | "yearly")[];
};

/** Plans shown on provider onboarding step 15 (marketing /pricing keeps full catalog). */
export function filterPricingPlansForOnboarding<T extends OnboardingPricingPlanRow>(
  plans: T[],
): T[] {
  return plans.filter((plan) => {
    if (plan.is_free) return true;
    if (!plan.subscription_plan_id?.trim()) return false;
    const periods = plan.available_billing_periods ?? [];
    return periods.length > 0;
  });
}
