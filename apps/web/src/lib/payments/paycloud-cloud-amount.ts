/**
 * PayCloud Cloud Mode amounts are major currency units (one ZAR = one rand),
 * formatted with two decimal places as strings — e.g. "34.50" per official docs.
 * Same-terminal Intent uses cents separately; do not mix the two contracts.
 * @see https://developers.paycloud.africa/docs/addpay/CloudAPI/create-order/
 */

/** Round to currency precision before sending to PayCloud or storing expected amounts. */
export function normalizePaycloudMajorAmount(amountMajor: number): number {
  if (!Number.isFinite(amountMajor)) return 0;
  return Math.round(amountMajor * 100) / 100;
}

export function formatPaycloudCloudOrderAmount(currency: string, amountMajor: number): string {
  const normalized = normalizePaycloudMajorAmount(amountMajor);
  const code = currency.trim().toUpperCase();
  // ZAR and standard fiat: 2 decimal places (PayCloud examples use 34.50, 10.00).
  if (code === "ZAR" || code === "USD" || code === "EUR" || code === "GBP") {
    return normalized.toFixed(2);
  }
  return String(normalized);
}

/** Normalize gateway paid_amount / order_amount (already major units). */
export function parsePaycloudCloudCapturedAmount(
  _currency: string,
  rawAmount: string | number | null | undefined,
): number {
  const numeric = Number(rawAmount);
  return Number.isFinite(numeric) ? normalizePaycloudMajorAmount(numeric) : 0;
}

export function mergePaycloudCapturedMetadata(
  existing: Record<string, unknown> | null | undefined,
  captured: number,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    captured_amount: normalizePaycloudMajorAmount(captured),
  };
}

/** Gateway captured total when available; falls back to initiated charge amount. */
export function resolvePaycloudCapturedAmount(payment: {
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
}): number {
  const meta = payment.metadata as { captured_amount?: number | string } | null | undefined;
  const fromMeta = Number(meta?.captured_amount);
  if (Number.isFinite(fromMeta) && fromMeta > 0) {
    return normalizePaycloudMajorAmount(fromMeta);
  }
  return normalizePaycloudMajorAmount(Number(payment.amount ?? 0));
}
