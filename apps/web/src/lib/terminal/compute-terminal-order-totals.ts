import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformDefaultTaxRateAndInclusive } from "@/lib/pricing/checkout-tax-defaults";
import { LAST_RESORT_CURRENCY, computeVat, multiplyMoney } from "@beautonomi/utils";

export type TerminalOrderTotals = {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent: number;
  taxIncluded: boolean;
};

function totalsFromLine(
  unitPrice: number,
  quantity: number,
  rate: number,
  taxIncluded: boolean,
): TerminalOrderTotals {
  const lineTotal = multiplyMoney(unitPrice, quantity, LAST_RESORT_CURRENCY);
  if (rate <= 0) {
    return {
      subtotal: lineTotal,
      taxAmount: 0,
      totalAmount: lineTotal,
      taxRatePercent: 0,
      taxIncluded: false,
    };
  }
  const vat = computeVat({
    baseAmount: lineTotal,
    ratePercent: rate,
    inclusive: taxIncluded,
    currency: LAST_RESORT_CURRENCY,
  });
  return {
    subtotal: vat.netAmount,
    taxAmount: vat.taxAmount,
    totalAmount: vat.grossAmount,
    taxRatePercent: rate,
    taxIncluded,
  };
}

/**
 * Platform B2B terminal order totals — uses platform default tax (not provider tax).
 * Defaults to 0% when platform has not configured VAT.
 */
export async function computeTerminalOrderTotals(
  supabase: SupabaseClient,
  input: { unitPrice: number; quantity?: number },
): Promise<TerminalOrderTotals> {
  const { taxRate, taxIncluded } = await getPlatformDefaultTaxRateAndInclusive(supabase);
  return totalsFromLine(
    input.unitPrice,
    input.quantity ?? 1,
    Math.max(0, Number(taxRate)),
    taxIncluded === true,
  );
}

/**
 * Pure calculation for tests — mirrors computeTerminalOrderTotals without DB.
 */
export function computeTerminalOrderTotalsSync(input: {
  unitPrice: number;
  quantity?: number;
  taxRatePercent?: number;
  taxIncluded?: boolean;
}): TerminalOrderTotals {
  return totalsFromLine(
    input.unitPrice,
    input.quantity ?? 1,
    Math.max(0, Number(input.taxRatePercent ?? 0)),
    input.taxIncluded === true,
  );
}
