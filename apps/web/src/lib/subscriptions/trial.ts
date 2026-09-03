/** Default trial length when a plan has no `trial_days` column/value. */
export const DEFAULT_PROVIDER_TRIAL_DAYS = 14;

export function computeTrialEndsAt(from: Date, trialDays: number): string {
  const days = Number.isFinite(trialDays) && trialDays > 0 ? Math.floor(trialDays) : DEFAULT_PROVIDER_TRIAL_DAYS;
  const ends = new Date(from.getTime());
  ends.setUTCDate(ends.getUTCDate() + days);
  return ends.toISOString();
}

export function planPriceForPeriod(
  plan: { price_monthly?: number | null; price_yearly?: number | null } | null | undefined,
  period: "monthly" | "yearly",
): number {
  if (!plan) return 0;
  const yearly = Number(plan.price_yearly ?? 0);
  const monthly = Number(plan.price_monthly ?? 0);
  if (period === "yearly") return yearly > 0 ? yearly : monthly * 12;
  return monthly > 0 ? monthly : yearly / 12;
}

/** Paid-to-paid downgrade: schedule at period end instead of switching immediately. */
export function isPaidToPaidDowngrade(
  current: { price_monthly?: number | null; price_yearly?: number | null } | null | undefined,
  next: { price_monthly?: number | null; price_yearly?: number | null } | null | undefined,
  period: "monthly" | "yearly",
): boolean {
  const from = planPriceForPeriod(current, period);
  const to = planPriceForPeriod(next, period);
  return from > 0 && to > 0 && to < from;
}
