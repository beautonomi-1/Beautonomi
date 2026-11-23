/**
 * Normalize booking/provider tax rate values for UI display.
 * Snapshots may store percent (15) or legacy fraction (0.15).
 */
export function normalizeTaxRatePercent(raw: number | string | null | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

/** True when normalized rate is at least 15% (ZA standard VAT). */
export function isStandardVatRatePercent(raw: number | string | null | undefined): boolean {
  return normalizeTaxRatePercent(raw) >= 15 - 0.001;
}
