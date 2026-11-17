import { addMoney, multiplyMoney, percentOf, roundCurrency, subtractMoney } from "../money";

export type ComputeVatInput = {
  baseAmount: number;
  ratePercent: number;
  inclusive: boolean;
  currency?: string;
};

export type ComputeVatResult = {
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
};

/**
 * Canonical VAT split for a single taxable base (major units, 2dp).
 * Inclusive: tax is extracted from base; exclusive: tax is added on top.
 */
export function computeVat(input: ComputeVatInput): ComputeVatResult {
  const currency = input.currency ?? "ZAR";
  const rate = Math.max(0, Number(input.ratePercent) || 0);
  const base = Math.max(0, Number(input.baseAmount) || 0);

  if (rate <= 0) {
    const rounded = roundCurrency(base, currency);
    return { netAmount: rounded, taxAmount: 0, grossAmount: rounded };
  }

  if (input.inclusive) {
    const gross = roundCurrency(base, currency);
    const taxAmount = multiplyMoney(gross, rate / (100 + rate), currency);
    const netAmount = subtractMoney(gross, taxAmount, currency);
    return { netAmount, taxAmount, grossAmount: gross };
  }

  const netAmount = roundCurrency(base, currency);
  const taxAmount = percentOf(netAmount, rate, currency);
  const grossAmount = addMoney(netAmount, taxAmount, currency);
  return { netAmount, taxAmount, grossAmount };
}

/** Sum line-level VAT (each line rounded) then round total — use for multi-line carts. */
export function sumLineVat(
  lines: Array<{ baseAmount: number; ratePercent: number; inclusive: boolean }>,
  currency = "ZAR",
): number {
  let total = 0;
  for (const line of lines) {
    total = addMoney(total, computeVat({ ...line, currency }).taxAmount, currency);
  }
  return total;
}
