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

vi.mock("@/lib/provider-sales/pos-product-stock", () => ({
  applyPosProductStockDecrements: vi.fn(async () => undefined),
}));

import { applyYocoSuccessfulSettlement } from "../yoco-apply-successful-settlement";
import { settleYocoPayment } from "../settle-yoco-payment";
import { applyPosProductStockDecrements } from "@/lib/provider-sales/pos-product-stock";

vi.mock("../settle-yoco-payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../settle-yoco-payment")>();
  return {
    ...actual,
    settleYocoPayment: vi.fn(async () => ({ settled: true })),
  };
});

function chain(result: { data?: unknown; error?: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  for (const m of ["select", "eq", "in", "not", "maybeSingle", "single", "insert", "update", "limit", "neq"]) {
    api[m] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  api.single = vi.fn(async () => result);
  return api;
}

describe("applyYocoSuccessfulSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminFromMock.mockImplementation(() => chain({ data: null, error: null }));
  });

  it("calls settleYocoPayment for booking entity (idempotent path)", async () => {
    const supabase = { from: vi.fn(() => chain({ data: null })) };
    await applyYocoSuccessfulSettlement(supabase as never, {
      yocoPaymentId: "yoco-pay-1",
      existingPayment: {
        id: "row-1",
        provider_id: "prov-1",
        appointment_id: "booking-1",
        amount: 5000,
      },
      metadata: { provider_id: "prov-1" },
      amountCents: 5000,
      currency: "ZAR",
    });
    expect(settleYocoPayment).toHaveBeenCalledTimes(1);
    expect(settleYocoPayment).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        yocoPaymentId: "yoco-pay-1",
        entityType: "booking",
        entityId: "booking-1",
      }),
    );
  });

  it("does not take product stock for a booking card sale", async () => {
    const supabase = {
      from: vi.fn(() =>
        chain({
          data: {
            id: "sale-1",
            payment_status: "pending",
            notes: "booking_collection:booking-1",
          },
        }),
      ),
    };
    await applyYocoSuccessfulSettlement(supabase as never, {
      yocoPaymentId: "yoco-pay-2",
      existingPayment: {
        id: "row-2",
        provider_id: "prov-1",
        appointment_id: "booking-1",
        sale_id: "sale-1",
        entity_type: "booking",
        entity_id: "booking-1",
        amount: 10000,
      },
      metadata: { provider_id: "prov-1", sale_id: "sale-1" },
      amountCents: 10000,
      currency: "ZAR",
    });
    expect(applyPosProductStockDecrements).not.toHaveBeenCalled();
    expect(settleYocoPayment).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        yocoPaymentId: "yoco-pay-2",
        entityType: "booking",
        entityId: "booking-1",
      }),
    );
  });

  it("marks a till sale paid when the card charge covers the sale", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sales") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "sale-1", payment_status: "pending", notes: null },
                  error: null,
                }),
              }),
            }),
            update: (payload: unknown) => {
              updates.push(payload);
              return { eq: () => ({ neq: async () => ({ error: null }) }) };
            },
          };
        }
        return chain({ data: [], error: null });
      }),
    };
    adminFromMock.mockImplementation((table: string) => {
      if (table === "sales") {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = vi.fn(self);
        api.eq = vi.fn(self);
        api.maybeSingle = vi.fn(async () => ({
          data: { total_amount: 100, payment_status: "pending" },
          error: null,
        }));
        return api;
      }
      if (table === "gift_card_redemptions") {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = vi.fn(self);
        api.eq = vi.fn(self);
        api.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        return api;
      }
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = vi.fn(self);
      api.in = vi.fn(self);
      api.eq = vi.fn(async () => ({
        data: table === "provider_yoco_payments"
          ? [{ sale_id: "sale-1", amount: 10000, refund_status: null }]
          : [],
        error: null,
      }));
      api.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return api;
    });

    await expect(
      applyYocoSuccessfulSettlement(supabase as never, {
        yocoPaymentId: "yoco-pay-full",
        existingPayment: {
          id: "row-full",
          provider_id: "prov-1",
          sale_id: "sale-1",
          entity_type: "sale",
          entity_id: "sale-1",
          amount: 10000,
        },
        metadata: { provider_id: "prov-1", sale_id: "sale-1" },
        amountCents: 10000,
        currency: "ZAR",
      }),
    ).resolves.toBeUndefined();
    expect(updates).toEqual([expect.objectContaining({ payment_status: "completed" })]);
  });

  it("does not mark a till sale paid when the card charge is less than the sale", async () => {
    const updates: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "sales") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "sale-1", payment_status: "pending", notes: null },
                  error: null,
                }),
              }),
            }),
            update: (payload: unknown) => {
              updates.push(payload);
              return { eq: () => ({ neq: async () => ({ error: null }) }) };
            },
          };
        }
        return chain({ data: [], error: null });
      }),
    };
    adminFromMock.mockImplementation((table: string) => {
      if (table === "sales") {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = vi.fn(self);
        api.eq = vi.fn(self);
        api.maybeSingle = vi.fn(async () => ({
          data: { total_amount: 100, payment_status: "pending" },
          error: null,
        }));
        return api;
      }
      const api: Record<string, unknown> = {};
      const self = () => api;
      api.select = vi.fn(self);
      api.in = vi.fn(self);
      api.eq = vi.fn(async () => ({
        data: table === "provider_yoco_payments"
          ? [{ sale_id: "sale-1", amount: 1000, refund_status: null }]
          : [],
        error: null,
      }));
      api.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return api;
    });

    await expect(
      applyYocoSuccessfulSettlement(supabase as never, {
        yocoPaymentId: "yoco-pay-short",
        existingPayment: {
          id: "row-3",
          provider_id: "prov-1",
          sale_id: "sale-1",
          entity_type: "sale",
          entity_id: "sale-1",
          amount: 1000,
        },
        metadata: { provider_id: "prov-1", sale_id: "sale-1" },
        amountCents: 1000,
        currency: "ZAR",
      }),
    ).rejects.toThrow(/does not cover sale/);
    expect(updates).toEqual([]);
  });
});
