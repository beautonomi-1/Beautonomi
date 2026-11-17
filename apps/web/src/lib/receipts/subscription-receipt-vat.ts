import { roundCurrency, subtractMoney } from "@beautonomi/utils";
import { computeVatInclusiveBreakdown } from "@/lib/receipts/vat-inclusive-breakdown";

export type SubscriptionReceiptVat = {
  gross: number;
  subtotalExclVat: number;
  vatAmount: number;
  ratePercent: number;
  /** `stored` = snapshot on the payment row; `recomputed` = legacy row without a snapshot. */
  source: "stored" | "recomputed";
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * F2-41: a receipt is a historical document. Use the VAT rate / amount that was
 * snapshotted on the finance row when the payment was recorded
 * (`metadata.vat_rate_percent`, `vat_amount`, `subtotal_excl_vat`). Only legacy
 * rows written before the snapshot existed fall back to recomputing with the
 * supplied rate.
 */
export function resolveSubscriptionReceiptVat(input: {
  grossAmount: number;
  storedMetadata: Record<string, unknown> | null | undefined;
  fallbackRatePercent: number;
  currency?: string;
}): SubscriptionReceiptVat {
  const gross = roundCurrency(Number(input.grossAmount) || 0, input.currency);
  const meta = input.storedMetadata ?? {};
  const storedRate = num(meta.vat_rate_percent);

  if (storedRate !== null) {
    const rate = Math.max(0, storedRate);
    if (rate === 0) {
      return { gross, subtotalExclVat: gross, vatAmount: 0, ratePercent: 0, source: "stored" };
    }
    const storedVat = num(meta.vat_amount);
    const storedSubtotal = num(meta.subtotal_excl_vat);
    const vatAmount =
      storedVat !== null
        ? roundCurrency(storedVat, input.currency)
        : computeVatInclusiveBreakdown(gross, rate, input.currency).vatAmount;
    const subtotalExclVat =
      storedSubtotal !== null
        ? roundCurrency(storedSubtotal, input.currency)
        : subtractMoney(gross, vatAmount, input.currency);
    return { gross, subtotalExclVat, vatAmount, ratePercent: rate, source: "stored" };
  }

  const recomputed = computeVatInclusiveBreakdown(gross, input.fallbackRatePercent, input.currency);
  return {
    gross,
    subtotalExclVat: recomputed.subtotalExclVat,
    vatAmount: recomputed.vatAmount,
    ratePercent: recomputed.ratePercent,
    source: "recomputed",
  };
}
