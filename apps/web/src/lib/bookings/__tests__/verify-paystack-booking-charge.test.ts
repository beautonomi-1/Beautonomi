import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  bookingFinancialsFromDb,
  expectedHostedCardAmountMajor,
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

  it("accepts a matching booking reference when the pending payments row is missing", async () => {
    const result = await verifyPaystackBookingCharge({
      supabase: mockSupabase([]),
      bookingId: "b1",
      reference: "ref_hosted",
      bookingPaymentReference: "ref_hosted",
      paystackAmountSmallest: 18000,
      paystackCurrency: "ZAR",
      tenantId: "tenant-1",
      fallbackAmountMajor: 180,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amountMajor).toBe(180);
    expect(recordException).not.toHaveBeenCalled();
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

describe("expectedHostedCardAmountMajor", () => {
  it("uses the full total after tip and booking protection when nothing else was applied", () => {
    expect(
      expectedHostedCardAmountMajor({
        total_amount: 180,
        currency: "ZAR",
        payment_option: "full",
      }),
    ).toBe(180);
  });

  it("subtracts wallet, gift card, and reschedule credit, and uses the deposit when that was the option", () => {
    expect(
      expectedHostedCardAmountMajor({
        total_amount: 200,
        deposit_amount: 60,
        payment_option: "deposit",
        wallet_amount: 10,
        gift_card_amount: 5,
        reschedule_credit_pending: 5,
        currency: "ZAR",
      }),
    ).toBe(40);
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

  it("reads platform fee from service_fee when platform column is zero", () => {
    const fin = bookingFinancialsFromDb({
      platform_fee_amount: 0,
      service_fee_amount: 12.5,
    });
    expect(fin.serviceFeeAmount).toBe(12.5);
  });

  it("reads zero when both fee columns are zero (provider-portal booking)", () => {
    const fin = bookingFinancialsFromDb({
      platform_fee_amount: 0,
      service_fee_amount: 0,
    });
    expect(fin.serviceFeeAmount).toBe(0);
  });
});
