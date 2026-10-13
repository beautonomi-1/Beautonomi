import {
  extractPaystackReferenceFromUrl,
  extractStripeCheckoutSessionIdFromUrl,
  extractFlutterwaveTransactionIdFromUrl,
  extractHostedCheckoutStatusFromUrl,
} from "@/lib/payments/paystackRefFromUrl";

/** Parse reference + Stripe session_id + Flutterwave fields from hosted checkout return URLs. */
export function parseOnlineCheckoutReturnUrl(url: string): {
  reference: string | null;
  sessionId: string | null;
  transactionId: string | null;
  status: string | null;
} {
  return {
    reference: extractPaystackReferenceFromUrl(url),
    sessionId: extractStripeCheckoutSessionIdFromUrl(url),
    transactionId: extractFlutterwaveTransactionIdFromUrl(url),
    status: extractHostedCheckoutStatusFromUrl(url),
  };
}

export function isHostedCheckoutFailureStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled";
}
