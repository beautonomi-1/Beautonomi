const MEMBERSHIP_MAX_RENEWAL_RETRIES = 3;

function retryDelayDays(failureCount: number): number {
  return Math.min(failureCount + 1, 3);
}

/** The next attempt after an automatic membership renewal charge has failed. */
export function membershipRetryAfterFailedRenewal(input: {
  failureCount: number;
  status: string | null | undefined;
  pastDueSince: string | null | undefined;
  now: Date;
}): {
  status: "past_due";
  past_due_since: string;
  renewal_failure_count: number;
  next_billing_at: string | null;
  auto_renew: false | undefined;
} {
  const prior = Math.max(0, Number(input.failureCount) || 0);
  const renewal_failure_count = prior + 1;
  const past_due_since =
    input.status === "past_due"
      ? (input.pastDueSince ?? input.now.toISOString())
      : input.now.toISOString();
  if (renewal_failure_count >= MEMBERSHIP_MAX_RENEWAL_RETRIES) {
    return {
      status: "past_due",
      past_due_since,
      renewal_failure_count,
      next_billing_at: null,
      auto_renew: false,
    };
  }
  return {
    status: "past_due",
    past_due_since,
    renewal_failure_count,
    next_billing_at: new Date(
      input.now.getTime() + retryDelayDays(prior) * 24 * 60 * 60 * 1000,
    ).toISOString(),
    auto_renew: undefined,
  };
}

function advanceOneMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

/** The current end date is still ahead, whatever the membership status is. */
export function membershipExpiresStillOpen(
  currentExpiresAt: string | null | undefined,
  now: Date,
): boolean {
  const expires = currentExpiresAt ? new Date(currentExpiresAt) : null;
  return expires != null && Number.isFinite(expires.getTime()) && expires.getTime() > now.getTime();
}

/** One paid month after a still-open end date, or from now when that end date has passed. */
export function renewalPeriodEnd(currentExpiresAt: string | null | undefined, now: Date): Date {
  const expires = currentExpiresAt ? new Date(currentExpiresAt) : null;
  return advanceOneMonth(
    membershipExpiresStillOpen(currentExpiresAt, now) && expires ? expires : now,
  );
}
