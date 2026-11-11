import { computeVat } from "@beautonomi/utils";

export type VatInclusiveBreakdown = {
  gross: number;
  subtotalExclVat: number;
  vatAmount: number;
  ratePercent: number;
};

/**
 * Split a VAT-inclusive gross amount into excl-VAT subtotal and VAT portion.
 * Returns gross-only values when rate is 0 or unset.
 *
 * Thin adapter over the canonical `computeVat` (F2-38): there must be exactly
 * one inclusive-VAT rounding order in the codebase.
 */
export function computeVatInclusiveBreakdown(
  gross: number,
  ratePercent: number,
  currency = "ZAR",
): VatInclusiveBreakdown {
  const rate = Number(ratePercent || 0);
  if (!Number.isFinite(gross) || gross <= 0 || rate <= 0) {
    return {
      gross,
      subtotalExclVat: gross,
      vatAmount: 0,
      ratePercent: 0,
    };
  }

  const { netAmount, taxAmount } = computeVat({
    baseAmount: gross,
    ratePercent: rate,
    inclusive: true,
    currency,
  });

  return {
    gross,
    subtotalExclVat: netAmount,
    vatAmount: taxAmount,
    ratePercent: rate,
  };
}
