import { describe, expect, it, vi } from "vitest";
import {
  computeAmountMatchStatus,
  computeExpectedAmountForEntity,
  paycloudTerminalTipAmount,
  yocoChargeMatchesExpected,
} from "../paycloud-amount-guards";
import { computePaycloudBookingChargeAmount } from "../paycloud-booking-charge";

describe("yocoChargeMatchesExpected", () => {
  it("accepts the balance, the deposit still due, or the balance plus a new tip", () => {
    expect(
      yocoChargeMatchesExpected({
        amount: 115,
        expectedAmount: 115,
        depositAmount: 50,
        serviceOutstanding: 115,
      }),
    ).toBe(true);
    expect(
      yocoChargeMatchesExpected({
        amount: 50,
        expectedAmount: 115,
        depositAmount: 50,
        serviceOutstanding: 115,
      }),
    ).toBe(true);
    expect(
      yocoChargeMatchesExpected({
        amount: 125,
        tipAmount: 10,
        expectedAmount: 115,
        depositAmount: null,
        serviceOutstanding: 115,
      }),
    ).toBe(true);
  });

  it("rejects an amount that is neither the balance nor the deposit", () => {
    expect(
      yocoChargeMatchesExpected({
        amount: 200,
        expectedAmount: 115,
        depositAmount: 50,
        serviceOutstanding: 115,
      }),
    ).toBe(false);
  });
});

describe("paycloudTerminalTipAmount", () => {
  it("charges a tip on a paid booking once", () => {
    expect(
      paycloudTerminalTipAmount({ chargeAmount: 10, tipAmount: 10, serviceOutstanding: 0 }),
    ).toBe(0);
  });

  it("keeps a tip on top of a service balance", () => {
    expect(
      paycloudTerminalTipAmount({ chargeAmount: 115, tipAmount: 10, serviceOutstanding: 115 }),
    ).toBe(10);
  });
});

describe("computeAmountMatchStatus", () => {
  it("returns exact within one cent tolerance", () => {
    expect(computeAmountMatchStatus(100, 100)).toBe("exact");
    expect(computeAmountMatchStatus(100, 100.005)).toBe("exact");
  });

  it("returns over when captured exceeds expected", () => {
    expect(computeAmountMatchStatus(100, 105)).toBe("over");
  });

  it("returns under when captured is materially below expected", () => {
    expect(computeAmountMatchStatus(100, 50)).toBe("under");
  });

  it("returns mismatch for small underpayment", () => {
    expect(computeAmountMatchStatus(100, 99.5)).toBe("mismatch");
  });

  it("treats captured = expected + authorized tip/cashback as exact, not over", () => {
    expect(computeAmountMatchStatus(100, 115, { tipAmount: 15 })).toBe("exact");
    expect(computeAmountMatchStatus(100, 120, { cashbackAmount: 20 })).toBe("exact");
    expect(computeAmountMatchStatus(100, 135, { tipAmount: 15, cashbackAmount: 20 })).toBe("exact");
    // Base-only report (order_amount without tip) is still exact.
    expect(computeAmountMatchStatus(100, 100, { tipAmount: 15 })).toBe("exact");
  });

  it("flags captures beyond expected + authorized extras as over", () => {
    expect(computeAmountMatchStatus(100, 140, { tipAmount: 15, cashbackAmount: 20 })).toBe("over");
    expect(computeAmountMatchStatus(100, 116, { tipAmount: 15 })).toBe("over");
  });
});

