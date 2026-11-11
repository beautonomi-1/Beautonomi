import { describe, expect, it } from "vitest";
import { resolveSubscriptionReceiptVat } from "../subscription-receipt-vat";

describe("resolveSubscriptionReceiptVat (F2-41)", () => {
  it("uses the VAT rate/amount stored on the payment row, not the current platform rate", () => {
    const r = resolveSubscriptionReceiptVat({
      grossAmount: 114,
      storedMetadata: { vat_rate_percent: 14, vat_amount: 14, subtotal_excl_vat: 100 },
      fallbackRatePercent: 15,
    });
    expect(r.source).toBe("stored");
    expect(r.ratePercent).toBe(14);
    expect(r.vatAmount).toBe(14);
    expect(r.subtotalExclVat).toBe(100);
    expect(r.gross).toBe(114);
  });

  it("derives the excl-VAT subtotal when only rate and amount were stored", () => {
    const r = resolveSubscriptionReceiptVat({
      grossAmount: 115,
      storedMetadata: { vat_rate_percent: "15", vat_amount: "15" },
      fallbackRatePercent: 20,
    });
    expect(r.source).toBe("stored");
    expect(r.ratePercent).toBe(15);
    expect(r.subtotalExclVat).toBe(100);
  });

  it("honours an explicitly stored zero rate (no VAT at the time of payment)", () => {
    const r = resolveSubscriptionReceiptVat({
      grossAmount: 100,
      storedMetadata: { vat_rate_percent: 0 },
      fallbackRatePercent: 15,
    });
    expect(r.source).toBe("stored");
    expect(r.ratePercent).toBe(0);
    expect(r.vatAmount).toBe(0);
    expect(r.subtotalExclVat).toBe(100);
  });

  it("falls back to recomputing with the supplied rate only for legacy rows without a snapshot", () => {
    const r = resolveSubscriptionReceiptVat({
      grossAmount: 115,
      storedMetadata: { reference: "ref_1" },
      fallbackRatePercent: 15,
    });
    expect(r.source).toBe("recomputed");
    expect(r.ratePercent).toBe(15);
    expect(r.vatAmount).toBe(15);
    expect(r.subtotalExclVat).toBe(100);
  });
});
