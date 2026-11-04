/** Clears onboarding / upgrade intent columns on provider_subscriptions. */
export const CLEAR_PENDING_UPGRADE_FIELDS = {
  pending_upgrade_plan_id: null,
  pending_upgrade_billing_period: null,
  pending_upgrade_set_at: null,
} as const;

export type PendingUpgradeSnapshot = {
  plan_id: string;
  billing_period: "monthly" | "yearly";
  set_at?: string | null;
};

export function normalizeBillingPeriod(
  value: string | null | undefined,
): "monthly" | "yearly" | null {
  if (value === "monthly" || value === "yearly") return value;
  return null;
}
