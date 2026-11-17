export const DUNNING_RETRY_DAYS = [1, 3, 5] as const;
export const DUNNING_MAX_RETRIES = DUNNING_RETRY_DAYS.length;

/**
 * Days from the first failed charge until the last saved-card retry can run,
 * plus one day so the expire job does not win that race.
 */
export function dunningCollectionWindowDays(): number {
  return DUNNING_RETRY_DAYS.reduce((sum, days) => sum + days, 0) + 1;
}

/**
 * A saved-card retry is due on day 1, 3, or 5 after the last attempt.
 * No recorded attempt means the card has not been charged yet, including a
 * trial that just became past due, so the charge runs now.
 */
export function dunningChargeIsDue(
  lastDunningRetryAt: string | null | undefined,
  retryCount: number,
  nowMs = Date.now(),
): boolean {
  const targetDay = DUNNING_RETRY_DAYS[retryCount];
  if (targetDay == null) return false;
  if (!lastDunningRetryAt) return true;
  const attemptedAt = new Date(lastDunningRetryAt).getTime();
  if (!Number.isFinite(attemptedAt)) return true;
  const daysSinceAttempt = (nowMs - attemptedAt) / 86400000;
  return daysSinceAttempt >= targetDay;
}

/** A Paystack saved-card charge pays a Paystack or manual plan. A Flutterwave charge pays a Flutterwave plan. */
export function savedCardChargeOwnsPlan(
  paymentProvider: string | null | undefined,
  billingProvider: string | null | undefined,
): boolean {
  const charge = String(paymentProvider ?? "paystack").toLowerCase();
  const plan = String(billingProvider ?? "paystack").toLowerCase();
  if (charge === "flutterwave") return plan === "flutterwave";
  return plan === "paystack" || plan === "manual";
}

/**
 * The new paid slice starts at the current end date when that date is still ahead.
 * Otherwise it starts when the card was charged.
 */
export function savedCardRenewalPeriodAnchorMs(
  expiresAt: string | null | undefined,
  paidAtMs: number,
): number {
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(expiresMs) && expiresMs > paidAtMs ? expiresMs : paidAtMs;
}

/** A saved-card renewal that already opened the period must not add another one. */
export function savedCardRenewalShouldOpenPeriod(
  status: string | null | undefined,
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  return !(status === "active" && Number.isFinite(expiresMs) && expiresMs > nowMs);
}
