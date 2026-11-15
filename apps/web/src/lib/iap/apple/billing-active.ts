/**
 * Apple is merchant of record only while the local row is still in an entitled
 * Apple billing state. After EXPIRED / revoke, Paystack checkout is allowed
 * again so the provider is not locked out of Android/web billing.
 */

export const APPLE_BILLING_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isAppleBillingActive(
  billingProvider?: string | null,
  status?: string | null,
): boolean {
  return billingProvider === "apple" && APPLE_BILLING_ACTIVE_STATUSES.has(status ?? "");
}

export type PastDueGraceInput = {
  billingProvider?: string | null;
  /** First failure. A later row update must not move this. */
  pastDueSince?: string | null;
  /** Used only when pastDueSince was never stored. */
  updatedAt?: string | null;
  appleGracePeriodExpiresAt?: string | null;
  nowIso: string;
  graceCutoffIso: string;
};

/**
 * past_due access window. Paystack, Stripe, and Flutterwave: 3 days from the
 * first failed charge (`past_due_since`). Apple: only while StoreKit's
 * gracePeriodExpiresDate is still open — do not invent the Paystack window
 * when Apple omitted a grace date (Billing Grace Period off).
 */
function instantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isPastDueWithinGrace(params: PastDueGraceInput): boolean {
  if (params.billingProvider === "apple") {
    const graceMs = instantMs(params.appleGracePeriodExpiresAt);
    const nowMs = instantMs(params.nowIso);
    if (graceMs == null || nowMs == null) return false;
    return graceMs >= nowMs;
  }
  const anchorMs = instantMs(params.pastDueSince) ?? instantMs(params.updatedAt);
  const cutoffMs = instantMs(params.graceCutoffIso);
  if (anchorMs != null && cutoffMs != null && anchorMs < cutoffMs) return false;
  return true;
}

/** A card past_due row with no recorded attempt is a trial handoff, not a failed charge. */
export function subscriptionChargeNotAttempted(row: {
  billing_provider?: string | null;
  last_dunning_retry_at?: string | null;
  dunning_retry_count?: number | null;
  trial_ends_at?: string | null;
  nowMs?: number;
}): boolean {
  if (row.billing_provider === "apple" || row.billing_provider === "stripe") return false;
  if (row.last_dunning_retry_at) return false;
  if (Number(row.dunning_retry_count ?? 0) !== 0) return false;
  const trialEnd = row.trial_ends_at ? Date.parse(row.trial_ends_at) : Number.NaN;
  if (!Number.isFinite(trialEnd)) return false;
  return trialEnd <= (row.nowMs ?? Date.now());
}

const CARD_PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Message when a saved-card trial has not been charged yet.
 * Null once a charge has been recorded, or when this is not that handoff.
 */
export function pendingSavedCardChargeRefusal(
  row: {
    billing_provider?: string | null;
    last_dunning_retry_at?: string | null;
    dunning_retry_count?: number | null;
    trial_ends_at?: string | null;
    past_due_since?: string | null;
    updated_at?: string | null;
    apple_grace_period_expires_at?: string | null;
  },
  nowMs = Date.now(),
): string | null {
  if (!subscriptionChargeNotAttempted({ ...row, nowMs })) return null;
  const nowIso = new Date(nowMs).toISOString();
  const stillEntitled = isPastDueWithinGrace({
    billingProvider: row.billing_provider,
    pastDueSince: row.past_due_since,
    updatedAt: row.updated_at,
    appleGracePeriodExpiresAt: row.apple_grace_period_expires_at,
    nowIso,
    graceCutoffIso: new Date(nowMs - CARD_PAST_DUE_GRACE_MS).toISOString(),
  });
  return pastDueBillingMessage(row.billing_provider, stillEntitled, true);
}

/** Checkout failure text. Internal codes already stored on an order become a sentence. */
export function providerCheckoutFailureMessage(
  reason: string | null | undefined,
): string | null {
  const text = reason?.trim() ?? "";
  if (!text) return null;
  if (text === "switched_to_apple" || text === "apple_verified") {
    return "This checkout was replaced by an App Store subscription.";
  }
  if (text === "superseded_by_new_checkout") {
    return "This checkout was replaced by a newer one.";
  }
  if (text === "apple_billing_active") {
    return "This plan is billed through the App Store. This checkout was not applied.";
  }
  return text;
}

/** Copy for a past_due plan. Access continues only while grace is still open. */
export function pastDueBillingMessage(
  billingProvider: string | null | undefined,
  stillEntitled: boolean,
  chargeNotAttempted = false,
): string {
  if (chargeNotAttempted && billingProvider !== "apple") {
    return stillEntitled
      ? "Your trial has ended. The card on file will be charged shortly. Premium features stay active while that charge is processed."
      : "Your trial has ended and the card on file has not been charged yet. Premium features are paused until that charge succeeds.";
  }
  if (billingProvider === "apple") {
    return stillEntitled
      ? "Apple could not renew this plan. Update the payment method on your Apple ID to keep premium features."
      : "Apple could not renew this plan. Update the payment method on your Apple ID. Premium features stay paused until Apple renews the plan.";
  }
  return stillEntitled
    ? "Your last subscription payment did not go through. Update your card or pay now to keep premium features active."
    : "Your last subscription payment did not go through. Premium features are paused. Update your card or pay now to restore them.";
}

/** Push/in-app sentence for subscription_payment_failed. */
export function subscriptionPaymentFailedAccessNote(stillEntitled: boolean): string {
  return stillEntitled
    ? "Premium features stay active for 3 days from the start of this payment problem. Update your payment method before then."
    : "Premium features are paused. Update your payment method to restore them.";
}
