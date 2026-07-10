import { describe, expect, it, vi } from "vitest";
import { computeAmountMatchStatus, computeExpectedAmountForEntity } from "../paycloud-amount-guards";

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
});

describe("computeExpectedAmountForEntity", () => {
  it("computes product_order wallet remainder and rejects appointment-linked orders", async () => {
    const productOrders = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
    };
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "product_orders") return productOrders;
        throw new Error(`unexpected table ${table}`);
      }),
    } as never;

    productOrders.maybeSingle.mockResolvedValueOnce({
      data: {
        total_amount: 120,
        wallet_amount: 20,
        currency: "ZAR",
        payment_status: "unpaid",
        status: "pending",
        order_source: "walk_in",
      },
    });
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-1"),
    ).resolves.toEqual({ amount: 100, currency: "ZAR" });

    productOrders.maybeSingle.mockResolvedValueOnce({
      data: {
        total_amount: 120,
        wallet_amount: 0,
        currency: "ZAR",
        payment_status: "unpaid",
        status: "pending",
        order_source: "appointment",
      },
    });
    await expect(
      computeExpectedAmountForEntity(supabase, "provider-1", "product_order", "order-2"),
    ).resolves.toBeNull();
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
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "additional_charges") return charges;
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
});
