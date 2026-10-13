/** Read hosted checkout return query params (Paystack, Stripe, Flutterwave). */
export function readHostedCheckoutReturnParams(sp: URLSearchParams): {
  reference: string;
  sessionId: string | null;
  transactionId: string | null;
  hostedStatus: string | null;
} {
  const reference =
    sp.get("reference")?.trim() ||
    sp.get("trxref")?.trim() ||
    sp.get("tx_ref")?.trim() ||
    "";
  const sessionId = sp.get("session_id")?.trim() || null;
  const transactionId = sp.get("transaction_id")?.trim() || null;
  const hostedStatus = sp.get("status")?.trim().toLowerCase() || null;
  return { reference, sessionId, transactionId, hostedStatus };
}

export function isHostedCheckoutFailureStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled";
}
