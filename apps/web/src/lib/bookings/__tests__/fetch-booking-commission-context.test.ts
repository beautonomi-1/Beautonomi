import { describe, expect, it } from "vitest";
import { fetchBookingCommissionContext } from "../fetch-booking-commission-context";

type PaymentRow = {
  id: string;
  amount: number;
  status: string;
  payment_provider_id: string | null;
};

type LedgerRow = { transaction_type: string; net: number };

function makeSupabaseMock(payments: PaymentRow[], ledger: LedgerRow[]) {
  const from = (table: string) => ({
    select: () => ({
      eq: async () => ({
        data: table === "booking_payments" ? payments : ledger,
        error: null,
      }),
    }),
  });
  return { from } as any;
}

describe("fetchBookingCommissionContext", () => {
  it("adds the charge amount when the payment row is not yet recorded", async () => {
    const supabase = makeSupabaseMock(
      [{ id: "bp-1", amount: 208, status: "completed", payment_provider_id: "ref-1" }],
      [
        { transaction_type: "provider_earnings", net: 60 },
        { transaction_type: "platform_fee", net: 18 },
        { transaction_type: "tip", net: 10 },
        { transaction_type: "travel_fee", net: 120 },
      ],
    );

    const context = await fetchBookingCommissionContext(supabase, "booking-1", {
      chargeAmount: 69,
      excludeReference: "ref-2",
    });

    expect(context.cumulativePaid).toBe(277);
    expect(context.postedLegsSum).toBe(208);
    expect(context.bookingLevelItemsAlreadyPosted).toBe(true);
    expect([...context.existingBookingLevelTypes].sort()).toEqual(
      ["platform_fee", "tip", "travel_fee"].sort(),
    );
  });

  it("does not double count when this charge's payment row is already recorded", async () => {
    const supabase = makeSupabaseMock(
      [
        { id: "bp-1", amount: 208, status: "completed", payment_provider_id: "ref-1" },
        { id: "bp-2", amount: 69, status: "completed", payment_provider_id: "ref-2" },
      ],
      [
        { transaction_type: "provider_earnings", net: 60 },
        { transaction_type: "platform_fee", net: 18 },
        { transaction_type: "tip", net: 10 },
        { transaction_type: "travel_fee", net: 120 },
      ],
    );

    const byReference = await fetchBookingCommissionContext(supabase, "booking-1", {
      chargeAmount: 69,
      excludeReference: "ref-2",
    });
    const byPaymentId = await fetchBookingCommissionContext(supabase, "booking-1", {
      chargeAmount: 69,
      excludePaymentId: "bp-2",
    });

    expect(byReference.cumulativePaid).toBe(277);
    expect(byPaymentId.cumulativePaid).toBe(277);
  });

  it("ignores pending and failed payment rows", async () => {
    const supabase = makeSupabaseMock(
      [
        { id: "bp-1", amount: 100, status: "completed", payment_provider_id: "ref-1" },
        { id: "bp-2", amount: 50, status: "pending", payment_provider_id: "wallet:booking-1" },
        { id: "bp-3", amount: 25, status: "failed", payment_provider_id: "ref-3" },
        { id: "bp-4", amount: 40, status: "partially_refunded", payment_provider_id: "ref-4" },
      ],
      [],
    );

    const context = await fetchBookingCommissionContext(supabase, "booking-1", {
      chargeAmount: 0,
    });

    expect(context.cumulativePaid).toBe(140);
    expect(context.bookingLevelItemsAlreadyPosted).toBe(false);
  });
});
