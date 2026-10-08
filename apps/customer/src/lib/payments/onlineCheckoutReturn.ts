import {
  extractPaystackReferenceFromUrl,
  extractStripeCheckoutSessionIdFromUrl,
} from "@/lib/paystack-webview-utils";

/** Parse reference + Stripe session_id from hosted checkout return URLs. */
export function parseOnlineCheckoutReturnUrl(url: string): {
  reference: string | null;
  sessionId: string | null;
} {
  return {
    reference: extractPaystackReferenceFromUrl(url),
    sessionId: extractStripeCheckoutSessionIdFromUrl(url),
  };
}
