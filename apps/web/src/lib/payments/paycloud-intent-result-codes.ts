/** Human-friendly messages for WiseCashier same-terminal Intent result codes. */
export const PAYCLOUD_INTENT_RESULT_MESSAGES: Record<string, string> = {
  "00": "Payment approved",
  K026: "Payment cancelled on the card machine",
  K027: "Payment timed out — try again",
  M016: "Duplicate order number — start a new payment",
  M002: "Invalid payment details — check amount and try again",
  M003: "Invalid amount",
  M007: "This payment type is not supported on this device",
  M008: "Payment app version mismatch — contact support",
  J000: "Network error — check connection and try again",
  J001: "Network error — cannot reach payment server",
  J002: "Network connection timed out",
  J003: "Network connection failed",
  G003: "PIN entry cancelled",
  G004: "PIN entry timed out",
  C009: "Card read timed out — try again",
  Q004: "Card machine is not fully configured — contact support",
  Q007: "Card machine configuration error — contact support",
};

export function humanizePaycloudIntentResult(code: string | null | undefined, fallback?: string | null): string {
  if (!code) return fallback?.trim() || "Payment did not complete — try again";
  return PAYCLOUD_INTENT_RESULT_MESSAGES[code] ?? fallback?.trim() ?? `Payment error (${code})`;
}

export function isPaycloudIntentResultApproved(code: string | null | undefined): boolean {
  return code === "00";
}
