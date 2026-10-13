function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

/** Expo Router search params from hosted checkout return (Paystack / Stripe / Flutterwave). */
export function pickHostedCheckoutRouteParams(params: Record<string, unknown>): {
  reference: string;
  sessionId: string | null;
  transactionId: string | null;
  status: string | null;
} {
  const reference =
    pickStr(params.reference) || pickStr(params.trxref) || pickStr(params.tx_ref);
  const sessionId = pickStr(params.session_id) || null;
  const transactionId = pickStr(params.transaction_id) || null;
  const statusRaw = pickStr(params.status);
  const status = statusRaw ? statusRaw.toLowerCase() : null;
  return { reference, sessionId, transactionId, status };
}

export function isHostedCheckoutFailureStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled";
}
