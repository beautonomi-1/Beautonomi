import { extractHostedCheckoutReturn } from "@/lib/paystack-webview-utils";

/** Parse reference + Stripe session_id + Flutterwave transaction_id from return URLs. */
export function parseOnlineCheckoutReturnUrl(url: string): {
  reference: string | null;
  sessionId: string | null;
  transactionId: string | null;
  status: string | null;
} {
  const parsed = extractHostedCheckoutReturn(url);
  return {
    reference: parsed.reference,
    sessionId: parsed.sessionId,
    transactionId: parsed.transactionId,
    status: parsed.status,
  };
}

export function isHostedCheckoutFailureStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled";
}
