/** Statuses that still represent a charge row with collectible/refundable balance. */
export const CHARGE_ROW_STATUSES = [
  "success",
  "partially_refunded",
  "refunded",
] as const;

export type ChargeRowStatus = (typeof CHARGE_ROW_STATUSES)[number];

export function parsePaymentAmount(val: unknown): number {
  const n = parseFloat(String(val ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** Gross charge minus recorded refund on a payment_transactions row. */
export function netPaymentTransactionAmount(row: {
  amount?: unknown;
  refund_amount?: unknown;
}): number {
  const gross = parsePaymentAmount(row.amount);
  const refunded = parsePaymentAmount(row.refund_amount);
  return Math.max(0, Math.round((gross - refunded) * 100) / 100);
}

export function isPrimaryChargeRow(row: {
  transaction_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const tt = String(row.transaction_type ?? "charge");
  if (tt === "additional_charge") return false;
  const kind =
    row.metadata && typeof row.metadata === "object"
      ? String((row.metadata as { kind?: unknown }).kind ?? "")
      : "";
  if (kind === "walk_in_additional_charge") return false;
  return tt === "charge";
}
