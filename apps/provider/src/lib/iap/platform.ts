import { Platform } from "react-native";

/** True on native iOS builds (not web). */
export function isIosNative(): boolean {
  return Platform.OS === "ios";
}

/** StoreKit IAP path — iOS native only; Android/web stay on Paystack. */
export function shouldUseAppleIap(): boolean {
  return isIosNative();
}

const APPLE_BILLING_ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Apple is still merchant of record — Paystack checkout would double-charge. */
export function isAppleBillingActive(
  billingProvider?: string | null,
  status?: string | null,
): boolean {
  return billingProvider === "apple" && APPLE_BILLING_ACTIVE_STATUSES.has(status ?? "");
}
