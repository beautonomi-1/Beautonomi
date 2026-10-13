/**
 * Mirrors web `native-app-checkout-bounce` query normalization for App Link cold starts
 * (when HTTPS opens the app directly without loading the web bridge page).
 */

const CANCEL_QUERY_FLAGS = [
  "cancelled",
  "payment_cancelled",
  "topup_cancelled",
  "card_verification_cancelled",
  "pay_remaining_cancelled",
  "charge_cancelled",
  "membership_cancelled",
] as const;

const CANCEL_LANDING_PATHS = ["/checkout/cancelled", "/shop/cancelled", "/gift-card/purchase/cancelled"] as const;

export function isPaymentCancelLanding(pathname: string, params: URLSearchParams): boolean {
  if (CANCEL_LANDING_PATHS.some((p) => pathname.includes(p))) return true;
  if (CANCEL_QUERY_FLAGS.some((k) => params.get(k) === "1")) return true;
  return params.get("status")?.toLowerCase() === "cancelled";
}

/** Ensure PaystackReturnScreen sees `cancelled=1` on every cancel landing. */
export function normalizePaymentReturnSearch(pathname: string, search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (isPaymentCancelLanding(pathname, params)) {
    params.set("cancelled", "1");
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}
