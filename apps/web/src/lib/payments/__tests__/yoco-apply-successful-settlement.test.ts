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
});
