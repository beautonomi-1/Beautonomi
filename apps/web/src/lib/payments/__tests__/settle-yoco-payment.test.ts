import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const adminFromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    rpc: rpcMock,
    from: adminFromMock,
  }),
}));

vi.mock("@/lib/orders/record-product-order-payment", () => ({
  recordProductOrderPayment: vi.fn(async () => ({ ok: true })),
}));

import {
  resolveYocoSettleEntity,
  settleYocoPayment,
  reverseYocoSettlement,
} from "../settle-yoco-payment";
import { recordProductOrderPayment } from "@/lib/orders/record-product-order-payment";

function chain(result: { data?: unknown; error?: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of ["select", "eq", "in", "not", "maybeSingle", "single", "insert", "update", "limit"]) {
    api[m] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  api.single = vi.fn(async () => result);
  api.insert = vi.fn(async () => ({ ...result, error: result.error ?? null }));
  return api;
}

describe("resolveYocoSettleEntity", () => {
  it("prefers explicit entity_type/entity_id", () => {
    expect(
      resolveYocoSettleEntity({
        entity_type: "product_order",
        entity_id: "po-1",
        appointment_id: "b-1",
      }),
    ).toEqual({ entityType: "product_order", entityId: "po-1" });
  });

  it("falls back to appointment_id as booking", () => {
    expect(resolveYocoSettleEntity({ appointment_id: "b-1" })).toEqual({
      entityType: "booking",
      entityId: "b-1",
    });
  });

  it("resolves group_booking_id and additional_charge metadata", () => {
    expect(resolveYocoSettleEntity({ group_booking_id: "g-1" })).toEqual({
      entityType: "group_booking",
      entityId: "g-1",
    });
    expect(
      resolveYocoSettleEntity({
        metadata: { additional_charge_id: "c-1" },
      }),
    ).toEqual({ entityType: "additional_charge", entityId: "c-1" });
  });
});

describe("settleYocoPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
    // Admin client is used for the walk-in product-order delivery lookup;
    // return a chainable stub so the post-record lookup resolves to no order.
    adminFromMock.mockImplementation(() => chain({ data: null }));
  });

  it("settles booking base + tip with payment_provider yoco", async () => {
    const bookingPayments = chain({ data: null });
    const bookings = chain({
      data: {
        id: "booking-1",
        booking_number: "B1",
        payment_status: "pending",
        tenant_id: "tenant-1",
        status: "confirmed",
        total_amount: 100,
        total_paid: 0,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 0,
        tip_amount: 0,
        additional_charges: [],
      },
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") return bookingPayments;
        if (table === "bookings") return bookings;
        return chain({ data: null });
      }),
    } as never;

    const result = await settleYocoPayment(supabase, {
      paymentId: "yp-1",
      providerId: "provider-1",
      entityType: "booking",
      entityId: "booking-1",
      amount: 115,
      yocoPaymentId: "yoco-pay-1",
      tipAmount: 15,
    });

    expect(result.settled).toBe(true);
    const insertMock = bookingPayments.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      payment_provider: "yoco",
      payment_provider_id: "yoco-pay-1",
      amount: 100,
    });
    expect(insertMock.mock.calls[1][0]).toMatchObject({
      payment_provider: "yoco",
      payment_provider_id: "yoco-pay-1:tip",
      amount: 15,
    });
  });

  it("settles product orders as provider-collected yoco", async () => {
    const supabase = { from: vi.fn(() => chain({ data: null })) } as never;
    const result = await settleYocoPayment(supabase, {
      paymentId: "yp-2",
      providerId: "provider-1",
      entityType: "product_order",
      entityId: "order-1",
      amount: 50,
      yocoPaymentId: "yoco-po-1",
    });
    expect(result.settled).toBe(true);
    expect(recordProductOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        productOrderId: "order-1",
        provider: "yoco",
        source: "yoco_terminal",
        platformHeld: false,
      }),
    );
  });
});

describe("reverseYocoSettlement", () => {
  it("reverses tip after base and un-bumps tip totals", async () => {
    const refundInserts: Array<Record<string, unknown>> = [];
    const bookingUpdates: Array<Record<string, unknown>> = [];

    const bookingPayments = {
      select: vi.fn(() => bookingPayments),
      eq: vi.fn(() => bookingPayments),
      like: vi.fn(async () => ({
        data: [
          {
            id: "bp-tip",
            booking_id: "booking-1",
            amount: 15,
            status: "completed",
            payment_provider_id: "yoco-void:tip",
          },
          {
            id: "bp-base",
            booking_id: "booking-1",
            amount: 100,
            status: "completed",
            payment_provider_id: "yoco-void",
          },
        ],
        error: null,
      })),
    };

    const bookingRefunds = {
      select: vi.fn(() => bookingRefunds),
      eq: vi.fn(() => bookingRefunds),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        refundInserts.push(payload);
        return { error: null };
      }),
    };

    const bookings = {
      select: vi.fn(() => bookings),
      eq: vi.fn(() => bookings),
      maybeSingle: vi.fn(async () => ({
        data: { tip_amount: 15, total_amount: 115 },
        error: null,
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        bookingUpdates.push(payload);
        return { eq: vi.fn(async () => ({ error: null })) };
      }),
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") return bookingPayments;
        if (table === "booking_refunds") return bookingRefunds;
        if (table === "bookings") return bookings;
        return chain({ data: null });
      }),
    } as never;

    const result = await reverseYocoSettlement(supabase, {
      entityType: "booking",
      entityId: "booking-1",
      providerId: "provider-1",
      origProviderPaymentId: "yoco-void",
      voidReference: "void-1",
    });

    expect(result.reversed).toBe(true);
    expect(refundInserts.map((r) => r.payment_id)).toEqual(["bp-base", "bp-tip"]);
    expect(bookingUpdates[0]).toMatchObject({ tip_amount: 0, total_amount: 100 });
  });
});