describe("computeExpectedAmountForEntity", () => {
  it("computes product_order wallet remainder and rejects appointment-linked orders", async () => {
    const productOrders = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    const paymentTransactions = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      filter: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_orders") return productOrders;
        if (table === "payment_transactions") return paymentTransactions;
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    let orderData: Record<string, unknown> = {
      total_amount: 120,
      wallet_amount: 20,
      currency: "ZAR",
      payment_status: "unpaid",
      status: "pending",
      order_source: "walk_in",
    };
    productOrders.maybeSingle.mockImplementation(async () => ({ data: orderData }));
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-1"),
    ).resolves.toEqual({ amount: 100, currency: "ZAR" });

    orderData = {
      total_amount: 120,
      wallet_amount: 20,
      gift_card_amount: 10,
      currency: "ZAR",
      payment_status: "unpaid",
      status: "pending",
      order_source: "online",
    };
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-gift"),
    ).resolves.toEqual({ amount: 90, currency: "ZAR" });

    orderData = {
      total_amount: 120,
      wallet_amount: 0,
      currency: "ZAR",
      payment_status: "unpaid",
      status: "pending",
      order_source: "appointment",
    };
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-2"),
    ).resolves.toBeNull();

    orderData = {
      total_amount: 100,
      wallet_amount: 0,
      gift_card_amount: 0,
      currency: "ZAR",
      payment_status: "unpaid",
      status: "pending",
      order_source: "walk_in",
    };
    paymentTransactions.filter.mockResolvedValueOnce({
      data: [{ amount: 60, reference: "card-1" }],
      error: null,
    });
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-partial"),
    ).resolves.toEqual({ amount: 40, currency: "ZAR" });
  });

  it("returns unpaid additional_charge amount with booking location", async () => {
    const charges = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "charge-1",
          amount: 35,
          currency: "ZAR",
          status: "pending",
          booking_id: "booking-1",
          bookings: { provider_id: "provider-1", location_id: "loc-1", currency: "ZAR" },
        },
      }),
    };
    const bookingPayments: Record<string, ReturnType<typeof vi.fn>> = {};
    const chain = () => bookingPayments;
    bookingPayments.select = vi.fn(chain);
    bookingPayments.eq = vi.fn(chain);
    bookingPayments.in = vi.fn(chain);
    (bookingPayments as { then?: (resolve: (value: { data: unknown[]; error: null }) => void) => void }).then =
      (resolve) => resolve({ data: [], error: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "additional_charges") return charges;
        if (table === "booking_payments") return bookingPayments;
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "additional_charge", "charge-1"),
    ).resolves.toEqual({
      amount: 35,
      currency: "ZAR",
      bookingLocationId: "loc-1",
    });
  });

  it("charges only the extra-charge remainder after a wallet hold", async () => {
    const charges = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "charge-1",
          amount: 100,
          currency: "ZAR",
          status: "pending",
          booking_id: "booking-1",
          bookings: { provider_id: "provider-1", location_id: "loc-1", currency: "ZAR" },
        },
      }),
    };
    const bookingPayments: Record<string, ReturnType<typeof vi.fn>> = {};
    const chain = () => bookingPayments;
    bookingPayments.select = vi.fn(chain);
    bookingPayments.eq = vi.fn(chain);
    bookingPayments.in = vi.fn(chain);
    (bookingPayments as { then?: (resolve: (value: { data: unknown[]; error: null }) => void) => void }).then =
      (resolve) =>
        resolve({
          data: [
            {
              amount: 40,
              payment_provider: "wallet",
              payment_provider_id: "wallet_booking:booking-1:additional:charge-1",
            },
          ],
          error: null,
        });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "additional_charges") return charges;
        if (table === "booking_payments") return bookingPayments;
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "additional_charge", "charge-1"),
    ).resolves.toEqual({
      amount: 60,
      currency: "ZAR",
      bookingLocationId: "loc-1",
    });
  });

  it("returns depositAmount when deposit is still outstanding", async () => {
    const bookings = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "booking-1",
          total_amount: 1000,
          total_paid: 0,
          total_refunded: 0,
          wallet_amount: 0,
          gift_card_amount: 0,
          currency: "ZAR",
          status: "pending_payment",
          location_id: "loc-1",
          deposit_required: true,
          deposit_amount: 300,
          payment_option: "deposit",
          additional_charges: [],
        },
      }),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bookings") return bookings;
        if (table === "booking_payments") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "booking", "booking-1"),
    ).resolves.toMatchObject({
      amount: 1000,
      depositAmount: 300,
      fullOutstanding: 1000,
      currency: "ZAR",
    });
  });
});

describe("computeExpectedAmountForEntity sale gift", () => {
  it("charges the card for the sale total minus a gift payment already stored", async () => {
    const sales = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { total_amount: 100, currency: "ZAR", payment_status: "pending" },
        error: null,
      }),
    };
    const salePayments = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ sale_id: "sale-1", amount: 40 }],
        error: null,
      }),
    };
    const redemptions = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ sale_id: "sale-1", status: "reserved" }],
        error: null,
      }),
    };
    const noCardPayments = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sales") return sales;
        if (table === "sale_payments") return salePayments;
        if (table === "gift_card_redemptions") return redemptions;
        if (table === "provider_yoco_payments" || table === "provider_paycloud_payments") {
          return noCardPayments;
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "sale", "sale-1"),
    ).resolves.toEqual({ amount: 60, currency: "ZAR" });
  });
});

describe("computePaycloudBookingChargeAmount", () => {
  it("does not charge a deposit that a reserved wallet already covers", () => {
    const quote = computePaycloudBookingChargeAmount({
      outstanding: 150,
      depositRequired: true,
      depositAmount: 50,
      totalPaid: 0,
      pendingWalletGiftAmount: 50,
    });
    expect(quote.depositAmount).toBeNull();
    expect(quote.chargeAmount).toBe(150);
  });

  it("charges only the deposit still short of a reserved wallet", () => {
    const quote = computePaycloudBookingChargeAmount({
      outstanding: 170,
      depositRequired: true,
      depositAmount: 50,
      totalPaid: 0,
      pendingWalletGiftAmount: 30,
    });
    expect(quote.depositAmount).toBe(20);
    expect(quote.chargeAmount).toBe(20);
  });
});
