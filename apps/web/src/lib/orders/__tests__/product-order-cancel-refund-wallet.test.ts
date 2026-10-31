import { describe, expect, it, vi } from "vitest";
import { applyProductOrderCancelRefundSideEffects } from "../product-order-lifecycle";

function makeClients(walletError: unknown) {
  const orderUpdates: Record<string, unknown>[] = [];
  const supabase = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        orderUpdates.push(payload);
        return chain;
      });
      chain.eq = vi.fn(async () => ({ error: null }));
      return chain;
    }),
  };
  const admin = {
    // No platform-held ledger rows: skips the ledger-reversal branch.
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data: [], error: null }));
      return chain;
    }),
    rpc: vi.fn(async () => ({ data: null, error: walletError })),
  };
  return { supabase, admin, orderUpdates };
}

const order = {
  id: "order-1",
  provider_id: "prov-1",
  payment_status: "paid",
  total_amount: 150,
  customer_id: "cust-1",
  currency: "ZAR",
  tenant_id: "tenant-1",
  order_number: "PO-1",
  gift_card_amount: 0,
};

describe("applyProductOrderCancelRefundSideEffects wallet credit on cancel", () => {
  it("marks the order refunded when the wallet credit succeeds", async () => {
    const { supabase, admin, orderUpdates } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      order,
      { newStatus: "cancelled", onlineRefundedAmount: 100 },
    );

    expect(out).toEqual({ walletCreditFailed: false });
    expect(admin.rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({
        p_amount: 50,
        p_idempotency_key: "product_order_cancel_refund:order-1",
      }),
    );
    expect(orderUpdates).toEqual([expect.objectContaining({ payment_status: "refunded" })]);
  });

  it("reports the failure and leaves payment_status paid when the wallet credit fails", async () => {
    const { supabase, admin, orderUpdates } = makeClients({ message: "wallet down" });

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      order,
      { newStatus: "cancelled", onlineRefundedAmount: 100 },
    );

    expect(out).toEqual({ walletCreditFailed: true });
    expect(orderUpdates).toEqual([]);
  });

  it("credits only the wallet leg when the rest was collected in cash", async () => {
    const { supabase, admin } = makeClients(null);

    await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "cash", wallet_amount: 40 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(admin.rpc).toHaveBeenCalledWith(
      "wallet_credit_admin",
      expect.objectContaining({ p_amount: 40 }),
    );
  });

  it("does not create a platform wallet credit for a cash-only order", async () => {
    const { supabase, admin } = makeClients(null);

    const out = await applyProductOrderCancelRefundSideEffects(
      supabase as never,
      admin as never,
      { ...order, payment_method: "cash", wallet_amount: 0, total_amount: 90 },
      { newStatus: "cancelled", onlineRefundedAmount: 0 },
    );

    expect(out).toEqual({ walletCreditFailed: false });
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
