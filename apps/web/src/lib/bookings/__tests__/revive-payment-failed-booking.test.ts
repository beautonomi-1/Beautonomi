import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bookings/revalidate-booking-slot-before-payment", () => ({
  revalidateBookingSlotBeforePayment: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/bookings/deduct-booking-retail-stock", () => ({
  deductBookingRetailStock: vi.fn(async () => []),
  undoUnsavedBookingStock: vi.fn(async () => undefined),
}));

import { revivePaymentFailedBooking } from "../revive-payment-failed-booking";
import { revalidateBookingSlotBeforePayment } from "@/lib/bookings/revalidate-booking-slot-before-payment";

function makeSupabase(opts: {
  booking: Record<string, unknown> | null;
  claimed?: Array<{ id: string }>;
  txStatus?: string | null;
  checkoutMetadata?: Record<string, unknown> | null;
}) {
  const deletes: Array<Record<string, unknown>> = [];
  const paymentUpdates: Array<Record<string, unknown>> = [];
  return {
    deletes,
    paymentUpdates,
    client: {
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: opts.booking, error: null })),
              })),
            })),
            update: vi.fn((values: Record<string, unknown>) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(async () => ({
                      data: opts.claimed ?? [{ id: "booking-1" }],
                      error: null,
                    })),
                  })),
                })),
              })),
              _values: values,
            })),
          };
        }
        if (table === "payment_transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: opts.txStatus ? { id: "tx-1", status: opts.txStatus } : null,
                    error: null,
                  })),
                })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => {
                    deletes.push({ table });
                    return { data: null, error: null };
                  }),
                })),
              })),
            })),
          };
        }
        if (table === "payments") {
          return {
            update: vi.fn((values: Record<string, unknown>) => {
              paymentUpdates.push(values);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ data: null, error: null })),
                })),
              };
            }),
          };
        }
        if (table === "online_payment_checkouts") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: opts.checkoutMetadata ? { metadata: opts.checkoutMetadata } : null,
                  error: null,
                })),
              })),
            })),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    },
  };
}

describe("revivePaymentFailedBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reopens a Payment failed cancel when the card paid the full total", async () => {
    const { client, deletes, paymentUpdates } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Payment failed",
        total_amount: 250,
        wallet_amount: 0,
        gift_card_amount: 0,
        customer_package_entitlement_id: null,
        rescheduled_from_booking_id: null,
      },
      txStatus: "failed",
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 250,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: true, revived: true });
    expect(deletes.length).toBe(1);
    expect(paymentUpdates[0]).toMatchObject({ status: "pending" });
  });

  it("refuses a customer cancel", async () => {
    const { client } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Customer cancellation",
        total_amount: 250,
      },
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 250,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: false, reason: "wrong_cancel_reason" });
  });

  it("refuses when the capture is not the full total", async () => {
    const { client } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Payment failed",
        total_amount: 250,
        wallet_amount: 0,
        gift_card_amount: 0,
      },
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 100,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: false, reason: "amount_not_full_card" });
  });

  it("refuses a booking that still carries a package entitlement", async () => {
    const { client } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Payment failed",
        total_amount: 250,
        wallet_amount: 0,
        gift_card_amount: 0,
        customer_package_entitlement_id: "ent-1",
      },
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 250,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: false, reason: "package_booking" });
  });

  it("refuses when the checkout used wallet value", async () => {
    const { client } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Payment failed",
        total_amount: 250,
        wallet_amount: 0,
        gift_card_amount: 0,
      },
      checkoutMetadata: { wallet_amount_applied: 50 },
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 250,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: false, reason: "split_tender_in_checkout" });
  });

  it("refuses when the slot is taken", async () => {
    vi.mocked(revalidateBookingSlotBeforePayment).mockResolvedValueOnce({
      ok: false,
      code: "SLOT_NO_LONGER_AVAILABLE",
      message: "taken",
    });
    const { client } = makeSupabase({
      booking: {
        id: "booking-1",
        status: "cancelled",
        cancellation_reason: "Payment failed",
        total_amount: 250,
        wallet_amount: 0,
        gift_card_amount: 0,
      },
    });

    const result = await revivePaymentFailedBooking(client as never, {
      bookingId: "booking-1",
      reference: "ref-1",
      amountMajor: 250,
      paymentProvider: "paystack",
    });

    expect(result).toEqual({ ok: false, reason: "SLOT_NO_LONGER_AVAILABLE" });
  });
});
