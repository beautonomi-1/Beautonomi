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

import { settlePaycloudPayment } from "../settle-paycloud-payment";
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

describe("settlePaycloudPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it("settles unpaid add-ons via record_walk_in_additional_charge_payment when base already paid", async () => {
    const bookingPayments = chain({ data: null });
    const bookings = chain({
      data: {
        id: "booking-1",
        booking_number: "B1",
        payment_status: "paid",
        tenant_id: "tenant-1",
        status: "confirmed",
        total_amount: 100,
        total_paid: 100,
        total_refunded: 0,
        wallet_amount: 0,
        gift_card_amount: 0,
        additional_charges: [
          { id: "charge-1", amount: 25, status: "pending", description: "Add-on", currency: "ZAR" },
        ],
      },
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") return bookingPayments;
        if (table === "bookings") return bookings;
        return chain({ data: null });
      }),
    } as never;

    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-1",
      providerId: "provider-1",
      entityType: "booking",
      entityId: "booking-1",
      amount: 25,
      paycloudOrderId: "pc-order-1",
      merchantOrderNo: "BN123",
      processedBy: "user-1",
    });

    expect(result.settled).toBe(true);
    expect(result.bookingId).toBe("booking-1");
    expect(rpcMock).toHaveBeenCalledWith(
      "record_walk_in_additional_charge_payment",
      expect.objectContaining({
        p_booking_id: "booking-1",
        p_charge_id: "charge-1",
        p_payment_provider: "paycloud",
        p_payment_method: "card",
      }),
    );
  });

  it("settles additional_charge via RPC on additional_charges table only", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "additional_charges") {
        return chain({
          data: {
            id: "charge-1",
            booking_id: "booking-1",
            amount: 40,
            status: "pending",
            bookings: { provider_id: "provider-1", tenant_id: "tenant-1" },
          },
        });
      }
      return chain({ data: null });
    });

    const bookingPayments = chain({ data: null });
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") return bookingPayments;
        return chain({ data: null });
      }),
    } as never;

    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-2",
      providerId: "provider-1",
      entityType: "additional_charge",
      entityId: "charge-1",
      amount: 40,
      paycloudOrderId: "pc-order-2",
      merchantOrderNo: "BN456",
    });

    expect(result.settled).toBe(true);
    expect(result.bookingId).toBe("booking-1");
    expect(rpcMock).toHaveBeenCalledWith(
      "record_walk_in_additional_charge_payment",
      expect.objectContaining({
        p_charge_id: "charge-1",
        p_booking_id: "booking-1",
      }),
    );
  });

  it("settles product_order via recordProductOrderPayment", async () => {
    const supabase = { from: vi.fn() } as never;
    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-3",
      providerId: "provider-1",
      entityType: "product_order",
      entityId: "order-1",
      amount: 80,
      paycloudOrderId: "pc-order-3",
      merchantOrderNo: "BN789",
    });

    expect(result.settled).toBe(true);
    expect(recordProductOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        productOrderId: "order-1",
        source: "paycloud_terminal",
        provider: "paycloud",
        platformHeld: false,
      }),
    );
  });

  it("records a card-machine tip as its own payment row and bumps booking totals", async () => {
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

    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-tip",
      providerId: "provider-1",
      entityType: "booking",
      entityId: "booking-1",
      amount: 100,
      paycloudOrderId: "pc-order-tip",
      merchantOrderNo: "BNTIP",
      processedBy: "user-1",
      tipAmount: 15,
    });

    expect(result.settled).toBe(true);

    const insertMock = bookingPayments.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      amount: 100,
      payment_provider_id: "pc-order-tip",
    });
    expect(insertMock.mock.calls[1][0]).toMatchObject({
      amount: 15,
      payment_provider_id: "pc-order-tip:tip",
    });

    const updateMock = bookings.update as ReturnType<typeof vi.fn>;
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ tip_amount: 15, total_amount: 115 }),
    );
  });

  it("skips the tip when the base charge is not fully covered", async () => {
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

    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-under",
      providerId: "provider-1",
      entityType: "booking",
      entityId: "booking-1",
      amount: 50,
      paycloudOrderId: "pc-order-under",
      merchantOrderNo: "BNUNDER",
      tipAmount: 15,
    });

    expect(result.settled).toBe(true);
    const insertMock = bookingPayments.insert as ReturnType<typeof vi.fn>;
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ amount: 50 });
    expect(bookings.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("rejects invoice entity type", async () => {
    const supabase = { from: vi.fn() } as never;
    const result = await settlePaycloudPayment(supabase, {
      paymentId: "pay-4",
      providerId: "provider-1",
      entityType: "invoice" as never,
      entityId: "inv-1",
      amount: 10,
      paycloudOrderId: "pc-order-4",
      merchantOrderNo: "BN000",
    });
    expect(result.settled).toBe(false);
    expect(result.reason).toMatch(/Unsupported entity type/i);
  });
});
