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
  updatedAt?: string | null;
  appleGracePeriodExpiresAt?: string | null;
  nowIso: string;
  graceCutoffIso: string;
};

/**
 * past_due access window. Paystack: 3 days from the status change. Apple: only
 * while StoreKit's gracePeriodExpiresDate is still open — do not invent the
 * Paystack window when Apple omitted a grace date (Billing Grace Period off).
 */
export function isPastDueWithinGrace(params: PastDueGraceInput): boolean {
  if (params.billingProvider === "apple") {
    return Boolean(
      params.appleGracePeriodExpiresAt && params.appleGracePeriodExpiresAt >= params.nowIso,
    );
  }
  if (params.updatedAt && params.updatedAt < params.graceCutoffIso) return false;
  return true;
}
