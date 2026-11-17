/** Clears onboarding / upgrade intent columns on provider_subscriptions. */
export const CLEAR_PENDING_UPGRADE_FIELDS = {
  pending_upgrade_plan_id: null,
  pending_upgrade_billing_period: null,
  pending_upgrade_set_at: null,
} as const;

/** Clears a stale upgrade. A past-due row keeps the grace timestamp. */
export function stalePendingUpgradePatch(input: {
  status?: string | null;
  now?: Date;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...CLEAR_PENDING_UPGRADE_FIELDS };
  if (input.status !== "past_due") {
    patch.updated_at = (input.now ?? new Date()).toISOString();
  }
  return patch;
}

/** Saves an upgrade intent. A past-due row keeps the grace timestamp. */
export function pendingUpgradeIntentPatch(input: {
  planId: string;
  billingPeriod: "monthly" | "yearly";
  status?: string | null;
  now?: Date;
}): Record<string, unknown> {
  const now = (input.now ?? new Date()).toISOString();
  const patch: Record<string, unknown> = {
    pending_upgrade_plan_id: input.planId,
    pending_upgrade_billing_period: input.billingPeriod,
    pending_upgrade_set_at: now,
  };
  if (input.status !== "past_due") patch.updated_at = now;
  return patch;
}

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
