import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatformDefaultTaxRateAndInclusive } from "@/lib/pricing/checkout-tax-defaults";

export type TerminalOrderTotals = {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRatePercent: number;
  taxIncluded: boolean;
};

/**
 * Platform B2B terminal order totals — uses platform default tax (not provider tax).
 * Defaults to 0% when platform has not configured VAT.
 */
export async function computeTerminalOrderTotals(
  supabase: SupabaseClient,
  input: { unitPrice: number; quantity?: number },
): Promise<TerminalOrderTotals> {
  const { taxRate, taxIncluded } = await getPlatformDefaultTaxRateAndInclusive(supabase);
  const quantity = input.quantity ?? 1;
  const lineTotal = input.unitPrice * quantity;
  const rate = Math.max(0, Number(taxRate));

  if (rate <= 0) {
    return {
      subtotal: lineTotal,
      taxAmount: 0,
      totalAmount: lineTotal,
      taxRatePercent: 0,
      taxIncluded: false,
    };
  }

  if (taxIncluded) {
    const divisor = 1 + rate / 100;
    const taxAmount = lineTotal - lineTotal / divisor;
    const subtotal = lineTotal - taxAmount;
    return {
      subtotal,
      taxAmount,
      totalAmount: lineTotal,
      taxRatePercent: rate,
      taxIncluded: true,
    };
  }

  const subtotal = lineTotal;
  const taxAmount = subtotal * (rate / 100);
  return {
    subtotal,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    taxRatePercent: rate,
    taxIncluded: false,
  };
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
  const quantity = input.quantity ?? 1;
  const lineTotal = input.unitPrice * quantity;
  const rate = Math.max(0, Number(input.taxRatePercent ?? 0));
  const taxIncluded = input.taxIncluded === true;

  if (rate <= 0) {
    return {
      subtotal: lineTotal,
      taxAmount: 0,
      totalAmount: lineTotal,
      taxRatePercent: 0,
      taxIncluded: false,
    };
  }

  if (taxIncluded) {
    const divisor = 1 + rate / 100;
    const taxAmount = lineTotal - lineTotal / divisor;
    const subtotal = lineTotal - taxAmount;
    return {
      subtotal,
      taxAmount,
      totalAmount: lineTotal,
      taxRatePercent: rate,
      taxIncluded: true,
    };
  }

  const subtotal = lineTotal;
  const taxAmount = subtotal * (rate / 100);
  return {
    subtotal,
    taxAmount,
    totalAmount: subtotal + taxAmount,
    taxRatePercent: rate,
    taxIncluded: false,
  };
}
