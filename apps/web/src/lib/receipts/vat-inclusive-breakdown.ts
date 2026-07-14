export type VatInclusiveBreakdown = {
  gross: number;
  subtotalExclVat: number;
  vatAmount: number;
  ratePercent: number;
};

/**
 * Split a VAT-inclusive gross amount into excl-VAT subtotal and VAT portion.
 * Returns gross-only values when rate is 0 or unset.
 */
export function computeVatInclusiveBreakdown(
  gross: number,
  ratePercent: number,
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

  const subtotalExclVat = Math.round((gross / (1 + rate / 100)) * 100) / 100;
  const vatAmount = Math.round((gross - subtotalExclVat) * 100) / 100;

  return {
    gross,
    subtotalExclVat,
    vatAmount,
    ratePercent: rate,
  };
}
