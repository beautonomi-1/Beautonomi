import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bookingFinancialsFromDb,
  verifyPaystackBookingCharge,
} from "../verify-paystack-booking-charge";

const recordException = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/finance/record-reconciliation-exception", () => ({
  recordReconciliationException: (...args: unknown[]) => recordException(...args),
}));

function mockSupabase(pendingRows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: pendingRows, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("verifyPaystackBookingCharge", () => {
  beforeEach(() => {
    recordException.mockClear();
  });

  it("accepts when pending payment reference and amount match", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([
        {
          amount: 150,
          currency: "ZAR",
          payment_provider_transaction_id: "ref_ok",
          metadata: { wallet_amount_applied: 10 },
        },
      ]),
      bookingId: "b1",
      reference: "ref_ok",
      paystackAmountSmallest: 15000,
      tenantId: "tenant-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amountMajor).toBe(150);
      expect(result.currency).toBe("ZAR");
    }
    expect(recordException).not.toHaveBeenCalled();
  });

  it("rejects amount mismatch and records reconciliation exception", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([
        {
          amount: 150,
          currency: "ZAR",
          payment_provider_transaction_id: "ref_ok",
        },
      ]),
      bookingId: "b1",
      reference: "ref_ok",
      paystackAmountSmallest: 100,
      tenantId: "tenant-1",
    });
    expect(result).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(recordException).toHaveBeenCalledWith(
      expect.objectContaining({ mismatchReason: "paystack_webhook:amount_mismatch" }),
    );
  });

  it("matches single pending row when bookingPaymentReference equals ref", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([
        { amount: 200, currency: "ZAR", payment_provider_transaction_id: null },
      ]),
      bookingId: "b1",
      reference: "ref_legacy",
      bookingPaymentReference: "ref_legacy",
      paystackAmountSmallest: 20000,
      paystackCurrency: "ZAR",
      tenantId: "tenant-1",
    });
    expect(result.ok).toBe(true);
  });

  it("matches by amount+currency when multiple pending rows share reference fallback", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([
        { amount: 100, currency: "ZAR", payment_provider_transaction_id: null },
        { amount: 200, currency: "ZAR", payment_provider_transaction_id: null },
      ]),
      bookingId: "b1",
      reference: "ref_legacy",
      bookingPaymentReference: "ref_legacy",
      paystackAmountSmallest: 20000,
      paystackCurrency: "ZAR",
      tenantId: "tenant-1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amountMajor).toBe(200);
  });

  it("rejects ambiguous multiple pending rows", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([
        { amount: 200, currency: "ZAR", payment_provider_transaction_id: null },
        { amount: 200, currency: "ZAR", payment_provider_transaction_id: null },
      ]),
      bookingId: "b1",
      reference: "ref_legacy",
      bookingPaymentReference: "ref_legacy",
      paystackAmountSmallest: 20000,
      tenantId: "tenant-1",
    });
    expect(result).toEqual({ ok: false, reason: "no_pending_payment" });
  });

  it("rejects when no pending payment exists", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([]),
      bookingId: "b1",
      reference: "ref_missing",
      paystackAmountSmallest: 10000,
      tenantId: "tenant-1",
    });
    expect(result).toEqual({ ok: false, reason: "no_pending_payment" });
  });
});

describe("bookingFinancialsFromDb", () => {
  it("prefers pending payment metadata for wallet and gift splits", () => {
    const fin = bookingFinancialsFromDb(
      { tip_amount: 5, wallet_amount: 0, gift_card_amount: 0 },
      { metadata: { wallet_amount_applied: 20, gift_card_amount_applied: 15 } },
    );
    expect(fin.walletAmountFromMeta).toBe(20);
    expect(fin.giftCardAmountFromMeta).toBe(15);
    expect(fin.tipAmount).toBe(5);
  });
});
