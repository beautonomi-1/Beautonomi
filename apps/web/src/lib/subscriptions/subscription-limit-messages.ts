/**
 * User-appropriate copy for subscription / plan limit checks.
 * - Customers must never see internal SaaS wording ("provider subscription plan").
 * - Provider portal messages can reference plan/subscription clearly.
 */

import type { LimitCheckResult } from "./limit-checker";

/** Shown to customers when the salon cannot accept bookings due to platform/plan state (not their fault). */
export const PUBLIC_CUSTOMER_BOOKING_UNAVAILABLE =
  "This business isn’t accepting online bookings right now. Please try again later or choose another provider.";

/** When the limit RPC fails or returns nothing (ops should investigate). */
export const PUBLIC_CUSTOMER_BOOKING_LIMIT_CHECK_FAILED =
  "We couldn’t complete your booking. Please try again in a moment.";

/**
 * Map internal RPC reasons to safe customer-facing booking messages.
 */
export function formatPublicCustomerBookingLimitMessage(limitCheck: LimitCheckResult): string {
  if (limitCheck.canProceed) {
    return limitCheck.reason;
  }

  if (limitCheck.reason === "Unable to check booking limit") {
    return PUBLIC_CUSTOMER_BOOKING_LIMIT_CHECK_FAILED;
  }

  const r = limitCheck.reason;

  if (
    r === "No active subscription plan" ||
    r.includes("No active subscription") ||
    r.toLowerCase().includes("subscription plan")
  ) {
    return PUBLIC_CUSTOMER_BOOKING_UNAVAILABLE;
  }

  if (r.includes("Monthly booking limit reached") || r.includes("booking limit reached")) {
    return "This business is fully booked for this period. Please try a different date or another provider.";
  }

  return PUBLIC_CUSTOMER_BOOKING_UNAVAILABLE;
}

/**
 * Provider/staff portal: actionable, mentions plan where helpful.
 */
export function formatProviderPortalLimitMessage(limitCheck: LimitCheckResult, actionLabel = "Subscription"): string {
  if (limitCheck.isUnlimited) {
    return limitCheck.reason;
  }
  if (limitCheck.canProceed) {
    return limitCheck.reason;
  }

  const r = limitCheck.reason;
  const plan = limitCheck.planName?.trim();

  if (r === "No active subscription plan" || r.includes("No active subscription")) {
    const settingsHint =
      actionLabel.toLowerCase() === "plan"
        ? "Subscription or billing settings"
        : `${actionLabel} settings`;
    return `No active platform plan is linked to your business. Open ${settingsHint} to choose or activate a plan so you can continue.`;
  }

  if (plan) {
    return `${r} Current plan: ${plan}. Upgrade in ${actionLabel} settings if you need higher limits.`;
  }

  return `${r} Review your ${actionLabel.toLowerCase()} in settings.`;
}
