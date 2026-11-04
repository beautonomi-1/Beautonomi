/**
 * Normalize booking/provider tax rate values for UI display.
 * Snapshots may store percent (15) or legacy fraction (0.15).
 */
export function normalizeTaxRatePercent(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return 0;
  const n = Number(raw);
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

/** True when normalized rate is at least 15% (ZA standard VAT). */
export function isStandardVatRatePercent(raw: number | null | undefined): boolean {
  return normalizeTaxRatePercent(raw) >= 15 - 0.001;
}
